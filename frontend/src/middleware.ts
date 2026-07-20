/**
 * Next.js Middleware — Multi-tenant tenant resolution.
 *
 * Local:      http://demo.localhost:3000  → tenant slug = "demo"
 * Production: https://demo.platform.com  → tenant slug = "demo"
 * Fallback:   https://platform.com/?tenant=demo  → tenant slug = "demo"
 *
 * The slug is put on the *request* headers (not just the response) because that
 * is the only channel server components can read it from — they render before
 * the response exists, and a server-side fetch has no browser cookie jar. The
 * cookie is still set so client components and later navigations keep the brand
 * once the `?tenant=` query is gone from the URL.
 */
import { NextRequest, NextResponse } from "next/server";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";

export const TENANT_HEADER = "x-tenant-slug";
export const TENANT_COOKIE = "tenant_slug";

function resolveSlug(request: NextRequest): string | null {
  const hostname = request.nextUrl.hostname;

  // 1. Subdomain — the real production mechanism, always wins.
  if (
    hostname !== PLATFORM_DOMAIN &&
    hostname !== `www.${PLATFORM_DOMAIN}` &&
    hostname !== "localhost" &&
    hostname.endsWith(`.${PLATFORM_DOMAIN}`)
  ) {
    return hostname.slice(0, -(PLATFORM_DOMAIN.length + 1));
  }

  // 2. `?tenant=<slug>` — for hosts without wildcard subdomains (preview deploys).
  const fromQuery = request.nextUrl.searchParams.get("tenant");
  if (fromQuery) return fromQuery;

  // 3. Cookie set by an earlier request, so in-app navigation keeps the brand.
  return request.cookies.get(TENANT_COOKIE)?.value || null;
}

export function middleware(request: NextRequest) {
  const slug = resolveSlug(request);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set(TENANT_HEADER, slug);
  } else {
    // Never let a stale inbound header survive resolution.
    requestHeaders.delete(TENANT_HEADER);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.cookies.set(TENANT_COOKIE, slug ?? "", {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // readable by JS
  });

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
