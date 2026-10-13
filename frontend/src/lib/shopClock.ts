/**
 * The shop's own clock.
 *
 * A shop sets one time zone (Settings, Shipping and pickup). The same-day
 * cutoff and the Reports' days are read on it, so two people in different
 * places see the same "today". With none set, each person's own clock is
 * used, as it was before there was a setting.
 */
import { apiClient } from "@/lib/api-client";

/** The time zones offered first: where this product's shops are. */
export const US_ZONES: [string, string][] = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona (no daylight time)"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Anchorage", "Alaska Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
];

/** Every zone this browser knows, for a shop somewhere else. */
export function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list;
  } catch { /* an older browser: the short list will do */ }
  return US_ZONES.map(([zone]) => zone);
}

/** Minutes a zone is ahead of UTC at a moment (negative west of it). Null for
 *  no zone, or one this browser does not know. */
export function zoneOffsetMinutes(timeZone: string | null | undefined, at = new Date()): number | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  } catch {
    return null;
  }
}

/** Minutes past midnight on the shop's clock, or on this computer's when the
 *  shop has not set one. */
export function minutesIntoDay(timeZone: string | null | undefined, at = new Date()): number {
  const offset = zoneOffsetMinutes(timeZone, at);
  if (offset == null) return at.getHours() * 60 + at.getMinutes();
  const local = new Date(at.getTime() + offset * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** "UTC−5" for a zone as it stands now; "" for one the browser does not know. */
export function offsetWords(timeZone: string, at = new Date()): string {
  const minutes = zoneOffsetMinutes(timeZone, at);
  if (minutes == null) return "";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const rest = abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : "";
  return `UTC${sign}${Math.floor(abs / 60)}${rest}`;
}

/** A zone in words: its short name for one of the common ones, else its own name. */
export function zoneWords(timeZone: string): string {
  return US_ZONES.find(([zone]) => zone === timeZone)?.[1] ?? timeZone.replace(/_/g, " ");
}

// ── The shop's saved zone, asked once a visit ────────────────────────────────

let saved: Promise<string | null> | null = null;

/** The shop's time zone, or null when it has not set one. */
export function shopZone(): Promise<string | null> {
  saved ??= apiClient.get<{ timezone?: string | null }>("/api/v1/admin/production/settings")
    .then((s) => s.timezone ?? null)
    .catch(() => null);
  return saved;
}

/** After the zone is changed: the next reader asks again. */
export function forgetShopZone(): void {
  saved = null;
}

/** The offset to send with a report: the shop's zone, else this browser's. */
export async function reportOffsetMinutes(): Promise<number> {
  return zoneOffsetMinutes(await shopZone()) ?? -new Date().getTimezoneOffset();
}
