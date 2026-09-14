import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Silence the "multiple lockfiles" workspace root warning
    root: path.resolve(__dirname),
  },
  experimental: {
    // The active tenant travels in a request header (set by middleware), not in
    // the URL path — so Next's client Router Cache, which keys on the path,
    // cannot tell one brand's render of /products from another's and would serve
    // whichever tenant was cached first. That is exactly the "other store's
    // products flash, then the right ones" bug. Disabling reuse of dynamic
    // segments forces a fresh server render (fresh tenant) on every navigation.
    staleTimes: { dynamic: 0 },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    // Baked in at build so an open tab knows which build it is running; compared
    // against /api/version to catch a tab left open across a deploy.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "http",  hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
