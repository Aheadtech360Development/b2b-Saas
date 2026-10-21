"use client";

/**
 * One brand (design screens 2 to 6): its overview, plan and billing,
 * features, people, addresses, history and the dangerous actions, as tabs.
 * The tab is kept in the address (?tab=), so a reload or a link opens it again.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { consoleApi, type BrandDetail } from "./api";
import { openConsole } from "./openConsole";
import { Failed, Loading, StatusPill, useLoad } from "./ui";
import { OverviewTab } from "./brand/OverviewTab";
import { PlanTab } from "./brand/PlanTab";
import { FeaturesTab } from "./brand/FeaturesTab";
import { UsersTab } from "./brand/UsersTab";
import { DomainTab } from "./brand/DomainTab";
import { DangerTab } from "./brand/DangerTab";
import { ActivityTable } from "./ActivityTable";

const TABS = [
  ["overview", "Overview"], ["plan", "Plan and billing"], ["features", "Features"], ["users", "Users"],
  ["domain", "Domain"], ["activity", "Activity"], ["danger", "Danger zone"],
] as const;
type Tab = (typeof TABS)[number][0];

export interface BrandTabProps {
  brand: BrandDetail;
  /** Read the brand again after a change. */
  reload: () => Promise<void>;
  /** Go to another tab. */
  go: (tab: Tab) => void;
}

export function BrandPage({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "overview") as Tab;
  const { data: brand, error, loading, reload } = useLoad(() => consoleApi.brand(slug), [slug]);

  function go(next: Tab) {
    router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <div data-console-brand>
      <Link href="/platform" className="pc-back"><ArrowLeft size={16} /> Brands</Link>
      {error && <Failed message={error} onRetry={reload} />}
      {loading && !brand ? <Loading what="Loading the brand" /> : null}
      {brand && (
        <>
          <div className="pc-head" style={{ marginBottom: 18 }}>
            <div>
              <div className="pc-eyebrow">Brand</div>
              <div className="pc-title-row">
                <h1 className="pc-h1">{brand.name}</h1>
                {brand.status !== "active" && <StatusPill status={brand.status} />}
              </div>
              <p className="pc-lede">Store: {brand.slug}{brand.custom_domain ? ` · ${brand.custom_domain}` : ""}</p>
            </div>
            <div className="pc-row-actions">
              <a className="pc-btn" href={brand.store_url} target="_blank" rel="noreferrer">
                View store <ExternalLink size={14} />
              </a>
              <button type="button" className="pc-btn" data-kind="primary" onClick={() => void openConsole(brand.slug, brand.name)}>
                Open console
              </button>
            </div>
          </div>
          <nav className="pc-tabs" aria-label="Brand">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" className="pc-tab" data-on={tab === key ? "" : undefined}
                aria-current={tab === key ? "page" : undefined} onClick={() => go(key)}>
                {label}
                {key === "users" && <span className="pc-tab-count">{brand.users}</span>}
              </button>
            ))}
          </nav>
          {tab === "overview" && <OverviewTab brand={brand} reload={reload} go={go} />}
          {tab === "plan" && <PlanTab brand={brand} reload={reload} go={go} />}
          {tab === "features" && <FeaturesTab brand={brand} reload={reload} go={go} />}
          {tab === "users" && <UsersTab brand={brand} reload={reload} go={go} />}
          {tab === "domain" && <DomainTab brand={brand} reload={reload} go={go} />}
          {tab === "activity" && <ActivityTable brand={brand.slug} />}
          {tab === "danger" && <DangerTab brand={brand} reload={reload} go={go} />}
        </>
      )}
    </div>
  );
}
