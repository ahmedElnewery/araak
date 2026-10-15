// Structured logger that never writes secrets (FR-017). Redacts by key name and by JWT-shaped value.

const SENSITIVE_KEY = /(password|passwd|token|secret|authorization|cookie|sb-|apikey|api_key|otp)/i;
const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === "string") return value.replace(JWT_SHAPE, REDACTED);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: String(redact(value.message, depth + 1)) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...(redact(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

/** Never pass request bodies of auth routes as fields; log event names and safe identifiers only. */
export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => { write("debug", event, fields); },
  info: (event: string, fields?: Record<string, unknown>) => { write("info", event, fields); },
  warn: (event: string, fields?: Record<string, unknown>) => { write("warn", event, fields); },
  error: (event: string, fields?: Record<string, unknown>) => { write("error", event, fields); },
};
