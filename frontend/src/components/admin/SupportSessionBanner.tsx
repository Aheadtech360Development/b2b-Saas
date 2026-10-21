"use client";

/**
 * Platform support is inside this shop (the Platform Console's Open console).
 *
 * Support works in the owner's session, so without a sign of it the admin
 * looked exactly like the owner's own. The banner says whose session it
 * really is and when it ends; the session is never renewed (lib/api-client),
 * and what is done in it is logged against the support person.
 */
import { useEffect, useState } from "react";
import { apiClient, isSupportSession } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

/** End a support visit on the server too: its token is revoked there, so a
 *  copy of it (another tab opened from this one) stops working as well.
 *  Not /logout, which would also sign the platform admin and the owner out. */
export async function endSupportVisit(): Promise<void> {
  if (!isSupportSession()) return;
  try {
    await apiClient.post("/api/v1/auth/support/end");
  } catch {
    // Ended here regardless; the token runs out by itself soon after.
  }
}

interface SupportClaims {
  impersonated?: boolean;
  impersonator_email?: string | null;
  exp?: number;
}

function claimsOf(token: string | null): SupportClaims | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as SupportClaims;
    return claims.impersonated ? claims : null;
  } catch {
    return null;
  }
}

export function SupportSessionBanner() {
  const token = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const claims = claimsOf(token);
  const [now, setNow] = useState(() => Date.now());

  const support = claims !== null;
  useEffect(() => {
    if (!support) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [support]);

  if (!claims) return null;

  const endsAt = claims.exp ? new Date(claims.exp * 1000) : null;
  const minutesLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now) / 60_000)) : null;
  const end = async () => {
    await endSupportVisit();
    clearAuth();
    // Opened in its own tab from the console: closing it goes back there.
    window.close();
    window.location.href = "/login";
  };

  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      padding: "9px 16px", background: "#0C1F3F", color: "#FFFFFF", fontSize: "13.5px", lineHeight: 1.4,
    }}>
      <strong style={{ fontWeight: 700 }}>Platform support session</strong>
      <span style={{ color: "rgba(255,255,255,.82)" }}>
        You are in this shop as {claims.impersonator_email || "platform support"}, in the owner&apos;s place.
        Everything you change is logged as support.
        {minutesLeft !== null && endsAt
          ? ` Ends at ${endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (${minutesLeft} min).`
          : ""}
      </span>
      <button type="button" onClick={() => void end()} style={{
        marginLeft: "auto", padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(255,255,255,.35)",
        background: "transparent", color: "#FFFFFF", fontWeight: 600, fontSize: "13px", cursor: "pointer",
      }}>
        End session
      </button>
    </div>
  );
}
