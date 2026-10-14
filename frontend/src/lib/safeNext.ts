/**
 * Where to send somebody once they have signed in or made an account.
 *
 * Only ever a path on this shop. A `next` that can point anywhere is an open
 * redirect from a page that hands out a session: "//elsewhere.com", and
 * "/\elsewhere.com", which a browser reads the same way. Never a sign-in page
 * either, or the buyer goes round in a circle.
 */
export function safeNext(raw: string | null | undefined): string | null {
  const path = (raw ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return null;
  if (/^\/(login|create-account)(?=[/?#]|$)/.test(path)) return null;
  return path;
}

/** The way back this page was opened with: `next`, or `redirect` from older links. */
export function nextFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  return safeNext(query.get("next") ?? query.get("redirect"));
}
