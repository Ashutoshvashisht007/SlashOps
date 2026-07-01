import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  actionLog,
  commandConfigs,
  guilds,
  interactions,
  outbox,
} from "../db/schema";
import { withDefaults, type CommandRule } from "../discord/rules";
import { aiEnabled } from "../ai/gemini";

/**
 * Insert the interaction keyed by its Discord id. ON CONFLICT DO NOTHING means
 * a replayed/duplicate delivery inserts zero rows — that's our dedup signal.
 * Returns true only for the FIRST time we see an interaction id.
 */
export async function recordInteractionOnce(fields: {
  id: string;
  type: number;
  guildId?: string | null;
  channelId?: string | null;
  userId?: string | null;
  userName?: string | null;
  commandName?: string | null;
  inputText?: string | null;
}): Promise<boolean> {
  const inserted = await db
    .insert(interactions)
    .values({
      id: fields.id,
      type: fields.type,
      guildId: fields.guildId ?? null,
      channelId: fields.channelId ?? null,
      userId: fields.userId ?? null,
      userName: fields.userName ?? null,
      commandName: fields.commandName ?? null,
      inputText: fields.inputText ?? null,
      status: "received",
    })
    .onConflictDoNothing({ target: interactions.id })
    .returning({ id: interactions.id });
  return inserted.length > 0;
}

export interface ResolvedConfig {
  enabled: boolean;
  rule: Required<CommandRule>;
  source: "guild" | "global" | "default";
}

/** Resolve a command's effective config: guild override → global → built-in. */
export async function getMergedConfig(
  guildId: string | null | undefined,
  commandName: string,
): Promise<ResolvedConfig> {
  if (guildId) {
    const [guildRow] = await db
      .select()
      .from(commandConfigs)
      .where(and(eq(commandConfigs.guildId, guildId), eq(commandConfigs.commandName, commandName)))
      .limit(1);
    if (guildRow) {
      return {
        enabled: guildRow.enabled,
        rule: withDefaults(guildRow.rule as CommandRule),
        source: "guild",
      };
    }
  }
  const [globalRow] = await db
    .select()
    .from(commandConfigs)
    .where(and(isNull(commandConfigs.guildId), eq(commandConfigs.commandName, commandName)))
    .limit(1);
  if (globalRow) {
    return {
      enabled: globalRow.enabled,
      rule: withDefaults(globalRow.rule as CommandRule),
      source: "global",
    };
  }
  return { enabled: true, rule: withDefaults(null), source: "default" };
}

/** Make sure a guilds row exists so config + mirror settings can attach. */
export async function ensureGuild(guildId: string, name?: string): Promise<void> {
  await db
    .insert(guilds)
    .values({ id: guildId, name: name ?? "Unknown server" })
    .onConflictDoNothing({ target: guilds.id });
}

export async function getGuild(guildId: string) {
  const [row] = await db.select().from(guilds).where(eq(guilds.id, guildId)).limit(1);
  return row ?? null;
}

export async function enqueue(
  kind: string,
  interactionId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(outbox).values({ kind, interactionId, payload });
}

/**
 * Enqueue the reliable side-effects for a deferred interaction. Each is an
 * independent outbox job so a down AI never blocks the mirror and vice-versa.
 * The base reply ('process') always runs; AI/mirror depend on config.
 */
export async function enqueuePipeline(
  interactionId: string,
  token: string,
  rule: Required<CommandRule>,
): Promise<void> {
  await enqueue("process", interactionId, { token });
  if (rule.aiEnabled && aiEnabled) await enqueue("ai", interactionId, { token });
  if (rule.mirrorEnabled) await enqueue("mirror", interactionId, { token });
}

export async function logAction(entry: {
  guildId?: string | null;
  interactionId?: string | null;
  kind: string;
  level?: "info" | "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(actionLog).values({
    guildId: entry.guildId ?? null,
    interactionId: entry.interactionId ?? null,
    kind: entry.kind,
    level: entry.level ?? "info",
    message: entry.message,
    detail: entry.detail ?? null,
  });
}

/** Idempotency ledger: has a given action already happened for this interaction? */
export async function hasAction(interactionId: string, kind: string): Promise<boolean> {
  const [row] = await db
    .select({ id: actionLog.id })
    .from(actionLog)
    .where(and(eq(actionLog.interactionId, interactionId), eq(actionLog.kind, kind)))
    .limit(1);
  return Boolean(row);
}

export async function setAiResult(
  interactionId: string,
  summary: string,
  tags: string[],
): Promise<void> {
  await db
    .update(interactions)
    .set({ aiSummary: summary, aiTags: tags })
    .where(eq(interactions.id, interactionId));
}

export async function setRuleResult(
  interactionId: string,
  ruleResult: unknown,
  responseText: string,
): Promise<void> {
  await db
    .update(interactions)
    .set({ ruleResult, responseText })
    .where(eq(interactions.id, interactionId));
}

export async function markProcessed(interactionId: string): Promise<void> {
  await db
    .update(interactions)
    .set({ status: "processed", processedAt: sql`now()` })
    .where(eq(interactions.id, interactionId));
}

export async function getInteraction(interactionId: string) {
  const [row] = await db.select().from(interactions).where(eq(interactions.id, interactionId)).limit(1);
  return row ?? null;
}

/**
 * Seed a global (guildId = null) default config row per command, if missing.
 * Note: Postgres treats NULLs as distinct in unique indexes, so we can't lean
 * on ON CONFLICT for the null-guild rows — check existence explicitly.
 */
export async function ensureDefaultConfigs(commandNames: string[]): Promise<void> {
  for (const name of commandNames) {
    const [existing] = await db
      .select({ id: commandConfigs.id })
      .from(commandConfigs)
      .where(and(isNull(commandConfigs.guildId), eq(commandConfigs.commandName, name)))
      .limit(1);
    if (!existing) {
      await db
        .insert(commandConfigs)
        .values({ guildId: null, commandName: name, enabled: true, rule: {} });
    }
  }
}
