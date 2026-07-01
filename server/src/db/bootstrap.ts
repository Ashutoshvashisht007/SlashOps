import { pool } from "./index";
import { log } from "../lib/logger";

/**
 * Idempotent schema bootstrap. Runs on every boot with CREATE ... IF NOT
 * EXISTS, so a fresh Neon database becomes ready with zero manual migration
 * steps and re-deploys are safe. Kept in lock-step with db/schema.ts (which
 * provides the TypeScript types for the same tables).
 */
const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guilds (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL DEFAULT 'Unknown server',
  icon_url              TEXT,
  post_channel_id       TEXT,
  mirror_webhook_url    TEXT,
  connected_by_admin_id INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_configs (
  id           SERIAL PRIMARY KEY,
  guild_id     TEXT,
  command_name TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  rule         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS command_configs_guild_command_idx
  ON command_configs (guild_id, command_name);

CREATE TABLE IF NOT EXISTS interactions (
  id            TEXT PRIMARY KEY,
  type          INTEGER NOT NULL,
  guild_id      TEXT,
  channel_id    TEXT,
  user_id       TEXT,
  user_name     TEXT,
  command_name  TEXT,
  input_text    TEXT,
  rule_result   JSONB,
  ai_summary    TEXT,
  ai_tags       JSONB,
  status        TEXT NOT NULL DEFAULT 'received',
  response_text TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS interactions_guild_idx ON interactions (guild_id);
CREATE INDEX IF NOT EXISTS interactions_created_idx ON interactions (created_at);

CREATE TABLE IF NOT EXISTS outbox (
  id              SERIAL PRIMARY KEY,
  interaction_id  TEXT NOT NULL,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS action_log (
  id             SERIAL PRIMARY KEY,
  guild_id       TEXT,
  interaction_id TEXT,
  kind           TEXT NOT NULL,
  level          TEXT NOT NULL DEFAULT 'info',
  message        TEXT NOT NULL,
  detail         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_log_created_idx ON action_log (created_at);
`;

export async function bootstrapSchema(): Promise<void> {
  await pool.query(DDL);
  log.info("schema bootstrapped");
}
