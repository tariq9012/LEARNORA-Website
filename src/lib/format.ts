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
