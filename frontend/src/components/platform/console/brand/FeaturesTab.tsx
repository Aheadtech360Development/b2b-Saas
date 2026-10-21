"use client";

/**
 * A brand's features (design screen 4): every switch, grouped, each On, Off or
 * back to the Plan. The plan sets the defaults; anything decided for this one
 * brand is marked Granted or Removed, so an override never hides. The change
 * history is the brand's activity log for these switches.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { tell } from "@/lib/dialog";
import { platformService, type FeatureFlag, type TenantFeatures } from "@/services/platform.service";
import { consoleApi } from "../api";
import type { BrandTabProps } from "../BrandPage";
import { Failed, Loading, ago, errorText, useLoad } from "../ui";

type Show = "all" | "changed" | "granted" | "removed";

function changed(f: FeatureFlag) {
  return f.override !== null && f.override !== f.in_plan;
}

export function FeaturesTab({ brand }: BrandTabProps) {
  const { data, error, loading, reload, setData } = useLoad(() => platformService.getFeatures(brand.slug), [brand.slug]);
  const history = useLoad(() => consoleApi.activity({ brand: brand.slug, entity: "tenant_feature", page_size: 8 }), [brand.slug]);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const features = data?.features ?? [];
  const counts = {
    changed: features.filter(changed).length,
    granted: features.filter((f) => changed(f) && f.override === true).length,
    removed: features.filter((f) => changed(f) && f.override === false).length,
  };
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const kept = features.filter((f) =>
      (!term || f.label.toLowerCase().includes(term) || f.group.toLowerCase().includes(term))
      && (show === "all" || (show === "changed" ? changed(f) : changed(f) && f.override === (show === "granted"))));
    const map = new Map<string, FeatureFlag[]>();
    for (const f of kept) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return [...map.entries()];
  }, [features, q, show]);
  const notInPlan = features.filter((f) => !f.in_plan);

  async function set(f: FeatureFlag, value: boolean | null) {
    setBusy(f.feature);
    try {
      const next: TenantFeatures = await platformService.setFeature(brand.slug, f.feature, value);
      setData(next);
      void history.reload();
    } catch (e) {
      await tell(errorText(e, "The switch could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pc-two" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)" }}>
      <div className="pc-stack">
        <div className="pc-filters" style={{ marginBottom: 0 }}>
          <label className="pc-field" style={{ maxWidth: "none" }}>
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features" aria-label="Search features" />
          </label>
          <div className="pc-seg" role="group" aria-label="Show">
            {([["all", "All"], ["changed", `Changed from plan (${counts.changed})`], ["granted", "Granted"], ["removed", "Removed"]] as [Show, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="pc-hint" style={{ marginTop: -8 }}>
          {brand.plan_detail.name} sets the defaults. Anything changed from the plan is marked, so overrides never hide.
        </div>
        {error && <Failed message={error} onRetry={reload} />}
        {loading && !data ? <Loading what="Loading features" /> : null}
        {groups.map(([group, list]) => (
          <section key={group} className="pc-card">
            <div className="pc-card-head"><h2 className="pc-h2">{group}</h2></div>
            <div>
              {list.map((f) => (
                <div key={f.feature} className="pc-feature-row">
                  <div className="pc-feature-name">
                    {f.label}
                    {changed(f) && <span className="pc-pill" data-tone={f.override ? "blue" : "amber"} style={{ textTransform: "none" }}>
                      {f.override ? "Granted" : "Removed"}</span>}
                    {!f.in_plan && !changed(f) && <span className="pc-sub-line" style={{ margin: 0 }}>Not in {brand.plan_detail.name}</span>}
                  </div>
                  <div className="pc-tri" role="group" aria-label={f.label}>
                    {([[true, "On"], [false, "Off"], [null, "Plan"]] as [boolean | null, string][]).map(([v, l]) => (
                      <button key={l} type="button" disabled={busy === f.feature}
                        aria-pressed={v === null ? f.override === null : f.override === v}
                        onClick={() => void set(f, v)}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {data && groups.length === 0 && <div className="pc-empty">No feature matches.</div>}
      </div>

      <div className="pc-stack">
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Change history</h2></div>
          <div className="pc-panel-body">
            {history.data?.items.length ? history.data.items.map((r) => (
              <div key={r.id}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.summary || r.entity_type}</div>
                <div className="pc-sub-line">{r.actor_email ?? "Unknown"}, {ago(r.created_at)}</div>
              </div>
            )) : <div className="pc-hint">No feature has been changed for this brand from the console.</div>}
          </div>
        </section>
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">{brand.plan_detail.name} does not include</h2></div>
          <div className="pc-panel-body">
            {notInPlan.length ? notInPlan.map((f) => (
              <div key={f.feature} className="pc-kv"><span>{f.label}</span><b>{f.enabled ? "Granted" : "Off"}</b></div>
            )) : <div className="pc-hint">Everything is included.</div>}
            <div className="pc-hint">A granted feature stays on until you set it back to Plan.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
