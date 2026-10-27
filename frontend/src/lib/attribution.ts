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
 * **Every visit is listed.** Beside that one source, `sessions` keeps each
 * visit as it happened (when, the first page, and the referrer, UTMs or ad
 * click it arrived with), so the order page can show the journey the way
 * Shopify's Conversion summary does. A visit with none of those is listed as
 * it is, and the order page calls it direct: typed in, a bookmark, or a link
 * that hid where it came from.
 *
 * Kept in localStorage, which is per-origin — and every brand has its own
 * subdomain, so one brand's campaigns can never be read on another's store.
 * Every access is wrapped: private browsing makes these throw.
 */

import { apiClient } from "@/lib/api-client";

const KEY = "at_attr";
const MAX_AGE_DAYS = 90;
/** A gap this long counts as a new visit rather than more of the same one. */
const VISIT_GAP_MINUTES = 30;
/** The first visit and the latest ones; `visits` keeps the full count. */
const MAX_SESSIONS = 25;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid"] as const;
type SourceKey = (typeof UTM_KEYS)[number] | (typeof CLICK_KEYS)[number];

/** Pages that are not the shop: the brand's team and the platform. */
const NOT_THE_SHOP = /^\/(admin|platform|partners|site-builder|theme-editor|theme-preview|ui-preview|onboarding)(\/|$)/;
/** Payment pages a buyer returns from: the same visit, not a new source. */
const PAYMENT_HOSTS = /(^|\.)(stripe\.com|paypal\.com|klarna\.com|affirm\.com|afterpay\.com|cash\.app|link\.com)$/i;

/** What a visit arrived with: its UTMs, an ad click id, the site that linked here. */
type Source = Partial<Record<SourceKey, string>> & { referrer?: string };

/** One visit: when it started and last moved, its first page, and what it arrived with. */
export interface Visit extends Source {
  /** This visit's own id: reported once to the shop (Home's Sessions), and the checkout marks it converted. */
  id?: string;
  at: string;
  last: string;
  landing_page?: string;
}

export interface Attribution extends Source {
  landing_page?: string;
  first_seen?: string;
  last_seen?: string;
  /** When the source above (the last one that named itself) arrived. */
  source_seen?: string;
  visits?: number;
  device?: "mobile" | "tablet" | "desktop";
  sessions?: Visit[];
}

/** Only the first capture of a page load reads `document.referrer`: moving
 * between pages inside the shop keeps the referrer of the page that loaded. */
let loadSeen = false;

function read(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Attribution;
    const recent = (iso?: string) => !!iso && Date.now() - new Date(iso).getTime() <= MAX_AGE_DAYS * 86_400_000;
    // Not seen for months: start over.
    if (!recent(stored.last_seen ?? stored.first_seen)) return null;
    // Visits from before that drop off the journey...
    if (Array.isArray(stored.sessions)) {
      const kept = stored.sessions.filter((v) => recent(v.at));
      if (kept.length < stored.sessions.length) {
        stored.visits = Math.max((stored.visits ?? 0) - (stored.sessions.length - kept.length), kept.length);
        stored.sessions = kept;
        if (kept[0]) stored.first_seen = kept[0].at;
      }
    }
    // ...and a campaign from months ago is not credited with today's order.
    if (!recent(stored.source_seen ?? stored.first_seen)) {
      for (const key of [...UTM_KEYS, ...CLICK_KEYS]) delete stored[key];
      delete stored.referrer;
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
    const host = new URL(ref).host;
    if (host === window.location.host || PAYMENT_HOSTS.test(new URL(ref).hostname)) return undefined;
  } catch {
    return undefined;
  }
  return ref.slice(0, 1000);
}

/** This page without its query string: nothing a buyer typed rides along. */
function here(): string {
  return (window.location.origin + window.location.pathname).slice(0, 1000);
}

/** The visits kept so far; an older record without them starts from its one source. */
function visitsOf(stored: Attribution): Visit[] {
  if (Array.isArray(stored.sessions)) return stored.sessions.slice();
  if (!stored.first_seen) return [];
  const first: Visit = { at: stored.first_seen, last: stored.last_seen ?? stored.first_seen };
  for (const key of [...UTM_KEYS, ...CLICK_KEYS]) if (stored[key]) first[key] = stored[key];
  if (stored.referrer) first.referrer = stored.referrer;
  if (stored.landing_page) first.landing_page = stored.landing_page;
  return [first];
}

function hostOf(url?: string): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function newId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch {
    return "";
  }
}

/**
 * Tell the shop a visit began, once: Home counts these as Sessions, and the
 * checkout marks the one that placed an order (Conversion rate). Never waited
 * on and never an error a shopper sees; a test browser is not a visitor.
 */
function reportVisit(visit: Visit, device: Attribution["device"]): void {
  try {
    if (!visit.id || navigator.webdriver) return;
    const click = CLICK_KEYS.find((key) => visit[key]);
    void apiClient.post("/api/v1/storefront/visits", {
      id: visit.id,
      landing_page: visit.landing_page,
      referrer: visit.referrer,
      utm_source: visit.utm_source,
      utm_medium: visit.utm_medium,
      utm_campaign: visit.utm_campaign,
      utm_term: visit.utm_term,
      utm_content: visit.utm_content,
      click,
      device,
    }).catch(() => {});
  } catch {
    /* counting a visit is never worth an error */
  }
}

/** Whether what this page arrived with is the visit already under way (a reload, a second tab). */
function sameSource(visit: Visit, arrived: Source): boolean {
  const tags = [...UTM_KEYS, ...CLICK_KEYS];
  if (tags.some((key) => arrived[key]) && tags.some((key) => (visit[key] ?? "") !== (arrived[key] ?? ""))) return false;
  return !arrived.referrer || hostOf(arrived.referrer) === hostOf(visit.referrer);
}

/**
 * Record this page view. Safe to call on every navigation.
 *
 * Returns what is now stored, so a caller can act on it without a second read.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  if (NOT_THE_SHOP.test(window.location.pathname)) return null;

  const params = new URLSearchParams(window.location.search);
  const incoming: Source = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) incoming[key] = value.slice(0, 255);
  }
  for (const key of CLICK_KEYS) {
    const value = params.get(key)?.trim();
    if (value) incoming[key] = value.slice(0, 255);
  }

  const firstOfLoad = !loadSeen;
  loadSeen = true;
  const referrer = firstOfLoad ? externalReferrer() : undefined;
  // A campaign, an ad click, or a link from another site: all of them name
  // where this visit came from, and any of them outranks what we had.
  const namesASource = Object.keys(incoming).length > 0 || !!referrer;

  const now = new Date().toISOString();
  const stored = read();
  const arrived: Source = { ...incoming, ...(referrer ? { referrer } : {}) };

  if (!stored) {
    const visit: Visit = { id: newId(), at: now, last: now, landing_page: here(), ...arrived };
    const fresh: Attribution = {
      ...incoming,
      referrer,
      landing_page: here(),
      first_seen: now,
      last_seen: now,
      ...(namesASource ? { source_seen: now } : {}),
      visits: 1,
      device: deviceKind(),
      sessions: [visit],
    };
    write(fresh);
    reportVisit(visit, fresh.device);
    return fresh;
  }

  const sessions = visitsOf(stored);
  const current = sessions[sessions.length - 1];
  const gapMs = Date.now() - new Date(current?.last ?? stored.last_seen ?? 0).getTime();
  // A new visit: away for half an hour, or back from somewhere else (another
  // ad, another site) even sooner.
  const newVisit = !current || gapMs > VISIT_GAP_MINUTES * 60_000 || (namesASource && !sameSource(current, arrived));

  const next: Attribution = { ...stored, last_seen: now };
  let begun: Visit | null = null;
  if (newVisit) {
    next.visits = (stored.visits ?? sessions.length) + 1;
    begun = { id: newId(), at: now, last: now, landing_page: here(), ...arrived };
    sessions.push(begun);
    if (sessions.length > MAX_SESSIONS) sessions.splice(1, sessions.length - MAX_SESSIONS);
  } else if (current) {
    // A visit under way from before visits had ids is counted from now.
    sessions[sessions.length - 1] = { ...current, last: now, ...(current.id ? {} : { id: newId() }) };
    if (!current.id) begun = sessions[sessions.length - 1] ?? null;
  }
  next.sessions = sessions;

  // Only a new visit changes the source: a reload hands the browser's
  // referrer over again, and must not wipe the campaign that brought them.
  if (namesASource && newVisit) {
    // A fresh source replaces the old one outright: keeping half of the
    // previous campaign beside half of this one would describe no real visit.
    for (const key of [...UTM_KEYS, ...CLICK_KEYS]) delete next[key];
    Object.assign(next, incoming);
    next.referrer = referrer ?? undefined;
    next.source_seen = now;
  }

  write(next);
  if (begun) reportVisit(begun, next.device ?? deviceKind());
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

/** What the brand's server needs to report this sale to its own Meta pixel. */
export interface ServerTracking {
  fbp?: string;
  fbc?: string;
  page_url?: string;
}

function cookie(name: string): string | undefined {
  try {
    const hit = document.cookie.split("; ").find(c => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The Meta pixel's own browser ids, sent with the order so the server-side
 * Purchase (backend services/meta_capi.py) is matched to the same person.
 *
 * The API lives on another domain, so these first-party cookies never reach it
 * on their own. `_fbc` is only written when the pixel saw an ad click; without
 * it, the click id this file kept from the landing URL stands in, in the format
 * Meta gives for it.
 */
export function getServerTracking(): ServerTracking | undefined {
  if (typeof window === "undefined") return undefined;
  const fbp = cookie("_fbp");
  let fbc = cookie("_fbc");
  if (!fbc) {
    const stored = read();
    if (stored?.fbclid) fbc = `fb.1.${Date.parse(stored.last_seen ?? "") || Date.now()}.${stored.fbclid}`;
  }
  // The page without its query string: nothing a buyer typed rides along.
  const page_url = (window.location.origin + window.location.pathname).slice(0, 1000);
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}), page_url };
}

/** Forget the visitor's attribution — used after an order is placed. */
export function clearAttribution(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
