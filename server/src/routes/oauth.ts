import crypto from "node:crypto";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { guilds } from "../db/schema";
import { env } from "../env";
import { log } from "../lib/logger";
import { requireAuth } from "../auth";
import { fetchGuild } from "../discord/rest";

export const oauthRouter = Router();

// VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS
const BOT_PERMISSIONS = "19456";
const REDIRECT_URI = `${env.PUBLIC_BASE_URL}/api/connect/callback`;

/** Kick off "add the bot to a server" — admin picks a guild on Discord. */
oauthRouter.get("/start", requireAuth, (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session = { ...req.session, oauthState: state };
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", BOT_PERMISSIONS);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

/** Discord redirects back here with ?code, ?guild_id after the bot is added. */
oauthRouter.get("/callback", requireAuth, async (req, res) => {
  const { code, guild_id: guildId, state } = req.query as Record<string, string | undefined>;

  if (!state || state !== req.session?.oauthState) {
    res.status(400).send("Invalid OAuth state. Please restart the connect flow.");
    return;
  }
  req.session = { ...req.session, oauthState: undefined };

  if (!guildId) {
    res.status(400).send("No guild was authorised.");
    return;
  }

  // Complete the code exchange (best-effort; the bot is already in the guild).
  if (code) {
    try {
      await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
    } catch (err) {
      log.warn("oauth token exchange failed (non-fatal)", { err: String(err) });
    }
  }

  // Pull real guild metadata via the bot token and persist the connection.
  let name = "Connected server";
  let iconUrl: string | null = null;
  try {
    const g = await fetchGuild(guildId);
    name = g.name;
    if (g.icon) iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${g.icon}.png`;
  } catch (err) {
    log.warn("could not fetch guild metadata", { err: String(err) });
  }

  await db
    .insert(guilds)
    .values({ id: guildId, name, iconUrl, connectedByAdminId: req.session?.adminId ?? null })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name, iconUrl, updatedAt: sql`now()` },
    });

  log.info("guild connected", { guildId, name });
  res.redirect(`/?connected=${encodeURIComponent(guildId)}`);
});

/** Disconnect a server from the dashboard (does not remove the bot from Discord). */
oauthRouter.delete("/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "missing id" });
    return;
  }
  await db.delete(guilds).where(eq(guilds.id, id));
  res.json({ ok: true });
});
