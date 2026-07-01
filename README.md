# SlashOps — Discord Slash-Command Bot + Dashboard

SlashOps is a small but production-shaped product: a Discord bot that reacts to
slash commands via a **signed HTTP interactions endpoint** (no always-on
gateway socket), records every command, applies a configurable rule, replies in
Discord, and **mirrors a notification to a second Discord channel** — all fronted
by a login-gated, real-time admin dashboard.

It is built to run **unattended**: it verifies Discord's Ed25519 signature on
every request, dedupes replayed interactions, respects the ~3-second response
window by deferring slow work, and never loses a downstream call thanks to a
retrying outbox.

---

## What it does

| Piece | Detail |
|---|---|
| **Interactions endpoint** | `POST /interactions` — verifies Ed25519 signature, answers `PING` with `PONG`, routes commands / buttons / modals. |
| **Slash commands** | `/report` (opens a **modal**), `/echo <text>` (quick record + mirror), `/status` (ephemeral health). |
| **Rule engine** | Configurable per command, per server: reply template, keyword flagging, mirror on/off, AI on/off, ephemeral. |
| **Writes back to Discord** | Deferred reply → follow-up message with **Acknowledge / Escalate buttons**. |
| **Mirror** | Sends a rich embed to a **second Discord channel** (per-server webhook, or a global fallback). |
| **AI triage** (stretch) | Runs the command text through **Google Gemini** to produce a summary, tags, and severity — shown in the reply, the mirror, and the dashboard. |
| **Dashboard** (behind login) | Live command log, actions timeline, delivery-health/outbox view, and the command-rule editor. |
| **Multi-server** (stretch) | Each connected guild is isolated with its own config + mirror channel. |

### Reliability & security (the quality bar)
- **Forged / unsigned / replayed requests are rejected** with `401` before any work — Ed25519 verification over the raw request bytes, plus a timestamp replay guard.
- **Duplicate interactions are a no-op** — the Discord interaction id is the primary key; a replayed delivery inserts zero rows and enqueues nothing.
- **Slow work never blocks the 3s window** — AI + mirror run *after* a deferred acknowledgement, via follow-ups.
- **Downstream outages don't lose data** — every side-effect (reply, AI, mirror) is an **outbox** job with exponential backoff, independent retries, and a stale-job reclaim.
- **Secrets never leak** — validated only in `server/src/env.ts`, redacted in logs, and the mirror webhook URL is never returned to the browser (only a boolean `mirrorConfigured`).

---

## Architecture

```
client/  Vite + React + Tailwind v4 SPA (the dashboard)  ──build──▶ served by the server
server/  Express + TypeScript
  ├─ interactions/   signed endpoint, router, dedup + config service
  ├─ discord/        Ed25519 verify, protocol types, REST helpers, rule engine, command defs
  ├─ outbox/         worker (claim → dispatch → backoff) + per-kind dispatchers
  ├─ ai/             Gemini triage
  ├─ auth/           cookie session + seeded bcrypt admin
  ├─ routes/         /api/auth, /api (dashboard), /api/connect (OAuth)
  └─ db/             Postgres pool (Neon), Drizzle schema, idempotent bootstrap DDL
```

One Node process serves both the API/endpoint and the built SPA, so it deploys
as a single Render web service. Postgres (Neon) is the only external state.

**Data model:** `admins`, `guilds`, `command_configs` (global default + per-guild
override), `interactions` (id = Discord interaction id, for dedup), `outbox`
(reliable side-effects), `action_log` (human-readable actions incl. failures/retries).

---

## Run it locally

**Prerequisites:** Node ≥ 20, a Postgres URL (free [Neon](https://neon.tech)),
a Discord application, and (optionally) a Gemini API key.

```bash
git clone <your-repo-url> slashops && cd slashops
npm install

# configure the server
cp .env.example server/.env
#   → fill in the values (see "Environment" below)

# terminal 1 — API + interactions endpoint (also bootstraps the DB schema + admin on boot)
npm run dev:server        # http://localhost:3000

# terminal 2 — the dashboard (proxies /api + /interactions to :3000)
npm run dev:client        # http://localhost:5173
```

Then:
1. Open http://localhost:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Register the slash commands with Discord:
   ```bash
   npm run register                 # global (can take up to ~1h to appear)
   npm run register -- <GUILD_ID>   # single server, appears instantly (great for testing)
   ```
3. Expose the endpoint publicly so Discord can reach it (deploy, or use a tunnel
   like `cloudflared` / `ngrok` pointing at `:3000`), then set the endpoint URL
   in the Discord portal (see below). `localhost` will not work — Discord must
   reach it over the internet.

Production build locally:
```bash
npm run build && npm start        # serves the SPA + API from one process
```

---

## Environment

All configured in `server/.env` (see [`.env.example`](.env.example) — no real
secrets committed).

| Var | Where it comes from |
|---|---|
| `DISCORD_APP_ID` / `DISCORD_PUBLIC_KEY` | Discord Portal → your app → General Information |
| `DISCORD_BOT_TOKEN` | Discord Portal → Bot → Reset Token |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord Portal → OAuth2 |
| `DISCORD_MIRROR_WEBHOOK_URL` | A second channel → Integrations → Webhooks → New Webhook (fallback; per-server webhooks are set in the dashboard) |
| `DATABASE_URL` | Neon Postgres connection string |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) → Create API key (optional; AI triage is skipped if unset) |
| `GEMINI_MODEL` | defaults to `gemini-2.5-flash` |
| `PUBLIC_BASE_URL` | your deployed URL (used for the OAuth redirect) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the dashboard admin, seeded on boot |

---

## Deploy (Render + Discord)

This repo ships a [`render.yaml`](render.yaml) blueprint.

1. **Push to GitHub.**
2. **Render → New → Blueprint**, point it at the repo. Build `npm install && npm run build`, start `npm run start`, health check `/healthz`. (Free tier, no card.)
3. Add every environment variable in the Render dashboard (`SESSION_SECRET` is auto-generated). Set `PUBLIC_BASE_URL` to the Render URL.
4. First deploy auto-creates the DB schema and seeds the admin.
5. **Discord Portal → your app → General Information → Interactions Endpoint URL** = `https://<your-app>.onrender.com/interactions`, then **Save**. Discord sends a `PING`; a green save confirms signature verification is working.
6. **Discord Portal → OAuth2 → Redirects**: add `https://<your-app>.onrender.com/api/connect/callback`.
7. Register commands: run `npm run register` locally with the production `DISCORD_*` vars, or via a one-off Render shell.
8. In the dashboard, click **Connect a server** to add the bot to a guild and set that server's mirror channel.

> Note: Render's free tier sleeps on inactivity; the first request after idle
> wakes it. Discord's initial endpoint validation and normal traffic both wake it fine.

---

## How to test it

1. Sign in to the dashboard.
2. In Discord, run `/echo hello world` and `/report` (fill the modal). Include a
   keyword like `urgent` or `outage` to see the rule flag it.
3. Watch the **Live** tab: the interaction appears, gets an AI summary, flips to
   `processed`, and a mirror embed lands in the second channel.
4. Click **Acknowledge / Escalate** on the bot's reply — a follow-up mirror note
   appears and the dashboard logs the action.
5. Unhappy paths worth trying: POST junk to `/interactions` (→ `401`), or set an
   invalid mirror webhook and watch the outbox retry then surface the failure in
   **Delivery health**.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | server + client together (concurrently) |
| `npm run build` | build client then server |
| `npm start` | run the compiled server (serves SPA + API) |
| `npm run register [-- <guildId>]` | register slash commands (global or per-guild) |
| `npm run seed` | (re)seed the admin from env (also runs automatically on boot) |
