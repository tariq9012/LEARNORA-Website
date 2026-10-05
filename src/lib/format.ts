/** "Alex Mercer" -> "AM". Falls back to "U" for an empty/blank name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

/** Formats a duration given in seconds as "Xh Ym" (or "Ym" under an hour). */
export function formatDurationHM(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Formats a lesson duration given in seconds as "N min" (or "Xh Ym" if long). */
export function formatLessonDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds) return "—";
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  return formatDurationHM(totalSeconds);
}

/** Formats a date as "August 2026" for "last updated" style copy. */
export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

/** Rounds an average rating to one decimal place; returns 0 for no ratings. */
export function averageRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce((total, r) => total + r, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

/**
 * Display-only money formatting for the exact 2-decimal strings the server
 * sends in Phase 10 DTOs (e.g. "55.99" -> "$55.99"). Never use the result of
 * this — or a Number parsed from those strings — for a balance comparison or
 * anything the server decides; the server is authoritative for all money.
 */
export function formatMoney(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** "Sep 24, 2026" from an ISO string. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a short date. Display only. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;
  return formatShortDate(iso);
}

/** Compact integer formatting for KPI cards — e.g. 12,480. Phase 14: moved here from data/mock.ts so business pages don't import mock.ts just to format a number (marketing pages keep using mock.ts's own copy). */
export function compact(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Course/price display used by catalog, checkout and dashboards.
 * Whole-dollar prices keep the compact look ("$49"); anything with cents shows
 * both decimals ("$49.99") — the old mock.ts currency() silently rounded
 * $49.99 to "$50". 0 is "Free". Display only; the server owns every amount.
 */
export function formatPrice(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value) || value === 0) return "Free";
  const whole = Math.abs(value * 100 - Math.round(value) * 100) < 0.5;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value);
}
