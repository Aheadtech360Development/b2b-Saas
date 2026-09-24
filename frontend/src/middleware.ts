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
export const PATH_HEADER = "x-pathname";
export const HOST_HEADER = "x-storefront-host";

/** Whether this request arrived at the platform's own address rather than a
 *  shop's. Only true once the platform has a domain configured — on a preview
 *  deployment every address is the platform's and nothing here applies. */
export function isPlatformHost(hostname: string): boolean {
  if (PLATFORM_DOMAIN === "localhost") return false;
  return hostname === PLATFORM_DOMAIN || hostname === `www.${PLATFORM_DOMAIN}`;
}

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

  // The platform's own address is the platform's. A shop asked for here is
  // redirected to where it lives (below), and a cookie from some earlier visit
  // must not turn this page into a shop — that is what made the address the
  // platform hands out show a different thing depending on who opened it.
  if (isPlatformHost(hostname)) return null;

  // 2. `?tenant=<slug>` — for hosts without wildcard subdomains (preview deploys).
  //    Present-but-empty (`?tenant=`) is an explicit "no tenant": platform admins
  //    sign in at the root with no tenant scope, and without a way to clear it the
  //    sticky cookie below would scope their login to whichever brand was browsed
  //    last, failing the login with a misleading "invalid credentials".
  if (request.nextUrl.searchParams.has("tenant")) {
    return request.nextUrl.searchParams.get("tenant") || null;
  }

  // 3. Cookie set by an earlier request, so in-app navigation keeps the brand.
  return request.cookies.get(TENANT_COOKIE)?.value || null;
}

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;

  // A shop asked for on the platform's own address goes to its own address
  // instead of being served here under a second one. One shop, one place.
  const wanted = request.nextUrl.searchParams.get("tenant");
  if (isPlatformHost(hostname) && wanted) {
    const to = request.nextUrl.clone();
    to.hostname = `${wanted}.${PLATFORM_DOMAIN}`;
    to.searchParams.delete("tenant");
    return NextResponse.redirect(to, 307);
  }

  const slug = resolveSlug(request);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set(TENANT_HEADER, slug);
  } else {
    // Never let a stale inbound header survive resolution.
    requestHeaders.delete(TENANT_HEADER);
  }
  // Which page is being served. A layout is not told its own path, and the
  // root layout has to decide before it renders whether this page belongs to
  // the storefront (and so wears the brand's header and footer) or to the
  // admin console. Deciding it in the browser is what makes chrome flash.
  requestHeaders.set(PATH_HEADER, request.nextUrl.pathname);
  // The address the visitor typed. When there is no subdomain, no cookie and
  // no ?tenant=, this is the only thing that says which shop they wanted.
  //
  // An empty `?tenant=` is an explicit "no brand" — how a platform admin signs
  // in at the root — so the address is withheld there, or it would put them
  // back in a brand they were deliberately leaving.
  const noTenantWanted = request.nextUrl.searchParams.has("tenant")
    && !request.nextUrl.searchParams.get("tenant");
  if (noTenantWanted) requestHeaders.delete(HOST_HEADER);
  else requestHeaders.set(HOST_HEADER, request.nextUrl.hostname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // On a shop's address the cookie carries the brand through in-app
  // navigation. On the platform's own address there is no brand to carry, and
  // writing one there is how the platform's home page ended up showing a shop.
  if (!isPlatformHost(hostname)) {
    response.cookies.set(TENANT_COOKIE, slug ?? "", {
      path: "/",
      sameSite: "lax",
      httpOnly: false, // readable by JS
    });
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
