"use client";

/**
 * The design's sign-in frame: the navy panel on the left with what the portal
 * is for, the form on the right. On a phone only the form shows.
 */
import { useEffect, useState, type ReactNode } from "react";

import { papi } from "@/lib/partnerApi";
import { Icon, ROOT } from "./ui";

export type ProgramInfo = {
  accepting_applications: boolean; accepting_referrals: boolean;
  standard_rate: string | null; standard_rate_bps: number | null;
  examples: { plan: string; name: string; price_cents: number; earns_cents: number }[];
  hold_days: number; minimum_payout_cents: number; cookie_days: number; support_email: string | null;
  terms: { version: number; clauses: { title: string; text: string }[]; published_at: string } | null;
};

export function useProgram(): ProgramInfo | null {
  const [info, setInfo] = useState<ProgramInfo | null>(null);
  useEffect(() => {
    papi<ProgramInfo>("/partners/program", { auth: false }).then(setInfo).catch(() => setInfo(null));
  }, []);
  return info;
}

export function AuthFrame({ children, support }: { children: ReactNode; support?: string | null }) {
  return (
    <div className={ROOT}>
      <div className="lg">
        <div className="lg-l">
          <div className="col" style={{ gap: 28 }}>
            <div style={{ font: "600 22px/28px var(--pcp-display), Inter, sans-serif", color: "#fff" }}>
              PrintCoPilot <span style={{ fontWeight: 500, color: "#8FA3BD" }}>Partners</span>
            </div>
            <h1 style={{ color: "#fff", fontSize: 36, lineHeight: "44px", maxWidth: 460 }}>
              Your link, your shops, your earnings. One place.
            </h1>
            <div className="col" style={{ gap: 14 }}>
              {["Copy your link and code in one tap", "Follow every referred shop from trial to paid",
                "See what is payable, what is pending, and when"].map((t) => (
                <div className="row nw" key={t} style={{ gap: 12, color: "#C9D5E6" }}>
                  <span style={{ color: "#6FB1FF" }}><Icon name="checkc" /></span>{t}
                </div>
              ))}
            </div>
          </div>
          <p className="sm" style={{ color: "#8FA3BD" }}>
            PrintCoPilot partner program.{support ? <> Questions: <a href={`mailto:${support}`} style={{ color: "#C9D5E6" }}>{support}</a></> : null}
          </p>
        </div>
        <div className="lg-r">
          <div className="lg-box">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Where to go after signing in: only somewhere inside the portal. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/partners/") && !raw.startsWith("//") ? raw : "/partners/dashboard";
}
