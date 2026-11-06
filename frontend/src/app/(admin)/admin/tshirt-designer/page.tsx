"use client";

/**
 * Products → T-shirt designer: the shop's product customizer.
 *
 *   Products  which of the shop's products customers can design (each drawn on
 *             a garment shape, with or without embroidery), added from the
 *             catalog or switched on from a product's own page
 *   Prices    what decoration costs: per printed side by quantity break,
 *             embroidery from a minimum, names and numbers
 *   Designs   what customers designed: their shirts, print files and total,
 *             the order each was bought on, and where it stands (an ordered
 *             design is on Production too; one in a cart is not ordered yet)
 *
 * The designer itself is /design on the storefront; a product switched on here
 * gets "Design your own" on its page (backend services/tshirt_designer).
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Plus, Search, Trash2, X } from "lucide-react";
import { ask, tell } from "@/lib/dialog";
import { originalFile } from "@/lib/download";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { UpgradeNotice } from "@/components/admin/UpgradeNotice";
import {
  tshirtDesignerService as api, tshirtDesignsService as designs,
  type DesignerProduct, type DesignerRates, type DesignerSettings, type DesignerSetup, type DesignerTier,
  type TShirtDesignRecord,
} from "@/services/tshirtDesigns.service";

type TabKey = "products" | "prices" | "designs";
const TABS: { key: TabKey; label: string }[] = [
  { key: "products", label: "Products" },
  { key: "prices", label: "Prices" },
  { key: "designs", label: "Designs" },
];

const money = (n: number | null | undefined) =>
  n == null ? "–" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const said = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function TShirtDesignerPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading the t-shirt designer…</div></div>}>
      <TShirtDesigner />
    </Suspense>
  );
}

function TShirtDesigner() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "products";
  const [setup, setSetup] = useState<DesignerSetup | null>(null);
  const loadSetup = useCallback(() => { api.setup().then(setSetup).catch(() => setSetup(null)); }, []);
  useEffect(loadSetup, [loadSetup]);

  return (
    <ProductsFrame active="tshirt-designer" title="T-shirt designer"
      sub="Customers design their own shirts on the products you choose. What they send lands under Designs."
      actions={setup?.has_products ? <a href="/design" target="_blank" rel="noopener noreferrer" className="pc-btn">Open the designer <ExternalLink size={14} /></a> : undefined}>
      <UpgradeNotice feature="tshirt_designer" blurb="Customers design their own shirts on your products, and you set the decoration prices.">
        <div data-tshirt-designer data-tab={tab}>
          <nav className="pc-subtabs" aria-label="T-shirt designer">
            {TABS.map((t) => (
              <Link key={t.key} href={`/admin/tshirt-designer?tab=${t.key}`} className="pc-subtab" data-tab={t.key}
                data-on={tab === t.key ? "" : undefined} aria-current={tab === t.key ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
          {tab === "products" ? <ProductsTab setup={setup} onChange={loadSetup} />
            : tab === "prices" ? <PricesTab onSaved={loadSetup} />
            : <DesignsTab initial={params.get("design")} />}
        </div>
      </UpgradeNotice>
    </ProductsFrame>
  );
}

// ── Set up: what is left before the designer sells ──────────────────────────
function Checklist({ setup }: { setup: DesignerSetup | null }) {
  if (!setup) return null;
  const steps = [
    { done: setup.has_products, title: "Put a product in the designer", desc: "Add products below, or switch it on from a product's own page." },
    { done: setup.prices_saved, title: "Set your decoration prices", desc: "Prices: what a printed side costs at each quantity, embroidery, names and numbers." },
    { done: setup.has_designs, title: "Get your first order for a design", desc: "Customers press Design your own on a product's page and add their design to the cart. Once they check out it lands under Designs and on Production." },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return null;
  return (
    <div className="pc-card" style={{ marginBottom: 16 }} data-designer-checklist>
      <div className="pc-card-head">
        <h2 className="pc-h2">Get the designer ready</h2>
        <span className="pc-sub-line" style={{ fontSize: 13 }}>{steps.length - left} of {steps.length} done</span>
      </div>
      {steps.map((x) => (
        <div key={x.title} className="pc-step" data-done={x.done ? "" : undefined}>
          <span className="pc-step-dot" aria-hidden>{x.done ? "✓" : ""}</span>
          <span><span className="pc-step-title">{x.title}</span><span className="pc-step-detail" style={{ display: "block" }}>{x.desc}</span></span>
          {x.done && <span className="pc-step-done">Done</span>}
        </div>
      ))}
    </div>
  );
}

// ── Products ────────────────────────────────────────────────────────────────
const SHAPES = [
  { key: "tee", label: "T-shirt" }, { key: "longsleeve", label: "Long sleeve tee" },
  { key: "tank", label: "Tank top" }, { key: "muscle", label: "Muscle tee" },
];

function summary(p: DesignerProduct) {
  const sizes = p.sizes.length ? (p.sizes.length > 1 ? `${p.sizes[0]} to ${p.sizes[p.sizes.length - 1]}` : p.sizes[0]) : "no sizes";
  return `${p.colours} ${p.colours === 1 ? "colour" : "colours"} · ${sizes}${p.from_price != null ? ` · from ${money(p.from_price)}` : ""}`;
}

function ProductsTab({ setup, onChange }: { setup: DesignerSetup | null; onChange: () => void }) {
  const [items, setItems] = useState<DesignerProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api.products().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function change(p: DesignerProduct, data: { enabled?: boolean; silhouette?: string; embroidery?: boolean }) {
    setBusy(p.id);
    try {
      const row = await api.update(p.id, data);
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? row : x)).filter((x) => x.enabled));
      onChange();
    } catch (e) {
      await tell(said(e, "That could not be saved. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: DesignerProduct) {
    if (!await ask(`Take ${p.name} out of the designer? Its page stops offering Design your own. Designs already sent stay.`, { ok: "Take it out" })) return;
    await change(p, { enabled: false });
  }

  return (
    <>
      <Checklist setup={setup} />
      <div className="pc-row-actions" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <p className="pc-sub-line" style={{ margin: 0, maxWidth: 640 }}>
          Customers design these products in the colours and sizes you sell, at your prices. Pick the garment shape each one is drawn on.
        </p>
        <button type="button" className="pc-btn" data-kind="primary" onClick={() => setAdding(true)} data-add-products>
          <Plus size={15} /> Add products
        </button>
      </div>

      {items === null ? (
        <div className="pc-card pc-empty">Loading products…</div>
      ) : items.length === 0 ? (
        <div className="pc-card pc-empty" data-no-products>
          No products in the designer yet. Press <b>Add products</b> to choose the shirts customers can design.
        </div>
      ) : (
        <div className="pc-stack" style={{ gap: 10 }} data-designer-products>
          {items.map((p) => (
            <div key={p.id} className="pc-card" style={{ padding: 14, opacity: busy === p.id ? 0.6 : 1 }} data-designer-product={p.slug}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, background: "#F4F6F9", overflow: "hidden", flex: "0 0 auto" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image ? <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15 }}>{p.name}</b>
                    {p.status !== "active" && <span className="pc-pill" data-tone="amber">{p.status}: customers can&apos;t see it yet</span>}
                  </div>
                  <div className="pc-sub-line" style={{ marginTop: 2 }}>{summary(p)}</div>
                  {p.problem && <div className="pc-sub-line" style={{ marginTop: 2, color: "var(--pc-red)" }}>{p.problem}</div>}
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--pc-muted)" }}>
                  Drawn as
                  <select className="pc-input" value={p.silhouette} disabled={busy === p.id} style={{ height: 36, width: 170 }}
                    onChange={(e) => void change(p, { silhouette: e.target.value })} aria-label={`Garment shape of ${p.name}`}>
                    {SHAPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <input type="checkbox" checked={p.embroidery} disabled={busy === p.id}
                    onChange={(e) => void change(p, { embroidery: e.target.checked })} />
                  Embroidery too
                </label>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                  <a className="pc-btn" href={`/design?product=${p.id}&new=1`} target="_blank" rel="noopener noreferrer">Try it <ExternalLink size={13} /></a>
                  <Link className="pc-btn" href={`/admin/products/${p.slug}/edit`}>Open product</Link>
                  <button type="button" className="pc-btn" aria-label={`Take ${p.name} out of the designer`} disabled={busy === p.id}
                    onClick={() => void remove(p)}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <AddProducts onClose={() => setAdding(false)} onAdded={(row) => { setItems((prev) => [...(prev ?? []), row].sort((a, b) => a.name.localeCompare(b.name))); onChange(); }} />}
    </>
  );
}

function AddProducts({ onClose, onAdded }: { onClose: () => void; onAdded: (row: DesignerProduct) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DesignerProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      api.pickable(q).then((r) => { if (live) setRows(r.items); }).catch(() => { if (live) setRows([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);

  async function add(p: DesignerProduct) {
    setBusy(p.id); setError(null);
    try {
      const row = await api.update(p.id, { enabled: true });
      onAdded(row);
      setRows((prev) => (prev ?? []).filter((x) => x.id !== p.id));
    } catch (e) {
      setError(said(e, "That product could not be added."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="presentation" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", zIndex: 60, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" className="pc-card" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{ width: "100%", maxWidth: 640, padding: 0, overflow: "hidden" }} data-add-dialog>
        <div className="pc-card-head" style={{ padding: "16px 18px" }}>
          <h2 className="pc-h2" id="add-title">Add products to the designer</h2>
          <button type="button" className="pc-btn" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ padding: "0 18px 12px" }}>
          <label style={{ position: "relative", display: "block" }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--pc-muted)" }} aria-hidden />
            <input className="pc-input" style={{ paddingLeft: 32 }} placeholder="Search by name, style or brand" value={q}
              onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search products" />
          </label>
          <p className="pc-sub-line" style={{ margin: "8px 0 0" }}>Products sold by colour and size. Gang sheets and made-to-order products are not designed here.</p>
          {error && <div className="pc-flash" data-bad="" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div style={{ maxHeight: "55vh", overflowY: "auto", borderTop: "1px solid var(--pc-line)" }}>
          {rows === null ? (
            <div className="pc-empty">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="pc-empty">{q ? "No product matches." : "Every product sold by colour and size is in the designer already."}</div>
          ) : rows.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: "1px solid var(--pc-line-soft)" }} data-pick={p.slug}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "#F4F6F9", overflow: "hidden", flex: "0 0 auto" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div className="pc-sub-line" style={{ fontSize: 12.5, color: p.problem ? "var(--pc-red)" : undefined }}>{p.problem ?? summary(p)}</div>
              </div>
              <button type="button" className="pc-btn" data-kind="primary" disabled={!!p.problem || busy === p.id} onClick={() => void add(p)}>
                {busy === p.id ? "Adding…" : "Add"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Prices ──────────────────────────────────────────────────────────────────
function TierRows({ title, hint, tiers, onChange }: {
  title: string; hint: string; tiers: DesignerTier[]; onChange: (t: DesignerTier[]) => void;
}) {
  const set = (i: number, k: keyof DesignerTier, v: string) =>
    onChange(tiers.map((t, j) => (j === i ? { ...t, [k]: v === "" ? NaN : Number(v) } : t)));
  return (
    <section className="pc-card pc-pad" style={{ display: "grid", gap: 10 }}>
      <div>
        <h3 className="pc-h2" style={{ fontSize: 16 }}>{title}</h3>
        <p className="pc-sub-line" style={{ margin: "2px 0 0" }}>{hint}</p>
      </div>
      {tiers.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-tier={i}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
            From
            <input className="pc-input" type="number" min={1} step={1} style={{ width: 90 }} value={Number.isNaN(t.min) ? "" : t.min}
              onChange={(e) => set(i, "min", e.target.value)} aria-label={`${title}: from how many pieces`} />
            pieces
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
            $
            <input className="pc-input" type="number" min={0} step="0.01" style={{ width: 100 }} value={Number.isNaN(t.per_side) ? "" : t.per_side}
              onChange={(e) => set(i, "per_side", e.target.value)} aria-label={`${title}: price per side`} />
            per side
          </label>
          {tiers.length > 1 && (
            <button type="button" className="pc-btn" aria-label="Remove this break" onClick={() => onChange(tiers.filter((_, j) => j !== i))}><X size={14} /></button>
          )}
        </div>
      ))}
      <div>
        <button type="button" className="pc-link" onClick={() => onChange([...tiers, { min: (tiers[tiers.length - 1]?.min ?? 0) * 2 || 12, per_side: tiers[tiers.length - 1]?.per_side ?? 5 }])}>
          + Add a quantity break
        </button>
      </div>
    </section>
  );
}

function PricesTab({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<DesignerSettings | null>(null);
  const [rates, setRates] = useState<DesignerRates | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.settings().then((r) => { setS(r); setRates(r.rates); }).catch(() => setMsg({ ok: false, text: "The prices could not be loaded." }));
  }, []);
  const dirty = useMemo(() => !!s && !!rates && JSON.stringify(s.rates) !== JSON.stringify(rates), [s, rates]);
  if (!rates) return <div className="pc-card pc-empty">{msg?.text ?? "Loading prices…"}</div>;

  async function save() {
    if (!rates) return;
    setSaving(true); setMsg(null);
    try {
      const r = await api.saveRates(rates);
      setS(r); setRates(r.rates);
      setMsg({ ok: true, text: "Saved. The designer shows these prices from now on." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: said(e, "The prices could not be saved.") });
    } finally {
      setSaving(false);
    }
  }

  const num = (v: number) => (Number.isNaN(v) ? "" : v);
  const setOne = (k: "embroidery_minimum" | "name" | "number", v: string) => setRates({ ...rates, [k]: v === "" ? NaN : Number(v) });
  return (
    <div className="pc-stack" style={{ gap: 14 }} data-designer-prices>
      {s && !s.saved && (
        <div className="pc-note" data-tone="amber">
          These are starting prices, not yours yet. Set your own and save: customers see them in the designer.
        </div>
      )}
      <p className="pc-sub-line" style={{ margin: 0 }}>
        A piece costs the product&apos;s own price in that colour and size, plus the price per printed side below.
        Every piece in a design counts towards the quantity break.
      </p>
      <TierRows title="Printing" hint="Price per printed side. The first break starts at 1 piece." tiers={rates.print}
        onChange={(t) => setRates({ ...rates, print: t })} />
      <TierRows title="Embroidery" hint="Price per embroidered side, for products with embroidery switched on." tiers={rates.embroidery}
        onChange={(t) => setRates({ ...rates, embroidery: t })} />
      <section className="pc-card pc-pad" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13.5 }}>
          Embroidery minimum (pieces)
          <input className="pc-input" type="number" min={1} step={1} style={{ width: 140 }} value={num(rates.embroidery_minimum)}
            onChange={(e) => setOne("embroidery_minimum", e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13.5 }}>
          A name on a shirt ($)
          <input className="pc-input" type="number" min={0} step="0.01" style={{ width: 140 }} value={num(rates.name)}
            onChange={(e) => setOne("name", e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13.5 }}>
          A number on a shirt ($)
          <input className="pc-input" type="number" min={0} step="0.01" style={{ width: 140 }} value={num(rates.number)}
            onChange={(e) => setOne("number", e.target.value)} />
        </label>
      </section>
      {msg && <div className="pc-flash" data-bad={msg.ok ? undefined : ""} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <div className="pc-row-actions">
        <button type="button" className="pc-btn" data-kind="primary" disabled={saving || (!dirty && !!s?.saved)} onClick={() => void save()}>
          {saving ? "Saving…" : "Save prices"}
        </button>
        {dirty && <button type="button" className="pc-btn" onClick={() => s && setRates(s.rates)}>Undo</button>}
      </div>
    </div>
  );
}

// ── Designs ─────────────────────────────────────────────────────────────────
// A design in a cart, or left there, stays "submitted" until it is checked
// out; then it is in review (backend services/tshirt_designer.link_to_order).
const STATUS_WORDS: Record<string, { label: string; tone?: string }> = {
  submitted: { label: "Not ordered yet" },
  in_review: { label: "In review", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  production: { label: "In production", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  revision_requested: { label: "Sent back for changes", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
};
const FILTERS = ["", "in_review", "approved", "production", "revision_requested", "completed", "rejected", "submitted"];
const NEXT: { status: string; label: string }[] = [
  { status: "in_review", label: "Start review" },
  { status: "approved", label: "Approve" },
  { status: "production", label: "In production" },
  { status: "completed", label: "Completed" },
  { status: "revision_requested", label: "Send back for changes" },
  { status: "rejected", label: "Reject" },
];

function Status({ value }: { value: string }) {
  const w = STATUS_WORDS[value] ?? { label: value };
  return <span className="pc-pill" data-tone={w.tone}>{w.label}</span>;
}

/** The order a design was bought on, with its payment, or that it wasn't. */
function OrderCell({ d }: { d: TShirtDesignRecord }) {
  if (!d.order_id) return <span className="pc-sub-line">Not ordered</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Link href={`/admin/orders/${d.order_id}`} className="pc-link" onClick={(e) => e.stopPropagation()} data-design-order>
        {d.order_number ? `#${d.order_number}` : "Open order"}
      </Link>
      <span className="pc-pill" data-tone={d.paid ? "green" : "amber"}>{d.paid ? "Paid" : "Unpaid"}</span>
    </span>
  );
}

function DesignsTab({ initial }: { initial: string | null }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<TShirtDesignRecord[] | null>(null);
  // Opened straight from an order or the Production board (?design=<id>).
  const [open, setOpen] = useState<string | null>(initial);
  useEffect(() => { if (initial) setOpen(initial); }, [initial]);
  const load = useCallback(() => {
    setRows(null);
    designs.adminList(filter || undefined).then(setRows).catch(() => setRows([]));
  }, [filter]);
  useEffect(load, [load]);

  if (open) return <DesignDetail id={open} onBack={() => { setOpen(null); load(); }} />;
  return (
    <>
      <div className="pc-row-actions" style={{ marginBottom: 12, flexWrap: "wrap", gap: 6 }} role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" className="pc-btn" aria-pressed={filter === f} data-kind={filter === f ? "primary" : undefined}
            onClick={() => setFilter(f)}>{f ? STATUS_WORDS[f]!.label : "All"}</button>
        ))}
      </div>
      {rows === null ? (
        <div className="pc-card pc-empty">Loading designs…</div>
      ) : rows.length === 0 ? (
        <div className="pc-card pc-empty" data-no-designs>
          {filter ? "No designs here." : "No designs yet. A design shows here once a customer adds it to their cart, and joins your review queue when they check out."}
        </div>
      ) : (
        <div className="pc-card pc-scroll-x" style={{ padding: 0 }}>
          <table className="pc-table" data-designs>
            <thead><tr><th>Design</th><th>Customer</th><th>Pieces</th><th>Total</th><th>Order</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} data-href="" tabIndex={0} onClick={() => setOpen(d.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpen(d.id); }}>
                  <td><b>{d.reference}</b><div className="pc-sub-line" style={{ fontSize: 12.5 }}>{d.name}</div></td>
                  <td>{d.contact_name}<div className="pc-sub-line" style={{ fontSize: 12.5 }}>{d.contact_email ?? ""}</div></td>
                  <td>{d.total_qty}</td>
                  <td>{money(d.quoted_total)}</td>
                  <td><OrderCell d={d} /></td>
                  <td><Status value={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DesignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<(TShirtDesignRecord & { internal_notes?: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    designs.adminGet(id).then((r) => { setD(r); setNotes((r as { internal_notes?: string | null }).internal_notes ?? ""); setMessage(r.supplier_notes ?? ""); })
      .catch(() => setD(null));
  }, [id]);

  const shirts = useMemo(() => {
    if (!d?.outputs) return [];
    const by = new Map<string, { key: string; previews: typeof d.outputs; prints: typeof d.outputs }>();
    for (const o of d.outputs) {
      const row = by.get(o.shirt_key) ?? { key: o.shirt_key, previews: [], prints: [] };
      (o.kind === "preview" ? row.previews : row.prints).push(o);
      by.set(o.shirt_key, row);
    }
    return [...by.values()];
  }, [d]);

  if (!d) return <div className="pc-card pc-empty">Loading the design…</div>;
  const quantities = (d.document?.quantities ?? {}) as Record<string, Record<string, number>>;

  async function move(status: string) {
    if (!d) return;
    setBusy(true);
    try {
      const r = await designs.adminSetStatus(d.id, status, message || undefined);
      setD({ ...d, ...r });
    } catch (e) {
      await tell(said(e, "The status could not be changed."));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!d) return;
    setBusy(true);
    try { await designs.adminSetNotes(d.id, notes); } catch (e) { await tell(said(e, "The notes could not be saved.")); } finally { setBusy(false); }
  }

  return (
    <div className="pc-stack" style={{ gap: 14 }} data-design-detail={d.reference}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="pc-link" onClick={onBack}>← All designs</button>
        <h2 className="pc-h2" style={{ fontSize: 20, margin: 0 }}>{d.reference}</h2>
        <Status value={d.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <section className="pc-card pc-pad" style={{ display: "grid", gap: 6 }}>
          <h3 className="pc-h2" style={{ fontSize: 16 }}>{d.name}</h3>
          <div className="pc-kv"><span>Customer</span><b>{d.contact_name}</b></div>
          <div className="pc-kv"><span>Email</span><b>{d.contact_email ? <a href={`mailto:${d.contact_email}?subject=${encodeURIComponent(`Your design ${d.reference}`)}`}>{d.contact_email}</a> : "–"}</b></div>
          <div className="pc-kv"><span>Pieces</span><b>{d.total_qty}</b></div>
          <div className="pc-kv"><span>Decoration</span><b>{d.method === "embroidery" ? "Embroidery" : "Printing"}</b></div>
          <div className="pc-kv"><span>Total</span><b>{money(d.quoted_total)}</b></div>
          <div className="pc-kv"><span>Order</span><b><OrderCell d={d} /></b></div>
          <div className="pc-kv"><span>Made</span><b>{d.created_at ? new Date(d.created_at).toLocaleString() : "–"}</b></div>
          {d.customer_notes && <p className="pc-sub-line" style={{ margin: "6px 0 0" }}><b>Customer&apos;s note:</b> {d.customer_notes}</p>}
        </section>
        <section className="pc-card pc-pad" style={{ display: "grid", gap: 8 }}>
          <h3 className="pc-h2" style={{ fontSize: 16 }}>Where it stands</h3>
          {d.order_id ? (
            <>
              <label className="pc-label" htmlFor="designer-message">Message for the customer (goes with the email they get)</label>
              <textarea id="designer-message" className="pc-input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} style={{ height: "auto" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-design-moves>
                {NEXT.filter((n) => n.status !== d.status).map((n) => (
                  <button key={n.status} type="button" className="pc-btn" disabled={busy} onClick={() => void move(n.status)}
                    data-kind={n.status === "approved" ? "primary" : undefined}>{n.label}</button>
                ))}
              </div>
            </>
          ) : (
            <p className="pc-sub-line" style={{ margin: 0 }} data-not-ordered>
              Not ordered yet. The customer has it in their cart, or left it there. It joins your review queue, and Production, when they check out.
            </p>
          )}
          <label className="pc-label" htmlFor="designer-notes" style={{ marginTop: 6 }}>Notes for your team</label>
          <textarea id="designer-notes" className="pc-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ height: "auto" }} />
          <div><button type="button" className="pc-btn" disabled={busy} onClick={() => void saveNotes()}>Save notes</button></div>
        </section>
      </div>
      {shirts.length === 0 ? (
        <div className="pc-card pc-empty">This design&apos;s files are still arriving, or it was sent without them.</div>
      ) : shirts.map((sh) => {
        const sizes = quantities[sh.key] ?? {};
        const ordered = Object.entries(sizes).filter(([, n]) => (n ?? 0) > 0);
        return (
          <section key={sh.key} className="pc-card pc-pad" style={{ display: "grid", gap: 10 }} data-shirt={sh.key}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{sh.key.split(":")[1]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</b>
              <span className="pc-sub-line">{ordered.length ? ordered.map(([z, n]) => `${z} × ${n}`).join(" · ") : "Names and numbers only"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {sh.previews.map((o) => (
                <a key={o.id} href={o.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "grid", gap: 4, textDecoration: "none", color: "inherit" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.file_url} alt={`${o.view} preview`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#F4F6F9", borderRadius: 10 }} />
                  <span className="pc-sub-line" style={{ textTransform: "capitalize", fontSize: 12.5 }}>{o.view}</span>
                </a>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sh.prints.map((o) => (
                <a key={o.id} className="pc-btn" href={originalFile(o.file_url)} target="_blank" rel="noopener noreferrer" download={o.file_name}>
                  Print file: {o.view} ({o.width_px}×{o.height_px}{o.dpi ? `, ${o.dpi} DPI` : ""})
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
