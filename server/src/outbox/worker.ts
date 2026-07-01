import { sql } from "drizzle-orm";
import { db } from "../db";
import { log } from "../lib/logger";
import { logAction } from "../interactions/service";
import { dispatch } from "./dispatch";

const POLL_MS = 1500;
const BATCH = 5;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** A job stuck 'processing' longer than this is presumed abandoned (crash). */
const STALE_MS = 60_000;

interface ClaimedJob {
  id: number;
  kind: string;
  interaction_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
}

let running = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Claim up to BATCH due jobs atomically. FOR UPDATE SKIP LOCKED means two
 * ticks (or two instances) never grab the same job. Marking them 'processing'
 * in the same statement is the lease.
 */
async function claim(): Promise<ClaimedJob[]> {
  const res = await db.execute(sql`
    UPDATE outbox SET status = 'processing', updated_at = now()
    WHERE id IN (
      SELECT id FROM outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC, id ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, interaction_id, attempts, max_attempts, payload
  `);
  return res.rows as unknown as ClaimedJob[];
}

/** Return crashed 'processing' jobs to the queue. */
async function reclaimStale(): Promise<void> {
  await db.execute(sql`
    UPDATE outbox SET status = 'pending', updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - (${STALE_MS / 1000} * interval '1 second')
  `);
}

async function succeed(id: number): Promise<void> {
  await db.execute(sql`
    UPDATE outbox SET status = 'done', updated_at = now(), last_error = NULL WHERE id = ${id}
  `);
}

async function fail(job: ClaimedJob, err: unknown): Promise<void> {
  const attempts = job.attempts + 1;
  const message = err instanceof Error ? err.message : String(err);
  const exhausted = attempts >= job.max_attempts;
  const backoff = Math.min(BASE_BACKOFF_MS * 2 ** job.attempts, MAX_BACKOFF_MS);

  await db.execute(sql`
    UPDATE outbox
    SET status = ${exhausted ? "failed" : "pending"},
        attempts = ${attempts},
        last_error = ${message.slice(0, 500)},
        next_attempt_at = now() + (${backoff / 1000} * interval '1 second'),
        updated_at = now()
    WHERE id = ${job.id}
  `);

  await logAction({
    interactionId: job.interaction_id,
    kind: exhausted ? `${job.kind}_failed` : "retry",
    level: exhausted ? "error" : "warn",
    message: exhausted
      ? `Gave up on '${job.kind}' after ${attempts} attempts: ${message}`
      : `'${job.kind}' failed (attempt ${attempts}/${job.max_attempts}), retrying in ${Math.round(
          backoff / 1000,
        )}s`,
    detail: { error: message.slice(0, 300) },
  });
  log[exhausted ? "error" : "warn"]("outbox job failed", {
    id: job.id,
    kind: job.kind,
    attempts,
    exhausted,
  });
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await reclaimStale();
    const jobs = await claim();
    for (const job of jobs) {
      try {
        await dispatch({
          id: job.id,
          kind: job.kind,
          interactionId: job.interaction_id,
          attempts: job.attempts,
          payload: job.payload ?? {},
        });
        await succeed(job.id);
      } catch (err) {
        await fail(job, err);
      }
    }
  } catch (err) {
    log.error("outbox tick error", { err: String(err) });
  } finally {
    running = false;
  }
}

export function startOutboxWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), POLL_MS);
  log.info("outbox worker started", { pollMs: POLL_MS });
}

export function stopOutboxWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
