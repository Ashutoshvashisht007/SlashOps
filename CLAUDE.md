# CLAUDE.md — working agreement for this repo

Context for AI assistants (and humans) working on SlashOps. Keep this current.

## What this is
A Discord slash-command bot + admin dashboard. Node/TypeScript monorepo with npm
workspaces: `server/` (Express API + Discord interactions endpoint) and
`client/` (Vite + React + Tailwind dashboard). Postgres (Neon) is the only
external datastore. Deploys as one Render web service that serves both.

## Non-negotiable invariants
These encode the product's quality bar. Do not regress them.

1. **Verify every interaction.** `POST /interactions` must Ed25519-verify the
   request over the **raw** body bytes *before* parsing or acting. The raw-body
   parser is mounted before any JSON parser for exactly this reason — never
   reorder that. Answer `PING` (type 1) with `PONG`.
2. **Dedup on interaction id.** The Discord interaction id is the primary key of
   `interactions`. Record with `ON CONFLICT DO NOTHING`; only the first insert
   may trigger side-effects (outbox enqueue). Never enqueue on a duplicate.
3. **Respect the 3s window.** Anything slow (AI, mirror) happens *after* a
   deferred response (type 5), via the outbox → follow-up. Handlers must reply
   quickly and never `await` a network call to a third party before responding.
4. **Never lose a side-effect.** Reply / AI / mirror are independent `outbox`
   jobs with backoff and a stale-job reclaim. Each step is idempotent, guarded
   by an `action_log` ledger entry (`hasAction`).
5. **Secrets stay server-side.** Only `server/src/env.ts` reads them. The logger
   redacts keys matching token/secret/password/webhook. The mirror webhook URL
   is never returned to the client — expose only a `mirrorConfigured` boolean.

## Conventions
- **TypeScript strict**, including `noUncheckedIndexedAccess` — guard
  `req.params.x` and array access.
- Server compiles as **CommonJS** (`server/tsconfig.json`); no `.js` import
  extensions needed. Client is ESM (Vite).
- DB access via **Drizzle ORM** (`server/src/db/schema.ts`). The live schema is
  applied by the **idempotent bootstrap DDL** in `server/src/db/bootstrap.ts` on
  boot — if you change `schema.ts`, mirror it there (they must stay in lock-step).
- Discord protocol constants live in `server/src/discord/types.ts`. Interaction
  **type** 5 = MODAL_SUBMIT; response **callback type** 5 = DEFERRED — don't
  conflate them.
- New reliable side-effect? Add an `outbox` `kind` + a branch in
  `outbox/dispatch.ts`, and enqueue it (usually from `enqueuePipeline` or a
  handler). Make it idempotent and guard repeats with `hasAction`.
- Dashboard styling follows a monochrome-slate + single-violet-accent system;
  reuse the primitives in `client/src/components/ui.tsx` (Card/Button/Badge/…),
  which carry the hover/shadow treatment.

## Gotchas learned the hard way
- **Postgres treats NULLs as distinct in unique indexes.** The
  `(guild_id, command_name)` unique index does *not* dedupe global rows where
  `guild_id IS NULL`. Any upsert of a global config must check existence
  explicitly (see `ensureDefaultConfigs` / the `/api/configs` PUT), not rely on
  `ON CONFLICT`.
- **Gemini 2.5-flash is a "thinking" model.** Without `thinkingConfig.thinkingBudget: 0`
  it spends the output-token budget on hidden reasoning and returns empty text.
  Keep thinking disabled for triage.
- **Empty optional env vars.** `""` fails `z.string().url()`. Optional URL/key
  vars are `preprocess`ed to treat `""` as unset.

## Commands
`npm run dev` (both) · `npm run build` · `npm start` · `npm run register [-- <guildId>]` · `npm run seed`
