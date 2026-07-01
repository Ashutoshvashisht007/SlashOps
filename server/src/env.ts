import "dotenv/config";
import { z } from "zod";

/**
 * Centralised, validated environment. Importing this module fails fast (and
 * loudly) if a required secret is missing, so we never boot half-configured.
 * Secrets live ONLY here — never logged, never sent to the client.
 */
/** Treat an empty env var ("") the same as unset — avoids optional fields
 *  (e.g. an empty DISCORD_MIRROR_WEBHOOK_URL) crashing boot on url() checks. */
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),

  DISCORD_APP_ID: z.string().min(1),
  DISCORD_PUBLIC_KEY: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_MIRROR_WEBHOOK_URL: z.preprocess(emptyToUndef, z.string().url().optional()),

  DATABASE_URL: z.string().min(1),

  GEMINI_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 chars"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(6),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
