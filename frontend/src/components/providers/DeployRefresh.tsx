"use client";

/**
 * DeployRefresh — tell an open tab a newer build is live. Never take the page
 * out from under whoever is using it.
 *
 * A tab opened before a deploy keeps running the old JavaScript, and Next
 * hard-reloads on the next navigation, so the old screen flashes first. This
 * used to get ahead of that by reloading as soon as it noticed — which threw
 * away whatever the person was in the middle of. A brand admin building a
 * product's options would lose the lot, with no warning, several times on a
 * day we were shipping often.
 *
 * Nothing is worth that. A new build is now offered, not applied: a small bar,
 * one button, at a moment the person chooses. The flash on the next navigation
 * costs a few hundred milliseconds; an hour of somebody's configuration costs
 * an hour.
 */
import { useEffect, useState } from "react";

const THIS_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const DISMISSED_FOR = "at360_dismissed_build";

export function DeployRefresh() {
  const [newBuild, setNewBuild] = useState<string | null>(null);

  useEffect(() => {
    // Local dev and builds without an id have nothing to compare against.
    if (!THIS_BUILD) return;

    let busy = false;
    let stopped = false;

    async function check() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === THIS_BUILD) return;

        // Asked once per build. Told "later", we stay quiet about that one.
        let dismissed: string | null = null;
        try { dismissed = sessionStorage.getItem(DISMISSED_FOR); } catch { /* blocked */ }
        if (dismissed === build) return;

        setNewBuild(build);
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
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);

  if (!newBuild) return null;

  function later() {
    try { sessionStorage.setItem(DISMISSED_FOR, newBuild as string); } catch { /* blocked */ }
    setNewBuild(null);
  }

  return (
    <div role="status" style={S.bar}>
      <span style={S.text}>A newer version of this page is available.</span>
      <button onClick={() => window.location.reload()} style={S.reload}>Reload</button>
      <button onClick={later} style={S.later}>Later</button>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    position: "fixed", left: "50%", bottom: "20px", transform: "translateX(-50%)",
    zIndex: 9999, display: "flex", alignItems: "center", gap: "10px",
    background: "#111318", color: "#fff", borderRadius: "10px",
    padding: "10px 12px 10px 16px", boxShadow: "0 8px 24px rgba(0,0,0,.28)",
    fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "13.5px",
    maxWidth: "calc(100vw - 32px)",
  },
  text: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  reload: {
    background: "#fff", color: "#111318", border: "none", borderRadius: "7px",
    padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", flexShrink: 0,
  },
  later: {
    background: "none", color: "#9aa0aa", border: "none", padding: "6px 6px",
    fontSize: "13px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
  },
};
