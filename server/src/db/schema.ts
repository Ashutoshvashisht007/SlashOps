import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Dashboard admins. Seeded from ADMIN_EMAIL/ADMIN_PASSWORD on boot. */
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A connected Discord server (guild). Multi-server: every guild is isolated
 * and carries its own mirror target + posting channel.
 */
export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(), // Discord guild snowflake
  name: text("name").notNull().default("Unknown server"),
  iconUrl: text("icon_url"),
  // Where the bot posts public messages (optional; falls back to the channel
  // the command was invoked in).
  postChannelId: text("post_channel_id"),
  // Per-server mirror webhook (a second Discord channel). Secret-ish → never
  // returned verbatim to the client, only a boolean "configured" flag.
  mirrorWebhookUrl: text("mirror_webhook_url"),
  connectedByAdminId: integer("connected_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-command behaviour. A row with guildId = null is the global default that
 * a guild inherits until it overrides it. `rule` is the configurable rule the
 * admin edits in the dashboard.
 */
export const commandConfigs = pgTable(
  "command_configs",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id"), // null = global default
    commandName: text("command_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // { replyTemplate, mirrorEnabled, aiEnabled, flagKeywords: string[],
    //   flagLabel, ephemeral }
    rule: jsonb("rule").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byGuildCommand: uniqueIndex("command_configs_guild_command_idx").on(
      t.guildId,
      t.commandName,
    ),
  }),
);

/**
 * Every interaction we've handled. The Discord interaction id is the PRIMARY
 * KEY, which is exactly what makes replayed/duplicate deliveries a no-op:
 * inserting with ON CONFLICT DO NOTHING tells us instantly if we've seen it.
 */
export const interactions = pgTable(
  "interactions",
  {
    id: text("id").primaryKey(), // Discord interaction snowflake
    type: integer("type").notNull(), // 2 = command, 3 = component, 5 = modal
    guildId: text("guild_id"),
    channelId: text("channel_id"),
    userId: text("user_id"),
    userName: text("user_name"),
    commandName: text("command_name"),
    inputText: text("input_text"),
    // Rule engine output: { flagged, label, reason }
    ruleResult: jsonb("rule_result"),
    aiSummary: text("ai_summary"),
    aiTags: jsonb("ai_tags"), // string[]
    // received → processing → processed | failed
    status: text("status").notNull().default("received"),
    responseText: text("response_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    byGuild: index("interactions_guild_idx").on(t.guildId),
    byCreated: index("interactions_created_idx").on(t.createdAt),
  }),
);

/**
 * Reliable side-effects. Anything that can fail transiently (mirror post, AI
 * call, deferred follow-up) is enqueued here and drained by a worker with
 * exponential backoff, so a briefly-down downstream never loses an interaction.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    interactionId: text("interaction_id").notNull(),
    kind: text("kind").notNull(), // 'ai' | 'mirror' | 'followup'
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"), // pending|processing|done|failed
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dueIdx: index("outbox_due_idx").on(t.status, t.nextAttemptAt),
  }),
);

/** Human-readable timeline of actions the bot took (dashboard "actions"). */
export const actionLog = pgTable(
  "action_log",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id"),
    interactionId: text("interaction_id"),
    kind: text("kind").notNull(), // discord_reply | mirror_sent | ai_triaged | *_failed | retry
    level: text("level").notNull().default("info"), // info | warn | error
    message: text("message").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCreated: index("action_log_created_idx").on(t.createdAt),
  }),
);
