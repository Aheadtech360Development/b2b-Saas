/**
 * Next.js Middleware — Multi-tenant subdomain routing.
 *
 * Local:      http://demo.localhost:3000  → tenant slug = "demo"
 * Production: https://demo.platform.com  → tenant slug = "demo"
 *
 * Sets x-tenant-slug header so API calls carry the tenant context.
 */
import { NextRequest, NextResponse } from "next/server";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname; // "demo.localhost" or "demo.platform.com"
  const response = NextResponse.next();

  let slug: string | null = null;

  if (
    hostname === PLATFORM_DOMAIN ||
    hostname === `www.${PLATFORM_DOMAIN}` ||
    hostname === "localhost"
  ) {
    // Root domain or plain localhost — no tenant (platform admin)
    slug = null;
  } else if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    // subdomain.platform.com → slug = "subdomain"
    slug = hostname.slice(0, -(PLATFORM_DOMAIN.length + 1));
  }

  // Forward slug to all API calls via custom header
  if (slug) {
    response.headers.set("x-tenant-slug", slug);
  }

  // Store slug in a cookie so client components can read it
  response.cookies.set("tenant_slug", slug ?? "", {
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
