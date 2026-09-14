"use client";

/**
 * DeployRefresh — keep an open tab on the build that is actually live.
 *
 * A tab opened before a deploy keeps running the old JavaScript. The next time
 * the user clicks to another screen, the old code paints its version of that
 * screen, Next then notices the server is a newer build and hard-reloads — so
 * the old screen flashes for a moment before the new one replaces it.
 *
 * Checking when the tab comes back into view (and every few minutes while it is
 * open) lets the reload happen up front, while the user is not mid-click,
 * instead of in the middle of their next navigation.
 */
import { useEffect } from "react";

const THIS_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RELOADED_FOR = "at360_reloaded_for_build";

export function DeployRefresh() {
  useEffect(() => {
    // Local dev and builds without an id have nothing to compare against.
    if (!THIS_BUILD) return;

    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === THIS_BUILD) return;

        // One reload per new build. If the reload somehow lands on the old build
        // again (a CDN edge still serving it), don't spin in a loop.
        let already: string | null = null;
        try { already = sessionStorage.getItem(RELOADED_FOR); } catch { /* storage blocked */ }
        if (already === build) return;
        try { sessionStorage.setItem(RELOADED_FOR, build); } catch { /* storage blocked */ }

        window.location.reload();
      } catch {
        // Offline or the check failed — the next one will try again.
      } finally {
        busy = false;
      }
    }

    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = setInterval(check, CHECK_EVERY_MS);
    check();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);

  return null;
}
