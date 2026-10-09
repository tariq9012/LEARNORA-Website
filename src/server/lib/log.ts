/**
 * Phase 20: small structured logger for server code. One JSON object per line,
 * which is what Vercel's log search indexes. This is NOT a monitoring platform
 * (no alerting, no retention beyond Vercel's plan, no tracing); it only makes
 * the logs consistent, searchable and free of secrets.
 *
 * Callers pass a short `event` name and a few scalar fields they chose
 * themselves. As a safety net every string is scrubbed for connection strings,
 * presigned-URL signatures and bearer tokens. Errors are reduced to name,
 * code and two stack frames: never the message, because ORM/driver messages can
 * echo query parameters.
 */
import { randomUUID } from "node:crypto";

type Scalar = string | number | boolean | null | undefined;
export type LogFields = Record<string, Scalar>;

const SCRUBBERS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted-db-url]"],
  [/X-Amz-[A-Za-z-]+=[^&\s"'<>]+/gi, "X-Amz-…=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\b(token|secret|password|passwd|pass)=[^&\s"'<>]+/gi, "$1=[redacted]"],
];

const MAX_LEN = 240;

export function scrub(value: string): string {
  let out = value;
  for (const [re, replacement] of SCRUBBERS) out = out.replace(re, replacement);
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN)}…` : out;
}

/** Short random id to correlate the lines of one request/job in the logs. */
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

/** Name + code + two stack frames. Never the message. */
export function safeErrorInfo(error: unknown): LogFields {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const code = (error as { code?: unknown }).code;
  const frames = (error.stack ?? "")
    .split("\n")
    .slice(1, 3)
    .map((line) => scrub(line.trim().replace(/\(?(?:file:\/\/)?\/[^\s)]*\/(?=[^/\s)]+:\d+)/g, "(")))
    .join(" | ");
  return {
    errorName: error.name,
    ...(typeof code === "string" || typeof code === "number" ? { errorCode: String(code) } : {}),
    ...(frames ? { at: frames } : {}),
  };
}

function write(level: "info" | "warn" | "error", event: string, fields: LogFields) {
  const clean: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    clean[k] = typeof v === "string" ? scrub(v) : v;
  }
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: LogFields = {}) => write("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => write("warn", event, fields),
  error: (event: string, error: unknown, fields: LogFields = {}) =>
    write("error", event, { ...fields, ...safeErrorInfo(error) }),
};
