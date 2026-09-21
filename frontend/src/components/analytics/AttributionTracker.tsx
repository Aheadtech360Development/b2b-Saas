"use client";

/**
 * Records where each visitor came from, on every page they open.
 *
 * Mounted once in the root layout. The work itself — and the rules about what
 * replaces what — lives in lib/attribution.ts; this only decides when to run it.
 *
 * `usePathname` is enough to notice a navigation, and the query string is read
 * from `window.location` inside the effect rather than with `useSearchParams`,
 * which would force every page under this layout into a Suspense boundary.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";

export function AttributionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttribution();
  }, [pathname]);

  return null;
}
