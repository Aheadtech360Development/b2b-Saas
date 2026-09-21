/**
 * Where a visitor came from, remembered until they order.
 *
 * Nothing in the platform recorded this before: a brand running ads could not
 * tell which campaign paid for an order, because the `utm_*` values on the
 * landing URL were read by nobody.
 *
 * Two rules decide what is kept:
 *
 * **Last non-direct wins.** Somebody clicks a Google ad, browses, leaves, and
 * comes back a day later by typing the address. The ad still sold it, so the
 * second visit — which carries no campaign — must not erase the first. Only a
 * visit that names a source replaces the stored one.
 *
 * **An unknown source stays unknown.** A visitor who arrived with no campaign
 * and no referrer gets no attribution at all. Writing "direct" would turn
 * something we do not know into something the brand would act on.
 *
 * Kept in localStorage, which is per-origin — and every brand has its own
 * subdomain, so one brand's campaigns can never be read on another's store.
 * Every access is wrapped: private browsing makes these throw.
 */

const KEY = "at_attr";
const MAX_AGE_DAYS = 90;
/** A gap this long counts as a new visit rather than more of the same one. */
const VISIT_GAP_MINUTES = 30;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_KEYS = ["gclid", "fbclid", "msclkid", "ttclid"] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  referrer?: string;
  landing_page?: string;
  first_seen?: string;
  last_seen?: string;
  visits?: number;
  device?: "mobile" | "tablet" | "desktop";
}

function read(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Attribution;
    // Expire rather than credit an order to a campaign from months ago.
    if (stored.first_seen) {
      const age = Date.now() - new Date(stored.first_seen).getTime();
      if (age > MAX_AGE_DAYS * 86_400_000) return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function write(value: Attribution): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private browsing, or storage full — attribution is never worth an error */
  }
}

function deviceKind(): Attribution["device"] {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** The referrer, but only when it came from somewhere else. */
function externalReferrer(): string | undefined {
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    if (new URL(ref).host === window.location.host) return undefined;
  } catch {
    return undefined;
  }
  return ref.slice(0, 1000);
}

/**
 * Record this page view. Safe to call on every navigation.
 *
 * Returns what is now stored, so a caller can act on it without a second read.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const incoming: Attribution = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) incoming[key] = value.slice(0, 255);
  }
  for (const key of CLICK_KEYS) {
    const value = params.get(key)?.trim();
    if (value) incoming[key] = value.slice(0, 255);
  }

  const referrer = externalReferrer();
  // A campaign, an ad click, or a link from another site: all of them name
  // where this visit came from, and any of them outranks what we had.
  const namesASource = Object.keys(incoming).length > 0 || !!referrer;

  const now = new Date().toISOString();
  const stored = read();

  if (!stored) {
    if (!namesASource) return null; // nothing to say, so say nothing
    const fresh: Attribution = {
      ...incoming,
      referrer,
      landing_page: (window.location.origin + window.location.pathname).slice(0, 1000),
      first_seen: now,
      last_seen: now,
      visits: 1,
      device: deviceKind(),
    };
    write(fresh);
    return fresh;
  }

  const gapMs = stored.last_seen ? Date.now() - new Date(stored.last_seen).getTime() : Infinity;
  const newVisit = gapMs > VISIT_GAP_MINUTES * 60_000;

  const next: Attribution = { ...stored, last_seen: now };
  if (newVisit) next.visits = (stored.visits ?? 1) + 1;

  if (namesASource) {
    // A fresh source replaces the old one outright: keeping half of the
    // previous campaign beside half of this one would describe no real visit.
    for (const key of [...UTM_KEYS, ...CLICK_KEYS]) delete next[key];
    Object.assign(next, incoming);
    next.referrer = referrer ?? undefined;
  }

  write(next);
  return next;
}

/** What to send with the order, or null when nothing was ever recorded. */
export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  const stored = read();
  if (!stored) return null;
  // Drop empty keys so a mostly-blank record does not read as a real one.
  const payload = Object.fromEntries(
    Object.entries(stored).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ) as Attribution;
  return Object.keys(payload).length ? payload : null;
}

/** Forget the visitor's attribution — used after an order is placed. */
export function clearAttribution(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
