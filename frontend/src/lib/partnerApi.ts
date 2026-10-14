/**
 * The partner portal's own way to the API.
 *
 * Kept apart from `apiClient` on purpose: that one carries a shop user's
 * token and renews it against the shop sign-in, and a partner is not a shop
 * user. The partner's short token lives in memory only; the httpOnly cookie
 * the API set at sign-in renews it (POST /partners/auth/refresh), so script on
 * the page never holds anything that outlives the tab.
 *
 * "View as affiliate" hands the portal a read-only token in the address's
 * fragment (/partners/view#token=...). It is never renewed: when it runs out,
 * the view ends.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let token: string | null = null;
let viewingAs = false;
let renewing: Promise<boolean> | null = null;

export function setPartnerToken(next: string | null, opts: { viewAs?: boolean } = {}) {
  token = next;
  viewingAs = !!opts.viewAs;
}

export function hasPartnerToken() {
  return !!token;
}

export function isViewingAs() {
  return viewingAs;
}

export class PartnerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PartnerApiError";
  }
}

function errorFrom(status: number, body: unknown): PartnerApiError {
  const b = (body ?? {}) as { detail?: unknown; error?: { code?: string; message?: string } };
  const d = b.detail;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const o = d as Record<string, unknown>;
    return new PartnerApiError(status, String(o.code ?? "ERROR"), String(o.message ?? "Something went wrong."), o);
  }
  if (typeof d === "string") return new PartnerApiError(status, "ERROR", d);
  if (Array.isArray(d) && d.length) {
    const first = d[0] as { loc?: (string | number)[]; msg?: string };
    const where = (first.loc ?? []).filter((p) => p !== "body").join(" ");
    return new PartnerApiError(status, "VALIDATION", where ? `${where}: ${first.msg}` : String(first.msg));
  }
  if (b.error?.message) return new PartnerApiError(status, b.error.code ?? "ERROR", b.error.message);
  return new PartnerApiError(status, "ERROR", status >= 500 ? "Something went wrong on our side. Try again." : "That did not work.");
}

/** Renew the short token from the cookie. False when the session has ended. */
export async function renewPartnerSession(): Promise<boolean> {
  if (viewingAs) return false;
  if (renewing) return renewing;
  renewing = fetch(`${API_BASE}/api/v1/partners/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) {
        token = null;
        return false;
      }
      const data = (await res.json()) as { access_token: string };
      token = data.access_token;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

type Options = { method?: string; body?: unknown; form?: FormData; blob?: boolean; auth?: boolean };

async function send(path: string, opts: Options): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE}/api/v1${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "include",
    cache: "no-store",
  });
}

export async function papi<T>(path: string, opts: Options = {}): Promise<T> {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false && !viewingAs && (await renewPartnerSession())) {
    res = await send(path, opts);
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw errorFrom(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  if (opts.blob) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Fetch a file the partner may have (a statement, the QR code) and save it. */
export async function partnerDownload(path: string, filename: string) {
  const blob = await papi<Blob>(path, { blob: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The API's own address, for links that need no token (the final statement ticket). */
export function apiUrl(path: string) {
  return `${API_BASE}/api/v1${path}`;
}

export function money(cents: number | null | undefined): string {
  const c = Number(cents ?? 0);
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function moneyShort(cents: number | null | undefined): string {
  const c = Number(cents ?? 0);
  return c % 100 === 0 ? money(c).slice(0, -3) : money(c);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 9", or "Oct 9, 2025" when it is not this year. Dates from the API are UTC. */
export function day(value: string | null | undefined, withYear = false): string {
  if (!value) return "";
  const d = value.length <= 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const show = withYear || y !== new Date().getUTCFullYear();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${show ? `, ${y}` : ""}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return ((parts[0]?.[0] ?? "") + last).toUpperCase() || "P";
}
