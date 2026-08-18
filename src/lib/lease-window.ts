/**
 * Parses `startMonth` (YYYY-MM) and `durationMonths` (1–24) into a UTC date
 * range suitable for Prisma overlap queries.
 *
 * Returns null when either input is missing or invalid, so callers treat
 * an absent window as "show all active bookings" (the pre-B3 fallback).
 */
export function parseLeaseWindow(
  startMonth: unknown,
  durationMonths: unknown,
): { start: Date; end: Date } | null {
  if (typeof startMonth !== "string" || !/^\d{4}-\d{2}$/.test(startMonth))
    return null;
  const dur =
    typeof durationMonths === "string" ? parseInt(durationMonths, 10) : NaN;
  if (!Number.isInteger(dur) || dur < 1 || dur > 24) return null;
  const [y, m] = startMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m - 1 + dur, 1) - 24 * 60 * 60 * 1000);
  return { start, end };
}
