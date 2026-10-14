"use client";

/**
 * A visitor who arrives with a partner's link (`?ref=CODE`, maybe `&src=tag`)
 * is counted, and the browser keeps `CODE.<click id>` for the program's cookie
 * window, so the sign-up can say whose link it was. A link that is off goes to
 * the "link not available" page. Mounted on the platform's home page and on
 * the sign-up page, where partners send people.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { papi } from "@/lib/partnerApi";

export const REFERRAL_COOKIE = "pc_ref";

export function readReferralCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)pc_ref=([^;]*)/);
  const value = m?.[1] ? decodeURIComponent(m[1]) : "";
  return /^[A-Z0-9]{3,20}\.\d+$/.test(value) ? value : null;
}

export function ReferralCapture({ onCaptured }: { onCaptured?: (cookie: string) => void } = {}) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) return;
    const src = params.get("src");
    papi<{ ok: boolean; code?: string; click_id?: number; cookie_days?: number }>("/partners/click", {
      auth: false,
      body: { code, src, landing: window.location.pathname, referrer: document.referrer || null },
    })
      .then((r) => {
        if (r.ok && r.code && r.click_id) {
          const secure = window.location.protocol === "https:" ? "; Secure" : "";
          document.cookie = `${REFERRAL_COOKIE}=${r.code}.${r.click_id}; Max-Age=${(r.cookie_days ?? 90) * 86400}; Path=/; SameSite=Lax${secure}`;
          params.delete("ref");
          params.delete("src");
          const rest = params.toString();
          history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
          onCaptured?.(`${r.code}.${r.click_id}`);
        } else {
          router.replace("/partners/unavailable");
        }
      })
      .catch(() => {
        // The visit still works; only the referral is not remembered.
      });
    // Once per page load: the link is read when the visitor arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
