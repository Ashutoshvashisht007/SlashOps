import nacl from "tweetnacl";
import { env } from "../env";

const PUBLIC_KEY = Buffer.from(env.DISCORD_PUBLIC_KEY, "hex");

/** Reject clock-skewed / replayed requests older than this (seconds). */
const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verify Discord's Ed25519 request signature. This is the price of admission
 * for the interactions endpoint: Discord signs `timestamp + rawBody` with its
 * private key and sends the signature + timestamp as headers. We verify with
 * the application's public key. Anything that fails here is a forged or
 * corrupted request and must be rejected with 401 BEFORE any processing.
 *
 * `rawBody` MUST be the exact bytes Discord sent — parsing/re-serialising the
 * JSON first would change the bytes and break verification.
 */
export function verifyDiscordRequest(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
): boolean {
  if (!signature || !timestamp) return false;

  // Cheap replay guard: the timestamp is inside the signed payload, so an
  // attacker can't tamper with it, but a stale-but-validly-signed capture
  // should still be dropped.
  const ts = Number(timestamp);
  if (Number.isFinite(ts)) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;
  }

  let sig: Buffer;
  try {
    sig = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;

  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  try {
    return nacl.sign.detached.verify(message, sig, PUBLIC_KEY);
  } catch {
    return false;
  }
}
