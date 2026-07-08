import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  actionLog,
  commandConfigs,
  guilds,
  interactions,
  outbox,
} from "../db/schema";
import { requireAuth } from "../auth";
import { COMMAND_DEFS } from "../discord/commands";
import { DEFAULT_RULE } from "../discord/rules";

export const apiRouter = Router();
apiRouter.use(requireAuth);

/** Headline metrics for the dashboard hero. */
apiRouter.get("/stats", async (_req, res) => {
  const [[total], [processed], [failed], [mirrors], [guildCount]] = await Promise.all([
    db.select({ c: count() }).from(interactions),
    db.select({ c: count() }).from(interactions).where(eq(interactions.status, "processed")),
    db.select({ c: count() }).from(outbox).where(eq(outbox.status, "failed")),
    db.select({ c: count() }).from(actionLog).where(eq(actionLog.kind, "mirror_sent")),
    db.select({ c: count() }).from(guilds),
  ]);
  res.json({
    interactions: total?.c ?? 0,
    processed: processed?.c ?? 0,
    failures: failed?.c ?? 0,
    mirrors: mirrors?.c ?? 0,
    servers: guildCount?.c ?? 0,
  });
});

/** Live command log (most recent first), optionally scoped to a server. */
apiRouter.get("/interactions", async (req, res) => {
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : null;
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const where = guildId ? eq(interactions.guildId, guildId) : undefined;
  const rows = await db
    .select()
    .from(interactions)
    .where(where)
    .orderBy(desc(interactions.createdAt))
    .limit(limit);
  res.json(rows);
});

/** Actions timeline — what the bot actually did, incl. failures + retries. */
apiRouter.get("/actions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 60) || 60, 200);
  const rows = await db
    .select()
    .from(actionLog)
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
  res.json(rows);
});

/** Outbox view for observability (retries/failures). Payload token stripped. */
apiRouter.get("/outbox", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const rows = await db
    .select({
      id: outbox.id,
      kind: outbox.kind,
      interactionId: outbox.interactionId,
      status: outbox.status,
      attempts: outbox.attempts,
      maxAttempts: outbox.maxAttempts,
      nextAttemptAt: outbox.nextAttemptAt,
      lastError: outbox.lastError,
      createdAt: outbox.createdAt,
    })
    .from(outbox)
    .where(status ? eq(outbox.status, status) : undefined)
    .orderBy(desc(outbox.createdAt))
    .limit(100);
  res.json(rows);
});

/** Connected servers. Never leaks the mirror webhook URL — only a boolean. */
apiRouter.get("/guilds", async (_req, res) => {
  const rows = await db.select().from(guilds).orderBy(desc(guilds.createdAt));
  res.json(
    rows.map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: g.iconUrl,
      postChannelId: g.postChannelId,
      mirrorConfigured: Boolean(g.mirrorWebhookUrl),
      createdAt: g.createdAt,
    })),
  );
});

const guildPatch = z.object({
  postChannelId: z.string().trim().max(40).optional().nullable(),
  mirrorWebhookUrl: z
    .string()
    .url()
    .refine((u) => u.includes("discord.com/api/webhooks"), "must be a Discord webhook URL")
    .optional()
    .nullable(),
});

apiRouter.patch("/guilds/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "missing id" });
    return;
  }
  const parsed = guildPatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    return;
  }
  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (parsed.data.postChannelId !== undefined) set.postChannelId = parsed.data.postChannelId || null;
  if (parsed.data.mirrorWebhookUrl !== undefined)
    set.mirrorWebhookUrl = parsed.data.mirrorWebhookUrl || null;
  await db.update(guilds).set(set).where(eq(guilds.id, id));
  res.json({ ok: true });
});

/** Command catalogue + the default rule shape (for the config editor). */
apiRouter.get("/commands", (_req, res) => {
  res.json({
    commands: COMMAND_DEFS.map((c) => ({ name: c.name, description: c.description })),
    defaultRule: DEFAULT_RULE,
  });
});

/** Effective config rows. guildId query param scopes to a server (or global). */
apiRouter.get("/configs", async (req, res) => {
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : null;
  const rows = await db
    .select()
    .from(commandConfigs)
    .where(guildId ? eq(commandConfigs.guildId, guildId) : isNull(commandConfigs.guildId));
  res.json(rows);
});

const configUpsert = z.object({
  guildId: z.string().nullable().optional(),
  commandName: z.string().min(1),
  enabled: z.boolean().optional(),
  rule: z
    .object({
      replyTemplate: z.string().max(500).optional(),
      ephemeral: z.boolean().optional(),
      mirrorEnabled: z.boolean().optional(),
      aiEnabled: z.boolean().optional(),
      flagKeywords: z.array(z.string().max(40)).max(30).optional(),
      flagLabel: z.string().max(40).optional(),
      requiredRoleId: z.string().trim().max(40).optional(),
    })
    .optional(),
});

apiRouter.put("/configs", async (req, res) => {
  const parsed = configUpsert.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid config" });
    return;
  }
  const { guildId = null, commandName, enabled, rule } = parsed.data;

  // Upsert on the (guildId, commandName) unique index. Null guildId = global.
  const existing = await db
    .select()
    .from(commandConfigs)
    .where(
      and(
        guildId ? eq(commandConfigs.guildId, guildId) : isNull(commandConfigs.guildId),
        eq(commandConfigs.commandName, commandName),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(commandConfigs)
      .set({
        enabled: enabled ?? existing[0].enabled,
        rule: rule ? { ...(existing[0].rule as object), ...rule } : existing[0].rule,
        updatedAt: sql`now()`,
      })
      .where(eq(commandConfigs.id, existing[0].id));
  } else {
    await db.insert(commandConfigs).values({
      guildId,
      commandName,
      enabled: enabled ?? true,
      rule: rule ?? {},
    });
  }
  res.json({ ok: true });
});
