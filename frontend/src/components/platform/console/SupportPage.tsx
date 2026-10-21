"use client";

/**
 * Support (design screen 14): get into a brand with a reason on record. The
 * visit is a short session in the brand's owner's place, marked as support's
 * in the brand's admin, ending by itself, and logged against the brand with
 * its reason. The recent visits are listed below.
 */
import Link from "next/link";
import { useState } from "react";
import { tell } from "@/lib/dialog";
import { enterBrandDashboard } from "@/services/platform.service";
import { consoleApi } from "./api";
import { Failed, Loading, PageHead, errorText, useLoad, when } from "./ui";

const REASONS = ["Support request", "Billing question", "Setup help", "Investigating a problem", "Other"];
const LENGTHS = [15, 30, 60, 120, 240];

export function SupportPage() {
  const brands = useLoad(() => consoleApi.brands(), []);
  const visits = useLoad(() => consoleApi.activity({ entity: "impersonation_session", page_size: 15 }), []);
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState(REASONS[0]!);
  const [details, setDetails] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const list = brands.data?.items ?? [];
  const chosen = list.find((b) => b.slug === slug);

  async function open() {
    if (!chosen) return void tell("Choose the brand to open.");
    if (!details.trim()) return void tell("Say what you are going in for: it is kept with the visit.");
    setBusy(true);
    try {
      await enterBrandDashboard(chosen.slug, { reason: `${reason}: ${details.trim()}`, minutes });
      setDetails("");
      void visits.reload();
    } catch (e) {
      await tell(errorText(e, "The brand's console could not be opened."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead eyebrow="Support" title="Support" lede="Get into a brand with a reason on record." />
      <div className="pc-two">
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">Open a brand console</h2></div>
          <div className="pc-panel-body">
            {brands.error && <Failed message={brands.error} onRetry={brands.reload} />}
            <div><label className="pc-label" htmlFor="sp-brand">Brand</label>
              <select id="sp-brand" className="pc-input" value={slug} onChange={(e) => setSlug(e.target.value)}>
                <option value="">Choose a brand</option>
                {list.map((b) => <option key={b.slug} value={b.slug}>{b.name} ({b.slug})</option>)}
              </select></div>
            <div><label className="pc-label" htmlFor="sp-reason">Reason</label>
              <select id="sp-reason" className="pc-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select></div>
            <div><label className="pc-label" htmlFor="sp-details">Details (required)</label>
              <textarea id="sp-details" className="pc-input" value={details} onChange={(e) => setDetails(e.target.value)}
                placeholder="For example: the owner asked why order 1005 shows unpaid" /></div>
            <div><label className="pc-label" htmlFor="sp-length">Session length</label>
              <select id="sp-length" className="pc-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {LENGTHS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}
              </select></div>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy || !slug} onClick={() => void open()}>
              {busy ? "Opening…" : "Open console"}
            </button>
            <div className="pc-hint">Every visit is logged with its reason in Activity and in the brand&apos;s own history.</div>
          </div>
        </section>
        <section className="pc-card">
          <div className="pc-card-head"><h2 className="pc-h2">What you see inside the brand</h2></div>
          <div className="pc-panel-body">
            <div style={{ background: "#0C1F3F", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13.5, lineHeight: 1.45 }}>
              <b>Platform support session</b> You are in this shop as support, in the owner&apos;s place. Everything you change is logged as support. Ends at the time you chose.
            </div>
            <div className="pc-hint">The session ends by itself and is never renewed. End session closes it at once.</div>
          </div>
        </section>
      </div>

      <section className="pc-card" style={{ marginTop: 20 }}>
        <div className="pc-card-head"><h2 className="pc-h2">Recent support visits</h2></div>
        {visits.loading && !visits.data ? <Loading what="Loading visits" /> : null}
        {visits.data && (
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: 680 }}>
              <thead><tr><th>Brand</th><th>Reason</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                {visits.data.items.length === 0 && <tr><td colSpan={4} className="pc-empty">No support visits yet.</td></tr>}
                {visits.data.items.map((v) => {
                  const values = (v.new_values ?? {}) as { reason?: string; minutes?: number; brand?: string };
                  return (
                    <tr key={v.id}>
                      <td>{v.brand_slug ? <Link href={`/platform/brands/${v.brand_slug}?tab=activity`} className="pc-row-title">{v.brand_name ?? values.brand ?? v.brand_slug}</Link> : values.brand}</td>
                      <td>{values.reason ?? <span className="pc-sub-line">No reason recorded</span>}{values.minutes ? <div className="pc-sub-line">{values.minutes} minutes</div> : null}</td>
                      <td>{v.actor_email ?? "Unknown"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{when(v.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
