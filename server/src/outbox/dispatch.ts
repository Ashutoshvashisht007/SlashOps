import { env } from "../env";
import { log } from "../lib/logger";
import { triage } from "../ai/gemini";
import { actionButtons } from "../discord/commands";
import { editOriginalResponse, postToWebhook } from "../discord/rest";
import { evaluateRule, renderTemplate, type CommandRule } from "../discord/rules";
import {
  getGuild,
  getInteraction,
  getMergedConfig,
  hasAction,
  logAction,
  markProcessed,
  setAiResult,
  setRuleResult,
} from "../interactions/service";

interface Job {
  id: number;
  kind: string;
  interactionId: string;
  attempts: number;
  payload: Record<string, unknown>;
}

type InteractionRow = NonNullable<Awaited<ReturnType<typeof getInteraction>>>;

const SEVERITY_COLOR: Record<string, number> = {
  low: 0x64748b, // slate
  medium: 0xf59e0b, // amber
  high: 0xef4444, // red
};

function commandLabel(row: InteractionRow): string {
  return row.commandName?.startsWith("button:")
    ? row.commandName
    : `/${row.commandName ?? "command"}`;
}

function buildReplyContent(row: InteractionRow, rule: Required<CommandRule>): string {
  const evalResult = (row.ruleResult as { label?: string | null } | null) ?? null;
  const base = renderTemplate(rule.replyTemplate, {
    command: commandLabel(row),
    user: row.userName ?? "you",
    input: row.inputText ?? "",
    label: evalResult?.label ?? null,
  });
  const lines = [base];
  if (row.inputText) lines.push(`> ${row.inputText.replace(/\n/g, "\n> ").slice(0, 300)}`);
  if (row.aiSummary) {
    const tags = (row.aiTags as string[] | null) ?? [];
    lines.push(`\n🧠 **AI triage:** ${row.aiSummary}`);
    if (tags.length) lines.push(`🏷️ ${tags.map((t) => `\`${t}\``).join(" ")}`);
  }
  return lines.join("\n");
}

/** Dispatch a single outbox job. Throwing schedules a retry with backoff. */
export async function dispatch(job: Job): Promise<void> {
  switch (job.kind) {
    case "process":
      return dispatchProcess(job);
    case "ai":
      return dispatchAi(job);
    case "mirror":
      return dispatchMirror(job);
    case "note":
      return dispatchNote(job);
    default:
      log.warn("unknown outbox kind", { kind: job.kind });
  }
}

/** Base reply: evaluate the rule, edit the deferred response, attach buttons. */
async function dispatchProcess(job: Job): Promise<void> {
  const row = await getInteraction(job.interactionId);
  if (!row) return;
  const token = String(job.payload.token ?? "");
  const config = await getMergedConfig(row.guildId, row.commandName ?? "");
  const ruleResult = evaluateRule(config.rule, row.inputText ?? "");

  const content = buildReplyContent({ ...row, ruleResult }, config.rule);
  await setRuleResult(job.interactionId, ruleResult, content);

  if (!(await hasAction(job.interactionId, "discord_reply"))) {
    await editOriginalResponse(token, {
      content,
      components: actionButtons(job.interactionId),
    });
    await logAction({
      guildId: row.guildId,
      interactionId: job.interactionId,
      kind: "discord_reply",
      message: `Replied in Discord to ${commandLabel(row)}`,
      detail: { flagged: ruleResult.flagged, label: ruleResult.label },
    });
  }
  await markProcessed(job.interactionId);
}

/** AI triage: summarise/tag, store, then enrich the reply in place. */
async function dispatchAi(job: Job): Promise<void> {
  const row = await getInteraction(job.interactionId);
  if (!row || !row.inputText) return;
  const token = String(job.payload.token ?? "");

  if (!row.aiSummary) {
    const result = await triage(row.inputText); // throws → retry
    await setAiResult(job.interactionId, result.summary, result.tags);
    await logAction({
      guildId: row.guildId,
      interactionId: job.interactionId,
      kind: "ai_triaged",
      message: `AI triage: ${result.severity} · ${result.summary}`,
      detail: { severity: result.severity, tags: result.tags },
    });
  }

  // Re-render the reply now that AI data exists (best-effort, guarded once).
  if (!(await hasAction(job.interactionId, "ai_reply"))) {
    const fresh = await getInteraction(job.interactionId);
    if (fresh) {
      const config = await getMergedConfig(fresh.guildId, fresh.commandName ?? "");
      await editOriginalResponse(token, {
        content: buildReplyContent(fresh, config.rule),
        components: actionButtons(job.interactionId),
      });
      await logAction({
        guildId: fresh.guildId,
        interactionId: job.interactionId,
        kind: "ai_reply",
        message: "Enriched Discord reply with AI triage",
      });
    }
  }
}

/** Mirror a notification to the second Discord channel (per-guild webhook). */
async function dispatchMirror(job: Job): Promise<void> {
  const row = await getInteraction(job.interactionId);
  if (!row) return;
  if (await hasAction(job.interactionId, "mirror_sent")) return;

  const guild = row.guildId ? await getGuild(row.guildId) : null;
  const webhookUrl = guild?.mirrorWebhookUrl ?? env.DISCORD_MIRROR_WEBHOOK_URL;
  if (!webhookUrl) {
    await logAction({
      guildId: row.guildId,
      interactionId: job.interactionId,
      kind: "mirror_skipped",
      level: "warn",
      message: "No mirror webhook configured for this server — skipped.",
    });
    return; // nothing to retry toward
  }

  // Give AI a few tries to land so the mirror is enriched, but never block forever.
  const config = await getMergedConfig(row.guildId, row.commandName ?? "");
  if (config.rule.aiEnabled && !row.aiSummary && job.attempts < 3) {
    throw new Error("waiting for AI triage before mirroring");
  }

  const ruleResult = (row.ruleResult as { flagged?: boolean; label?: string | null } | null) ?? null;
  const severity = ruleResult?.flagged ? "medium" : "low";
  const tags = (row.aiTags as string[] | null) ?? [];

  await postToWebhook(webhookUrl, {
    username: "SlashOps Mirror",
    embeds: [
      {
        title: `New ${commandLabel(row)} from ${row.userName ?? "user"}`,
        description: (row.inputText ?? "(no text)").slice(0, 1500),
        color: SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.low,
        fields: [
          { name: "Server", value: row.guildId ?? "—", inline: true },
          {
            name: "Rule",
            value: ruleResult?.flagged ? `⚠️ ${ruleResult.label}` : "routine",
            inline: true,
          },
          ...(row.aiSummary ? [{ name: "AI summary", value: row.aiSummary }] : []),
          ...(tags.length ? [{ name: "Tags", value: tags.join(", "), inline: true }] : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });

  await logAction({
    guildId: row.guildId,
    interactionId: job.interactionId,
    kind: "mirror_sent",
    message: "Mirrored notification to the second channel",
  });
}

/** A short follow-up note to the mirror channel (button ack/escalate). */
async function dispatchNote(job: Job): Promise<void> {
  const guildId = (job.payload.guildId as string | null) ?? null;
  const message = String(job.payload.message ?? "Action taken");
  const escalate = Boolean(job.payload.escalate);

  const guild = guildId ? await getGuild(guildId) : null;
  const webhookUrl = guild?.mirrorWebhookUrl ?? env.DISCORD_MIRROR_WEBHOOK_URL;
  if (!webhookUrl) return;

  await postToWebhook(webhookUrl, {
    username: "SlashOps Mirror",
    embeds: [
      {
        title: escalate ? "🚨 Escalation" : "✅ Acknowledgement",
        description: message,
        color: escalate ? SEVERITY_COLOR.high : 0x22c55e,
        fields: [{ name: "Ref", value: job.interactionId, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
