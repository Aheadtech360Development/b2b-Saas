"use client";

/**
 * Discounts: the codes buyers type at checkout (api/v1/admin/discounts.py),
 * listed with how often each was used, and made or changed in the panel
 * beside the list. A code is never deleted: turning it off keeps its history
 * on the orders that used it.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";

interface DiscountCode {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount" | "free_shipping";
  discount_value: number;
  minimum_order_amount: number | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  applicable_to: string;
  customer_eligibility: string;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  usage_count: number;
}

interface Draft {
  code: string;
  discount_type: DiscountCode["discount_type"];
  discount_value: string;
  minimum_order_amount: string;
  usage_limit_total: string;
  usage_limit_per_customer: string;
  customer_eligibility: string;
  starts: string;
  ends: string;
  is_active: boolean;
}

const EMPTY: Draft = {
  code: "", discount_type: "percentage", discount_value: "", minimum_order_amount: "",
  usage_limit_total: "", usage_limit_per_customer: "", customer_eligibility: "all", starts: "", ends: "", is_active: true,
};
const TYPES: [Draft["discount_type"], string][] = [["percentage", "Percentage"], ["fixed_amount", "Fixed amount"], ["free_shipping", "Free shipping"]];
const WHO: Record<string, string> = { all: "All customers", wholesale: "Wholesale only", retail: "Retail only" };
const PAGE_SIZE = 50;

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A stored moment as the day it falls on here, for a date box. */
const localDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function typeWords(d: DiscountCode): string {
  if (d.discount_type === "percentage") return `${Number(d.discount_value)}% off`;
  if (d.discount_type === "fixed_amount") return `${money(Number(d.discount_value))} off`;
  return "Free shipping";
}

function standing(d: DiscountCode): [string, string] {
  const now = Date.now();
  if (!d.is_active) return ["Off", ""];
  if (d.expires_at && new Date(d.expires_at).getTime() < now) return ["Expired", ""];
  if (d.usage_limit_total != null && d.usage_count >= d.usage_limit_total) return ["Used up", "amber"];
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return ["Scheduled", "blue"];
  return ["Active", "green"];
}

function toDraft(d: DiscountCode): Draft {
  return {
    code: d.code, discount_type: d.discount_type,
    discount_value: d.discount_type === "free_shipping" ? "" : String(Number(d.discount_value)),
    minimum_order_amount: d.minimum_order_amount != null ? String(Number(d.minimum_order_amount)) : "",
    usage_limit_total: d.usage_limit_total != null ? String(d.usage_limit_total) : "",
    usage_limit_per_customer: d.usage_limit_per_customer != null ? String(d.usage_limit_per_customer) : "",
    customer_eligibility: d.customer_eligibility || "all",
    starts: localDay(d.starts_at), ends: localDay(d.expires_at), is_active: d.is_active,
  };
}

export default function DiscountsPage() {
  return <Suspense fallback={null}><Discounts /></Suspense>;
}

function Discounts() {
  const [rows, setRows] = useState<DiscountCode[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [qText, setQText] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // The panel: null shut, "new" for a new code, or the code being changed.
  const [editing, setEditing] = useState<"new" | DiscountCode | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      const data = await apiClient.get<{ items: DiscountCode[]; total: number; pages: number }>(`/api/v1/admin/discounts?${params}`);
      if (mine !== asked.current) return;
      setRows(data.items ?? []); setTotal(data.total ?? 0); setPages(data.pages || 1); setFailed(false);
    } catch {
      if (mine === asked.current) { setRows([]); setFailed(true); }
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setTimeout(() => { setPage(1); setQ(qText.trim()); }, 300);
    return () => window.clearTimeout(t);
  }, [qText]);

  function openNew() { setEditing("new"); setDraft(EMPTY); setError(""); }
  function openCode(d: DiscountCode) {
    if (editing !== "new" && editing?.id === d.id) { setEditing(null); return; }
    setEditing(d); setDraft(toDraft(d)); setError("");
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  async function save() {
    const code = draft.code.trim().toUpperCase();
    if (!code) { setError("Give the code buyers will type, for example SUMMER10."); return; }
    if (/\s/.test(code)) { setError("A code cannot have spaces in it."); return; }
    const value = Number(draft.discount_value);
    if (draft.discount_type !== "free_shipping" && !(value > 0)) { setError("Say how much it takes off."); return; }
    if (draft.discount_type === "percentage" && value > 100) { setError("A percentage cannot be more than 100."); return; }
    if (draft.starts && draft.ends && draft.ends < draft.starts) { setError("It cannot end before it starts."); return; }
    const old = editing && editing !== "new" ? editing : null;
    // A day box keeps a code's own moment when the day was not changed.
    const starts = old && draft.starts === localDay(old.starts_at) ? old.starts_at
      : draft.starts ? new Date(`${draft.starts}T00:00:00`).toISOString() : null;
    const ends = old && draft.ends === localDay(old.expires_at) ? old.expires_at
      : draft.ends ? new Date(`${draft.ends}T23:59:59`).toISOString() : null;
    const num = (s: string) => (s.trim() ? Number(s) : null);
    const body = {
      code, discount_type: draft.discount_type,
      discount_value: draft.discount_type === "free_shipping" ? 0 : value,
      minimum_order_amount: num(draft.minimum_order_amount),
      usage_limit_total: num(draft.usage_limit_total),
      usage_limit_per_customer: num(draft.usage_limit_per_customer),
      applicable_to: old?.applicable_to ?? "all",
      customer_eligibility: draft.customer_eligibility,
      starts_at: starts, expires_at: ends, is_active: draft.is_active,
    };
    setSaving(true); setError("");
    try {
      if (old) {
        const { code: _code, ...changes } = body;
        void _code;
        const saved = await apiClient.patch<DiscountCode>(`/api/v1/admin/discounts/${old.id}`, changes);
        setEditing(saved); setDraft(toDraft(saved));
        setFlash(`Saved ${saved.code}.`);
      } else {
        const saved = await apiClient.post<DiscountCode>("/api/v1/admin/discounts", { ...body, applicable_ids: [] });
        setEditing(saved); setDraft(toDraft(saved));
        setFlash(`${saved.code} is ready. Buyers type it at checkout.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The discount could not be saved.");
    }
    setSaving(false);
  }

  async function turnOff(d: DiscountCode) {
    if (!await ask(`Turn off ${d.code}? Buyers can no longer use it. Orders that used it keep their discount.`, { title: "Turn off this code", ok: "Turn off", danger: true })) return;
    try {
      await apiClient.delete(`/api/v1/admin/discounts/${d.id}`);
      setFlash(`${d.code} is off.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The code could not be turned off.");
    }
  }

  const open = editing && editing !== "new" ? editing : null;
  const panel = editing !== null;
  const searching = !!q;

  return (
    <MarketingFrame
      active="discounts" title="Discounts" sub="Codes buyers type at checkout, and how often each is used."
      actions={<button type="button" className="pc-btn" data-kind="primary" onClick={openNew}><Plus size={17} strokeWidth={2.4} /> New discount</button>}
    >
      {flash && (
        <div className="pc-flash" role="status">
          <span>{flash}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash("")} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: 1 }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by code" aria-label="Search by code" />
        </label>
      </div>

      <div className="pc-list" data-panel={panel ? "" : undefined}>
        <div style={{ display: "grid", gap: "14px", minWidth: 0 }}>
          <div className="pc-card" aria-busy={loading} data-discounts={loading ? undefined : rows.length}>
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "640px" }}>
                <thead>
                  <tr><th>Code</th><th>Type</th><th>Used</th><th>Expires</th><th>Who</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && [0, 1, 2].map((i) => (
                    <tr key={i}><td colSpan={6}><div className="at-skel" style={{ height: "18px", width: `${66 - i * 10}%`, borderRadius: "6px" }} /></td></tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={6} className="pc-empty">
                      {failed ? "The codes could not be loaded. Reload to try again." : searching ? "No code matches this search." : "No codes yet."}
                    </td></tr>
                  )}
                  {rows.map((d) => {
                    const [label, tone] = standing(d);
                    return (
                      <tr key={d.id} data-href data-code={d.code} tabIndex={0} data-open={open?.id === d.id ? "" : undefined}
                        onClick={() => openCode(d)} onKeyDown={(e) => { if (e.key === "Enter") openCode(d); }}>
                        <td style={{ fontWeight: 700, letterSpacing: ".03em", whiteSpace: "nowrap" }}>{d.code}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{typeWords(d)}
                          {d.minimum_order_amount != null && Number(d.minimum_order_amount) > 0 && <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>Orders over {money(Number(d.minimum_order_amount))}</div>}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{d.usage_limit_total != null ? `${d.usage_count} of ${d.usage_limit_total}` : `${d.usage_count}`}</td>
                        <td style={{ whiteSpace: "nowrap", color: d.expires_at ? undefined : "var(--pc-muted)" }}>{d.expires_at ? shortDay(d.expires_at) : "Never"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{WHO[d.customer_eligibility] ?? d.customer_eligibility}</td>
                        <td><span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pc-table-foot">
              <span>{total} {total === 1 ? "code" : "codes"}</span>
              {pages > 1 ? (
                <span className="pc-row-actions">
                  <button type="button" className="pc-link" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" className="pc-link" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ opacity: page >= pages ? 0.4 : 1 }}>Next</button>
                </span>
              ) : <span>Click a code to change it</span>}
            </div>
          </div>
          {!loading && !failed && total === 0 && !searching && (
            <div className="pc-note" data-tone="blue">No codes yet. Make one with New discount, then share it in an email, a post or on your storefront.</div>
          )}
        </div>

        {panel && (
          <aside className="pc-panel" aria-label={open ? `Discount ${open.code}` : "New discount"} data-discount-panel>
            <div className="pc-panel-head">
              <div style={{ minWidth: 0 }}>
                <h2 className="pc-h2">{open ? open.code : "New discount"}</h2>
                {open && <div className="pc-sub-line">Used {open.usage_count} {open.usage_count === 1 ? "time" : "times"}</div>}
              </div>
              <button type="button" className="pc-x" aria-label="Close the panel" onClick={() => setEditing(null)}><X size={19} strokeWidth={2.2} /></button>
            </div>
            <form className="pc-panel-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
              <div>
                <label className="pc-label" htmlFor="dc-code">Code</label>
                <input id="dc-code" className="pc-input" value={draft.code} placeholder="SUMMER10" disabled={!!open} autoComplete="off"
                  onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} style={{ fontWeight: 600, letterSpacing: ".03em" }} />
                {open && <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px" }}>A code keeps its name; make a new one for a new name.</div>}
              </div>
              <div>
                <label className="pc-label" htmlFor="dc-type">Type</label>
                <select id="dc-type" className="pc-input" value={draft.discount_type} onChange={(e) => set("discount_type", e.target.value as Draft["discount_type"])}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {draft.discount_type !== "free_shipping" && (
                <div>
                  <label className="pc-label" htmlFor="dc-value">{draft.discount_type === "percentage" ? "Percent off" : "Amount off ($)"}</label>
                  <input id="dc-value" className="pc-input" type="number" inputMode="decimal" min="0" step={draft.discount_type === "percentage" ? "1" : "0.01"}
                    max={draft.discount_type === "percentage" ? "100" : undefined} value={draft.discount_value}
                    placeholder={draft.discount_type === "percentage" ? "10" : "5.00"} onChange={(e) => set("discount_value", e.target.value)} />
                </div>
              )}
              <div>
                <label className="pc-label" htmlFor="dc-min">Only on orders over ($)</label>
                <input id="dc-min" className="pc-input" type="number" inputMode="decimal" min="0" step="0.01" value={draft.minimum_order_amount} placeholder="Any order" onChange={(e) => set("minimum_order_amount", e.target.value)} />
              </div>
              <div className="pc-form2">
                <div>
                  <label className="pc-label" htmlFor="dc-limit">Uses in all</label>
                  <input id="dc-limit" className="pc-input" type="number" min="1" step="1" value={draft.usage_limit_total} placeholder="No limit" onChange={(e) => set("usage_limit_total", e.target.value)} />
                </div>
                <div>
                  <label className="pc-label" htmlFor="dc-each">Uses per customer</label>
                  <input id="dc-each" className="pc-input" type="number" min="1" step="1" value={draft.usage_limit_per_customer} placeholder="No limit" onChange={(e) => set("usage_limit_per_customer", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="pc-label" htmlFor="dc-who">Who can use it</label>
                <select id="dc-who" className="pc-input" value={draft.customer_eligibility} onChange={(e) => set("customer_eligibility", e.target.value)}>
                  {Object.entries(WHO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="pc-form2">
                <div>
                  <label className="pc-label" htmlFor="dc-starts">Starts</label>
                  <input id="dc-starts" className="pc-input" type="date" value={draft.starts} max={draft.ends || undefined} onChange={(e) => set("starts", e.target.value)} />
                </div>
                <div>
                  <label className="pc-label" htmlFor="dc-ends">Ends</label>
                  <input id="dc-ends" className="pc-input" type="date" value={draft.ends} min={draft.starts || undefined} onChange={(e) => set("ends", e.target.value)} />
                </div>
              </div>
              <div className="pc-switch-row">
                <span>On<div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>Buyers can use it while it is on.</div></span>
                <button type="button" className="pc-switch" role="switch" aria-label="On" aria-checked={draft.is_active} data-on={draft.is_active ? "" : undefined}
                  onClick={() => set("is_active", !draft.is_active)} />
              </div>
              <button type="submit" className="pc-btn" data-kind="primary" data-block="" disabled={saving} style={{ height: "46px" }}>
                {saving ? "Saving…" : open ? "Save" : "Create code"}
              </button>
              {open?.is_active && (
                <button type="button" className="pc-btn" data-block="" disabled={saving} onClick={() => turnOff(open)} style={{ height: "42px" }}>Turn off</button>
              )}
            </form>
          </aside>
        )}
      </div>
    </MarketingFrame>
  );
}
