# AI_NOTES.md

> A short, honest account of how AI was used to build SlashOps.
> *(Draft — personalize the voice/details before submitting.)*

## Tools & how work was split
- **Claude (Claude Code)** as the primary pair — scaffolding the monorepo,
  writing the Express interactions endpoint, the outbox worker, the React
  dashboard, and the docs. I drove the architecture and reviewed every diff;
  the model did the mechanical writing and a lot of the "wire these five
  services together correctly" grind.
- Roughly **70/30**: AI wrote most of the code, I made the design calls, ran the
  integration tests, poked the unhappy paths, and corrected course when the
  model made assumptions (see below).

## Key decisions I made myself
1. **HTTP interactions endpoint, not a gateway bot.** The exercise is about a
   reachable, verifiable webhook. A raw-body Ed25519 check in front of an Express
   route is simpler to reason about and to deploy as a single Render service than
   a persistent websocket. It also makes the security bar (forged/replayed
   requests) a first-class, testable concern.
2. **An "outbox" table for every side-effect.** Rather than calling Discord/AI
   inline, each reply/mirror/AI step is a queued job with independent retries and
   backoff. This is what makes "downstream briefly down → don't lose it" true
   instead of aspirational, and it doubles as the dashboard's observability feed.
3. **Global-default + per-guild-override config model.** Multi-server support
   falls out of a single `command_configs` table where a `NULL` guild row is the
   default a guild inherits until it overrides it — no per-tenant schema, and the
   rule editor works the same globally or per server.

## The hardest wrong turn the AI led me into
**Gemini model + "thinking" tokens.** The AI's first cut defaulted to
`gemini-2.0-flash` with a modest `maxOutputTokens`. Two things bit us, both only
visible once I tested against the *real* API key:
1. `gemini-2.0-flash` returned `429 … limit: 0` — that key's project had no
   free-tier quota for that model. Listing models showed `gemini-2.5-flash` was
   the one actually available.
2. Switching to `2.5-flash` returned **HTTP 200 with empty text** and
   `finishReason: MAX_TOKENS`. That was the subtle one: 2.5-flash is a *thinking*
   model, and it had spent the entire token budget on hidden reasoning
   (`thoughtsTokenCount`) before emitting a single visible character.

I noticed because my triage self-test printed an empty summary despite a 200
response. The fix was to set `thinkingConfig.thinkingBudget: 0` (triage doesn't
need chain-of-thought) and raise `maxOutputTokens`. After that, the same input
produced a correct `{summary, tags:[…], severity:"high"}`. Lesson: the model
happily wrote plausible LLM-calling code, but the provider's real-world quirks
(quota per model, thinking-token accounting) only surfaced under a live test —
so I test every external integration against the real service, not a mock.

A couple of smaller ones worth noting: the AI initially used `ON CONFLICT DO
NOTHING` to seed global config rows, which silently does nothing because Postgres
treats `NULL`s as distinct in a unique index; and an empty optional env var
(`""`) crashed boot against a `z.string().url()` check. Both were caught by
running the thing, not by reading it.

## What I'd add with more time
- Automated tests (the signature/dedup/outbox checks I ran by hand → a Vitest suite).
- Encrypt the stored mirror-webhook URLs at rest (currently plaintext column).
- Richer AI: route by severity, auto-escalate `high` items, dedupe similar reports.
- Per-server rate-limit / abuse guards on the endpoint, and metrics (p95 latency, retry counts) surfaced on the dashboard.
