"use client";

/**
 * The Platform Console's Affiliates tab: the super admin's side of the
 * partner program, with the design's own menu on the left. Where you are is
 * kept in the address (#affiliates/<section>/<id>), so a reload or a shared
 * link opens the same screen.
 */
import { useCallback, useEffect, useState } from "react";

import { Count, Icon, ROOT, type IconName } from "@/components/partners/ui";
import { aff } from "./api";
import { ActivityLog } from "./ActivityLog";
import { AffiliateDetail } from "./AffiliateDetail";
import { AffiliatesList } from "./AffiliatesList";
import { ApplicationDetail, Applications } from "./Applications";
import { Ledger } from "./Ledger";
import { Overview } from "./Overview";
import { Payouts } from "./Payouts";
import { Referrals } from "./Referrals";
import { ProgramSettings } from "./ProgramSettings";
import { StripeEvents } from "./StripeEvents";

export type Section = "overview" | "applications" | "affiliates" | "referrals" | "ledger" | "payouts"
  | "settings" | "activity" | "stripe";

export type Go = (section: Section, id?: string) => void;

type Route = { section: Section; id?: string };

const MENU: { section: Section; label: string; icon: IconName; group?: "program" }[] = [
  { section: "overview", label: "Overview", icon: "grid" },
  { section: "applications", label: "Applications", icon: "file" },
  { section: "affiliates", label: "Affiliates", icon: "users" },
  { section: "referrals", label: "Referrals", icon: "link" },
  { section: "ledger", label: "Ledger", icon: "dollar" },
  { section: "payouts", label: "Payouts", icon: "wallet" },
  { section: "settings", label: "Settings", icon: "sliders", group: "program" },
  { section: "activity", label: "Activity log", icon: "history", group: "program" },
  { section: "stripe", label: "Stripe events", icon: "zap", group: "program" },
];

function parse(hash: string): Route {
  const parts = hash.replace(/^#/, "").split("/");
  if (parts[0] !== "affiliates") return { section: "overview" };
  const section = (MENU.find((m) => m.section === parts[1])?.section ?? "overview") as Section;
  return { section, id: parts[2] || undefined };
}

export function AffiliatesTab({ onCount }: { onCount?: (n: number) => void }) {
  const [route, setRoute] = useState<Route>({ section: "overview" });
  const [badge, setBadge] = useState({ applications: 0, review: 0, failed: 0 });

  useEffect(() => {
    setRoute(parse(window.location.hash));
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshBadge = useCallback(() => {
    aff.get<typeof badge>("/badge").then((b) => { setBadge(b); onCount?.(b.applications); }).catch(() => undefined);
  }, [onCount]);

  useEffect(() => { refreshBadge(); }, [refreshBadge, route]);

  const go: Go = useCallback((section, id) => {
    const next = `#affiliates/${section}${id ? `/${id}` : ""}`;
    if (window.location.hash !== next) window.location.hash = next;
    else setRoute({ section, id });
    window.scrollTo({ top: 0 });
  }, []);

  const counts: Partial<Record<Section, { n: number; tone?: "warn" | "bad" }>> = {
    applications: { n: badge.applications, tone: "warn" },
    referrals: { n: badge.review, tone: "warn" },
    stripe: { n: badge.failed, tone: "bad" },
  };

  const { section, id } = route;
  // The console's column is 1200px wide; the design's tab is the width of
  // the screen. The tab steps out of the column, centred under it, up to
  // the design's width. (A margin, not a transform: a transform would pull
  // the toasts' fixed position in with it.)
  return (
    <div className={ROOT} style={{
      border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden",
      width: "min(1392px, calc(100vw - 32px))", marginLeft: "calc(50% - min(696px, 50vw - 16px))",
    }}>
      <div className="conbody">
        <nav className="sub" aria-label="Affiliates">
          <span className="eyebrow">Affiliates</span>
          {MENU.filter((m) => !m.group).map((m) => (
            <a key={m.section} href={`#affiliates/${m.section}`} className={section === m.section ? "on" : ""}
               aria-current={section === m.section ? "page" : undefined}>
              <Icon name={m.icon} />{m.label}
              {counts[m.section] ? <Count n={counts[m.section]!.n} tone={counts[m.section]!.tone} /> : null}
            </a>
          ))}
          <span className="eyebrow">Program</span>
          {MENU.filter((m) => m.group).map((m) => (
            <a key={m.section} href={`#affiliates/${m.section}`} className={section === m.section ? "on" : ""}
               aria-current={section === m.section ? "page" : undefined}>
              <Icon name={m.icon} />{m.label}
              {counts[m.section] ? <Count n={counts[m.section]!.n} tone={counts[m.section]!.tone} /> : null}
            </a>
          ))}
        </nav>
        <main className="acontent">
          {section === "overview" && <Overview go={go} />}
          {section === "applications" && (id ? <ApplicationDetail id={id} go={go} onChanged={refreshBadge} /> : <Applications go={go} />)}
          {section === "affiliates" && (id && id !== "new"
            ? <AffiliateDetail id={id} go={go} /> : <AffiliatesList go={go} adding={id === "new"} />)}
          {section === "referrals" && <Referrals go={go} openId={id} onChanged={refreshBadge} />}
          {section === "ledger" && <Ledger go={go} />}
          {section === "payouts" && <Payouts go={go} />}
          {section === "settings" && <ProgramSettings />}
          {section === "activity" && <ActivityLog go={go} />}
          {section === "stripe" && <StripeEvents onChanged={refreshBadge} />}
        </main>
      </div>
    </div>
  );
}
