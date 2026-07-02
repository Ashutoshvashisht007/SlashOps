import { env } from "../env";
import { log } from "../lib/logger";

const API = "https://discord.com/api/v10";

export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    /** When Discord said to come back (429s) — lets the outbox wait exactly
     *  that long instead of blindly re-entering the rate-limit window. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract Retry-After from headers (seconds) or a JSON body's retry_after. */
function parseRetryAfterMs(res: Response, bodyText: string): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
  try {
    const j = JSON.parse(bodyText) as { retry_after?: number };
    if (typeof j.retry_after === "number") return Math.ceil(j.retry_after * 1000);
  } catch {
    /* not JSON */
  }
  return undefined;
}

/**
 * fetch wrapper that respects a single 429 (rate limit) by waiting the
 * advertised retry_after and trying once more. Anything still failing throws a
 * DiscordApiError so the caller (usually the outbox worker) can retry later.
 */
async function discordFetch(
  path: string,
  init: RequestInit & { auth?: "bot" | "none" } = {},
): Promise<unknown> {
  const { auth = "bot", headers, ...rest } = init;
  const doFetch = () =>
    fetch(`${API}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(auth === "bot" ? { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } : {}),
        ...headers,
      },
    });

  let res = await doFetch();
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await sleep(Math.min(retryAfter, 5) * 1000);
    res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscordApiError(
      `Discord ${res.status} on ${path}`,
      res.status,
      body,
      res.status === 429 ? parseRetryAfterMs(res, body) : undefined,
    );
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Edit the original (deferred) interaction response. */
export function editOriginalResponse(token: string, body: unknown): Promise<unknown> {
  return discordFetch(`/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, {
    method: "PATCH",
    auth: "none", // interaction token authenticates this call
    body: JSON.stringify(body),
  });
}

/** Create a follow-up message on an interaction. */
export function createFollowup(token: string, body: unknown): Promise<unknown> {
  return discordFetch(`/webhooks/${env.DISCORD_APP_ID}/${token}`, {
    method: "POST",
    auth: "none",
    body: JSON.stringify(body),
  });
}

/** Post a normal message to a channel using the bot token. */
export function postToChannel(channelId: string, body: unknown): Promise<unknown> {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Send the mirror notification to a Discord channel webhook URL.
 * Rate-limit aware: a short 429 is absorbed in place; a long one throws with
 * retryAfterMs so the outbox schedules the next attempt for when Discord
 * actually wants us back (shared-IP hosts like Render inherit other tenants'
 * webhook rate limits, so these can run minutes long).
 */
export async function postToWebhook(webhookUrl: string, body: unknown): Promise<void> {
  const doFetch = () =>
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 429) {
    const text = await res.text().catch(() => "");
    const retryAfterMs = parseRetryAfterMs(res, text);
    if (retryAfterMs !== undefined && retryAfterMs <= 5_000) {
      await sleep(retryAfterMs);
      res = await doFetch();
    } else {
      throw new DiscordApiError("Webhook 429 (rate limited)", 429, text, retryAfterMs);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordApiError(
      `Webhook ${res.status}`,
      res.status,
      text,
      res.status === 429 ? parseRetryAfterMs(res, text) : undefined,
    );
  }
}

interface SlashCommandDef {
  name: string;
  description: string;
  type?: number;
  options?: unknown[];
}

/** Register (bulk overwrite) global application commands. */
export async function registerGlobalCommands(commands: SlashCommandDef[]): Promise<void> {
  await discordFetch(`/applications/${env.DISCORD_APP_ID}/commands`, {
    method: "PUT",
    body: JSON.stringify(commands),
  });
  log.info("registered global commands", { count: commands.length });
}

/** Register commands to ONE guild — propagates instantly (great for testing). */
export async function registerGuildCommands(
  guildId: string,
  commands: SlashCommandDef[],
): Promise<void> {
  await discordFetch(`/applications/${env.DISCORD_APP_ID}/guilds/${guildId}/commands`, {
    method: "PUT",
    body: JSON.stringify(commands),
  });
  log.info("registered guild commands", { guildId, count: commands.length });
}

/** Fetch basic guild metadata (name/icon) for the connect flow. */
export async function fetchGuild(guildId: string): Promise<{ name: string; icon?: string }> {
  const g = (await discordFetch(`/guilds/${guildId}`)) as { name: string; icon?: string };
  return g;
}
