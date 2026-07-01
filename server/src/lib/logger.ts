/**
 * Tiny structured logger. Emits one JSON object per line so logs are greppable
 * and machine-parseable in Render's log stream (observability stretch goal).
 *
 * A small redaction pass ensures we never accidentally print a bot token or
 * webhook URL, even if one is threaded into a log context by mistake.
 */
type Level = "debug" | "info" | "warn" | "error";

const SECRET_HINTS = [/token/i, /secret/i, /password/i, /authorization/i, /webhook/i, /apikey/i, /api_key/i];

function redact(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_HINTS.some((re) => re.test(k)) ? "[redacted]" : redact(v);
  }
  return out;
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? (redact(ctx) as Record<string, unknown>) : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
