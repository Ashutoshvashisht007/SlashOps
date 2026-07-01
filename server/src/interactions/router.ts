import type { Request, Response } from "express";
import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { interactions as interactionsTable } from "../db/schema";
import { log } from "../lib/logger";
import { verifyDiscordRequest } from "../discord/verify";
import {
  InteractionType,
  InteractionResponseType,
  MessageFlags,
  ButtonStyle,
  ComponentType,
  interactionUser,
  type Interaction,
} from "../discord/types";
import {
  REPORT_MODAL_ID,
  REPORT_INPUT_TITLE,
  REPORT_INPUT_DETAILS,
  BTN_ACK,
  BTN_ESCALATE,
  reportModal,
} from "../discord/commands";
import {
  ensureGuild,
  enqueue,
  enqueuePipeline,
  getMergedConfig,
  logAction,
  recordInteractionOnce,
} from "./service";

function ephemeral(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: MessageFlags.EPHEMERAL },
  };
}

/**
 * The single public interactions endpoint. Mounted with a raw-body parser so
 * we can verify the Ed25519 signature over the exact bytes Discord sent.
 */
export async function interactionsHandler(req: Request, res: Response): Promise<void> {
  const raw = req.body as Buffer;
  const signature = req.header("X-Signature-Ed25519");
  const timestamp = req.header("X-Signature-Timestamp");

  // 1) Signature gate — forged/replayed/unsigned requests never get further.
  if (!Buffer.isBuffer(raw) || !verifyDiscordRequest(raw, signature, timestamp)) {
    log.warn("rejected interaction: bad signature", { hasSig: Boolean(signature) });
    res.status(401).send("invalid request signature");
    return;
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(raw.toString("utf8")) as Interaction;
  } catch {
    res.status(400).send("invalid json");
    return;
  }

  // 2) PING → PONG (Discord uses this to validate the endpoint on save).
  if (interaction.type === InteractionType.PING) {
    res.json({ type: InteractionResponseType.PONG });
    return;
  }

  try {
    switch (interaction.type) {
      case InteractionType.APPLICATION_COMMAND:
        await handleCommand(interaction, res);
        return;
      case InteractionType.MESSAGE_COMPONENT:
        await handleComponent(interaction, res);
        return;
      case InteractionType.MODAL_SUBMIT:
        await handleModal(interaction, res);
        return;
      default:
        res.json(ephemeral("Unsupported interaction type."));
        return;
    }
  } catch (err) {
    // Never leave Discord hanging: fall back to a visible ephemeral error.
    log.error("interaction handler threw", { err: String(err), id: interaction.id });
    if (!res.headersSent) {
      res.json(ephemeral("⚠️ SlashOps hit a snag handling that. Please try again."));
    }
  }
}

async function handleCommand(interaction: Interaction, res: Response): Promise<void> {
  const name = interaction.data?.name ?? "";
  const user = interactionUser(interaction);
  const guildId = interaction.guild_id ?? null;
  if (guildId) await ensureGuild(guildId);

  const config = await getMergedConfig(guildId, name);

  if (name === "status") {
    await recordInteractionOnce({
      id: interaction.id,
      type: interaction.type,
      guildId,
      channelId: interaction.channel_id,
      userId: user?.id,
      userName: user?.username,
      commandName: name,
    });
    const [row] = guildId
      ? await db
          .select({ c: count() })
          .from(interactionsTable)
          .where(eq(interactionsTable.guildId, guildId))
      : [{ c: 0 }];
    res.json(
      ephemeral(
        [
          "**SlashOps status**",
          `• Server: ${guildId ? `connected (\`${guildId}\`)` : "DM / no guild"}`,
          `• Interactions recorded here: **${row?.c ?? 0}**`,
          `• Config source: **${config.source}**`,
          `• AI triage: ${config.rule.aiEnabled ? "on" : "off"} · Mirror: ${
            config.rule.mirrorEnabled ? "on" : "off"
          }`,
        ].join("\n"),
      ),
    );
    return;
  }

  if (!config.enabled) {
    await recordInteractionOnce({
      id: interaction.id,
      type: interaction.type,
      guildId,
      channelId: interaction.channel_id,
      userId: user?.id,
      userName: user?.username,
      commandName: name,
    });
    res.json(ephemeral(`\`/${name}\` is currently disabled by an admin.`));
    return;
  }

  if (name === "report") {
    // Record the command, then open the modal. The real work happens on submit.
    await recordInteractionOnce({
      id: interaction.id,
      type: interaction.type,
      guildId,
      channelId: interaction.channel_id,
      userId: user?.id,
      userName: user?.username,
      commandName: name,
    });
    res.json({ type: InteractionResponseType.MODAL, data: reportModal() });
    return;
  }

  if (name === "echo") {
    const text = String(
      interaction.data?.options?.find((o) => o.name === "text")?.value ?? "",
    ).trim();

    const isNew = await recordInteractionOnce({
      id: interaction.id,
      type: interaction.type,
      guildId,
      channelId: interaction.channel_id,
      userId: user?.id,
      userName: user?.username,
      commandName: name,
      inputText: text,
    });

    if (isNew) {
      await enqueuePipeline(interaction.id, interaction.token, config.rule);
    } else {
      log.info("duplicate interaction ignored", { id: interaction.id });
    }

    // Defer: AI + mirror are slow, so acknowledge now and follow up.
    res.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: config.rule.ephemeral ? { flags: MessageFlags.EPHEMERAL } : {},
    });
    return;
  }

  res.json(ephemeral(`Unknown command \`/${name}\`.`));
}

async function handleModal(interaction: Interaction, res: Response): Promise<void> {
  const customId = interaction.data?.custom_id ?? "";
  if (customId !== REPORT_MODAL_ID) {
    res.json(ephemeral("Unrecognised form."));
    return;
  }

  const user = interactionUser(interaction);
  const guildId = interaction.guild_id ?? null;
  const fields = new Map<string, string>();
  for (const row of interaction.data?.components ?? []) {
    for (const c of row.components) fields.set(c.custom_id, c.value);
  }
  const title = (fields.get(REPORT_INPUT_TITLE) ?? "").trim();
  const details = (fields.get(REPORT_INPUT_DETAILS) ?? "").trim();
  const text = details ? `${title}\n\n${details}` : title;

  if (guildId) await ensureGuild(guildId);
  const config = await getMergedConfig(guildId, "report");

  const isNew = await recordInteractionOnce({
    id: interaction.id,
    type: interaction.type,
    guildId,
    channelId: interaction.channel_id,
    userId: user?.id,
    userName: user?.username,
    commandName: "report",
    inputText: text,
  });

  if (isNew) {
    await enqueuePipeline(interaction.id, interaction.token, config.rule);
  }

  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: config.rule.ephemeral ? { flags: MessageFlags.EPHEMERAL } : {},
  });
}

async function handleComponent(interaction: Interaction, res: Response): Promise<void> {
  const customId = interaction.data?.custom_id ?? "";
  const [action, targetId] = customId.split(":");
  const user = interactionUser(interaction);
  const guildId = interaction.guild_id ?? null;

  // Dedup the click itself so a double-tap / redelivery only acts once.
  const isNew = await recordInteractionOnce({
    id: interaction.id,
    type: interaction.type,
    guildId,
    channelId: interaction.channel_id,
    userId: user?.id,
    userName: user?.username,
    commandName: `button:${action}`,
    inputText: targetId ?? null,
  });

  const actor = user?.global_name || user?.username || "someone";
  const verb = action === BTN_ESCALATE ? "🚨 Escalated" : "✅ Acknowledged";

  if (isNew && targetId) {
    // Mirror the follow-up action reliably, off the 3s hot path.
    await enqueue("note", targetId, {
      guildId,
      message: `${verb} by ${actor}`,
      escalate: action === BTN_ESCALATE,
    });
    await logAction({
      guildId,
      interactionId: targetId,
      kind: action === BTN_ESCALATE ? "escalated" : "acknowledged",
      message: `${verb} by ${actor}`,
    });
  }

  // Update the original message in place: reflect the new state, disable buttons.
  res.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      components: [
        {
          type: ComponentType.ACTION_ROW,
          components: [
            {
              type: ComponentType.BUTTON,
              style: ButtonStyle.SECONDARY,
              label: `${verb} by ${actor}`,
              custom_id: `done:${targetId ?? "x"}`,
              disabled: true,
            },
          ],
        },
      ],
    },
  });
}
