"use client";

/**
 * Marketing → Upsells: the offers buyers see in their cart (services/upsells
 * on the server). Each offer is a product, when it shows (every cart, a cart
 * holding certain products or collections, a cart worth between two amounts)
 * and its price (as it is, or a percentage or an amount off). The cart shows
 * up to two at once, highest priority first, and never one for a product
 * already in it. The list says what each offer has sold.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";
import { formatCurrency } from "@/lib/utils";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";
import UpgradeNotice from "@/components/admin/UpgradeNotice";
import { whenWords, type UpsellRow } from "@/lib/upsells";

interface ProductHit {
  id: string;
  name: string;
  status: string;
  gang_sheet_enabled?: boolean;
  images?: { url_thumbnail?: string | null; url_medium?: string | null }[];
  variants?: { id: string; color: string | null; size: string | null; retail_price: string | number }[];
}
interface CollectionRow { id: string; name: string }

type Draft = {
  id?: string;
  name: string;
  is_active: boolean;
  priority: string;
  product: { id: string; name: string } | null;
  variants: { id: string; label: string }[];
  variant_id: string;
  headline: string;
  description: string;
  discount_type: "none" | "percent" | "amount";
  discount_value: string;
  trigger_kind: "any" | "products" | "collections";
  trigger_products: { id: string; name: string }[];
  trigger_collections: string[];
  min_subtotal: string;
  max_subtotal: string;
};

const EMPTY: Draft = {
  name: "", is_active: true, priority: "0", product: null, variants: [], variant_id: "", headline: "", description: "",
  discount_type: "none", discount_value: "", trigger_kind: "any", trigger_products: [], trigger_collections: [],
  min_subtotal: "", max_subtotal: "",
};

function variantLabel(v: { color: string | null; size: string | null }): string {
  return [v.color, v.size].filter(Boolean).join(" / ") || "Default";
}

export default function UpsellsPage() {
  const [rows, setRows] = useState<UpsellRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get<{ offers: UpsellRow[] }>("/api/v1/admin/upsells");
      setRows(r.offers);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(row: UpsellRow) {
    try {
      const updated = await apiClient.patch<UpsellRow>(`/api/v1/admin/upsells/${row.id}/active`, { is_active: !row.is_active });
      setRows((list) => list?.map((r) => (r.id === row.id ? updated : r)) ?? null);
    } catch {
      await tell("The offer was not changed. Try again.", { title: "Could not save" });
    }
  }

  async function remove(row: UpsellRow) {
    if (!(await ask(`Delete "${row.name}"? Orders it already made keep their prices.`, { title: "Delete this offer?", ok: "Delete", danger: true }))) return;
    try {
      await apiClient.delete(`/api/v1/admin/upsells/${row.id}`);
      setRows((list) => list?.filter((r) => r.id !== row.id) ?? null);
    } catch {
      await tell("The offer was not deleted. Try again.", { title: "Could not delete" });
    }
  }

  function edit(row: UpsellRow) {
    setDraft({
      id: row.id, name: row.name, is_active: row.is_active, priority: String(row.priority),
      product: { id: row.product_id, name: row.product_name }, variants: [], variant_id: row.variant_id ?? "",
      headline: row.headline ?? "", description: row.description ?? "",
      discount_type: row.discount_type, discount_value: row.discount_type === "none" ? "" : String(Number(row.discount_value)),
      trigger_kind: row.trigger_kind,
      trigger_products: row.trigger_kind === "products" ? row.trigger_ids.map((id) => ({ id, name: "" })) : [],
      trigger_collections: row.trigger_kind === "collections" ? row.trigger_ids : [],
      min_subtotal: row.min_subtotal ? String(Number(row.min_subtotal)) : "",
      max_subtotal: row.max_subtotal ? String(Number(row.max_subtotal)) : "",
    });
  }

  return (
    <MarketingFrame active="upsells" title="Upsells"
      sub="Offers your buyers see in their cart: a product to add, when it shows, and its price."
      actions={!draft ? <button type="button" className="pc-btn" data-kind="primary" onClick={() => setDraft({ ...EMPTY })}><Plus size={17} strokeWidth={2.2} /> New offer</button> : null}>
      <UpgradeNotice feature="upsells" blurb="Put a product in front of buyers in their cart, at its price or a better one, when the cart is right for it.">
        {draft ? (
          <OfferEditor draft={draft} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); }} />
        ) : failed ? (
          <section className="pc-card" style={{ padding: "20px" }}><p className="pc-sub-line" style={{ margin: 0 }}>The offers could not be loaded. Refresh the page to try again.</p></section>
        ) : !rows ? (
          <section className="pc-card" style={{ padding: "20px" }}><p className="pc-sub-line" style={{ margin: 0 }}>Loading…</p></section>
        ) : rows.length === 0 ? (
          <section className="pc-card pc-empty" style={{ padding: "36px 24px", textAlign: "center" }}>
            <h2 className="pc-h2">No offers yet</h2>
            <p className="pc-sub-line" style={{ maxWidth: 520, margin: "8px auto 18px" }}>
              Offer a hoodie to someone buying tees, a small gang sheet to a cart just short of free shipping, or anything
              that goes with what is already in the cart.
            </p>
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => setDraft({ ...EMPTY })}><Plus size={17} /> Make your first offer</button>
          </section>
        ) : (
          <section className="pc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="pc-table" style={{ minWidth: 760 }}>
              <thead>
                <tr><th>Offer</th><th>When it shows</th><th>Price</th><th>Sold</th><th>On</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-upsell-row={r.id}>
                    <td>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, border: "1px solid var(--pc-line)", overflow: "hidden", flex: "none", background: "#F6F7F9" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {r.product_image ? <img src={r.product_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div className="pc-sub-line" style={{ fontSize: 13 }}>{r.product_name}{r.variant_label ? `, ${r.variant_label}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>{whenWords(r)}</td>
                    <td>{r.discount_words ?? "Usual price"}{!r.ready_made ? <div className="pc-sub-line" style={{ fontSize: 12.5 }}>Opens its page</div> : null}</td>
                    <td>{r.orders ? `${r.orders} ${r.orders === 1 ? "order" : "orders"}, ${formatCurrency(Number(r.revenue))}` : "None yet"}</td>
                    <td>
                      <button type="button" className="pc-switch" role="switch" aria-label={`${r.name} on`} aria-checked={r.is_active}
                        data-on={r.is_active ? "" : undefined} onClick={() => toggle(r)} />
                    </td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button type="button" className="pc-btn" onClick={() => edit(r)}>Edit</button>{" "}
                      <button type="button" className="pc-btn" onClick={() => remove(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pc-sub-line" style={{ margin: 0, padding: "12px 16px", fontSize: 13 }}>
              The cart shows up to two offers at a time, highest priority first, and none for a product already in it.
            </p>
          </section>
        )}
      </UpgradeNotice>
    </MarketingFrame>
  );
}

function ProductSearch({ label, onPick, exclude = [] }: { label: string; onPick: (p: ProductHit) => void; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      setBusy(true);
      apiClient.get<ProductHit[]>(`/api/v1/admin/products?q=${encodeURIComponent(term)}&status=active&page_size=8`)
        .then((list) => setHits((list ?? []).filter((p) => !exclude.includes(p.id))))
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, exclude]);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: "var(--pc-muted, #6B7280)" }} />
        <input className="pc-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products by name or SKU"
          aria-label={label} style={{ paddingLeft: 36 }} />
      </div>
      {(hits.length > 0 || busy) && (
        <div className="pc-card" role="listbox" aria-label={`${label} results`}
          style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)", padding: 6, maxHeight: 320, overflow: "auto" }}>
          {busy && !hits.length ? <div className="pc-sub-line" style={{ padding: 8 }}>Searching…</div> : null}
          {hits.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected="false" onClick={() => { onPick(p); setQ(""); setHits([]); }}
              style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", padding: 8, border: 0, background: "none", cursor: "pointer", textAlign: "left", borderRadius: 8, font: "inherit" }}>
              <span style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden", background: "#F6F7F9", flex: "none" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.images?.[0]?.url_thumbnail ? <img src={p.images[0].url_thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{p.name}</span>
                <span className="pc-sub-line" style={{ fontSize: 12.5 }}>
                  {p.variants?.length ? `${p.variants.length} ${p.variants.length === 1 ? "option" : "options"}, from ${formatCurrency(Math.min(...p.variants.map((v) => Number(v.retail_price))))}` : "No options"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferEditor({ draft: start, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(start);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    apiClient.get<CollectionRow[]>("/api/v1/admin/collections?include_counts=false").then((c) => setCollections(c ?? [])).catch(() => setCollections([]));
  }, []);
  // An offer being edited: its product's options, and the names of the products it follows.
  useEffect(() => {
    if (d.product && !d.variants.length) {
      apiClient.get<ProductHit>(`/api/v1/admin/products/${d.product.id}`).then((p) => {
        setD((x) => ({ ...x, variants: (p.variants ?? []).map((v) => ({ id: v.id, label: variantLabel(v) })) }));
      }).catch(() => {});
    }
    d.trigger_products.filter((p) => !p.name).forEach((p) => {
      apiClient.get<ProductHit>(`/api/v1/admin/products/${p.id}`).then((hit) => {
        setD((x) => ({ ...x, trigger_products: x.trigger_products.map((t) => (t.id === p.id ? { ...t, name: hit.name } : t)) }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exclude = useMemo(() => [d.product?.id ?? "", ...d.trigger_products.map((p) => p.id)].filter(Boolean), [d.product, d.trigger_products]);

  async function save() {
    setError(null);
    if (!d.name.trim()) { setError("Give the offer a name you will recognise."); return; }
    if (!d.product) { setError("Choose the product to offer."); return; }
    setBusy(true);
    const body = {
      name: d.name.trim(), is_active: d.is_active, priority: Number(d.priority) || 0,
      product_id: d.product.id, variant_id: d.variant_id || null,
      headline: d.headline.trim() || null, description: d.description.trim() || null,
      discount_type: d.discount_type, discount_value: d.discount_type === "none" ? "0" : (d.discount_value || "0"),
      trigger_kind: d.trigger_kind,
      trigger_ids: d.trigger_kind === "products" ? d.trigger_products.map((p) => p.id) : d.trigger_kind === "collections" ? d.trigger_collections : [],
      min_subtotal: d.min_subtotal.trim() ? d.min_subtotal.trim() : null,
      max_subtotal: d.max_subtotal.trim() ? d.max_subtotal.trim() : null,
    };
    try {
      if (d.id) await apiClient.put(`/api/v1/admin/upsells/${d.id}`, body);
      else await apiClient.post("/api/v1/admin/upsells", body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The offer could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const radio = (name: string, value: string, checked: boolean, onPick: () => void, label: string, hint?: string) => (
    <label key={value} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onPick} style={{ marginTop: 3 }} />
      <span><span style={{ fontWeight: 600 }}>{label}</span>{hint ? <span className="pc-sub-line" style={{ display: "block", fontSize: 13 }}>{hint}</span> : null}</span>
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 18 }} data-offer-editor>
      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}>
          <h2 className="pc-h2">{d.id ? "Edit offer" : "New offer"}</h2>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <div className="pc-field">
            <label className="pc-label" htmlFor="up-name">Name (only you see it)</label>
            <input id="up-name" className="pc-input" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Hoodie with a tee" maxLength={120} />
          </div>
          <div className="pc-field">
            <span className="pc-label">Product to offer</span>
            {d.product ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="pc-pill" data-tone="blue" style={{ textTransform: "none" }}>{d.product.name}</span>
                <button type="button" className="pc-btn" onClick={() => setD((x) => ({ ...x, product: null, variants: [], variant_id: "" }))}>Change</button>
              </div>
            ) : (
              <ProductSearch label="Product to offer" exclude={exclude} onPick={(p) => setD((x) => ({
                ...x, product: { id: p.id, name: p.name },
                variants: (p.variants ?? []).map((v) => ({ id: v.id, label: variantLabel(v) })), variant_id: "",
                name: x.name || `${p.name} offer`,
              }))} />
            )}
          </div>
          {d.product && d.variants.length > 1 && (
            <div className="pc-field">
              <label className="pc-label" htmlFor="up-variant">Which option</label>
              <select id="up-variant" className="pc-input" value={d.variant_id} onChange={(e) => set("variant_id", e.target.value)}>
                <option value="">The buyer chooses (colour, size)</option>
                {d.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          )}
          <div className="pc-field">
            <label className="pc-label" htmlFor="up-headline">Headline in the cart (optional)</label>
            <input id="up-headline" className="pc-input" value={d.headline} onChange={(e) => set("headline", e.target.value)}
              placeholder={d.product ? `Add ${d.product.name}` : "Add a matching hoodie"} maxLength={120} />
          </div>
          <div className="pc-field">
            <label className="pc-label" htmlFor="up-desc">One line under it (optional)</label>
            <input id="up-desc" className="pc-input" value={d.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Pairs with the tees in your cart" maxLength={200} />
          </div>
        </div>
      </section>

      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}><h2 className="pc-h2">Price</h2></div>
        <div style={{ padding: 20, display: "grid", gap: 12 }} role="radiogroup" aria-label="Price">
          {radio("up-price", "none", d.discount_type === "none", () => set("discount_type", "none"), "Its usual price")}
          {radio("up-price", "percent", d.discount_type === "percent", () => set("discount_type", "percent"), "A percentage off")}
          {radio("up-price", "amount", d.discount_type === "amount", () => set("discount_type", "amount"), "An amount off each one")}
          {d.discount_type !== "none" && (
            <div className="pc-field" style={{ maxWidth: 220 }}>
              <label className="pc-label" htmlFor="up-value">{d.discount_type === "percent" ? "Percent off" : "Dollars off"}</label>
              <input id="up-value" className="pc-input" inputMode="decimal" value={d.discount_value}
                onChange={(e) => set("discount_value", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={d.discount_type === "percent" ? "10" : "5.00"} />
            </div>
          )}
          <p className="pc-sub-line" style={{ margin: 0, fontSize: 13 }}>
            The offer price holds only while the cart still qualifies. A gang sheet, an uploaded print or a product priced
            from options is built on its page, so its offer opens that page at the usual price.
          </p>
        </div>
      </section>

      <section className="pc-card">
        <div className="pc-card-head" style={{ display: "block" }}><h2 className="pc-h2">When it shows</h2></div>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          <div role="radiogroup" aria-label="When it shows" style={{ display: "grid", gap: 12 }}>
            {radio("up-when", "any", d.trigger_kind === "any", () => set("trigger_kind", "any"), "Any cart")}
            {radio("up-when", "products", d.trigger_kind === "products", () => set("trigger_kind", "products"), "The cart has one of these products")}
            {radio("up-when", "collections", d.trigger_kind === "collections", () => set("trigger_kind", "collections"), "The cart has a product from these collections")}
          </div>
          {d.trigger_kind === "products" && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {d.trigger_products.map((p) => (
                  <span key={p.id} className="pc-pill" data-tone="blue" style={{ textTransform: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {p.name || "Product"}
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set("trigger_products", d.trigger_products.filter((x) => x.id !== p.id))}
                      style={{ border: 0, background: "none", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={13} /></button>
                  </span>
                ))}
              </div>
              <ProductSearch label="Products the offer follows" exclude={exclude}
                onPick={(p) => set("trigger_products", [...d.trigger_products, { id: p.id, name: p.name }])} />
            </div>
          )}
          {d.trigger_kind === "collections" && (
            <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
              {collections.length === 0 ? <p className="pc-sub-line" style={{ margin: 0 }}>No collections yet.</p> : collections.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={d.trigger_collections.includes(c.id)}
                    onChange={(e) => set("trigger_collections", e.target.checked ? [...d.trigger_collections, c.id] : d.trigger_collections.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="pc-field" style={{ width: 170 }}>
              <label className="pc-label" htmlFor="up-min">Cart value from (optional)</label>
              <input id="up-min" className="pc-input" inputMode="decimal" value={d.min_subtotal} placeholder="$"
                onChange={(e) => set("min_subtotal", e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div className="pc-field" style={{ width: 170 }}>
              <label className="pc-label" htmlFor="up-max">Cart value up to (optional)</label>
              <input id="up-max" className="pc-input" inputMode="decimal" value={d.max_subtotal} placeholder="$"
                onChange={(e) => set("max_subtotal", e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </div>
          <p className="pc-sub-line" style={{ margin: 0, fontSize: 13 }}>
            For example, a cart worth up to just under your free-shipping amount. When the offer takes a cart over that
            line, the cart says it unlocks free shipping.
          </p>
        </div>
      </section>

      <section className="pc-card">
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="pc-field" style={{ maxWidth: 220 }}>
            <label className="pc-label" htmlFor="up-priority">Priority</label>
            <input id="up-priority" className="pc-input" inputMode="numeric" value={d.priority}
              onChange={(e) => set("priority", e.target.value.replace(/[^0-9-]/g, ""))} />
            <span className="pc-sub-line" style={{ fontSize: 12.5 }}>Higher shows first when several offers fit a cart.</span>
          </div>
          <div className="pc-switch-row">
            <span>Offer on</span>
            <button type="button" className="pc-switch" role="switch" aria-label="Offer on" aria-checked={d.is_active}
              data-on={d.is_active ? "" : undefined} onClick={() => set("is_active", !d.is_active)} />
          </div>
          {error ? <p role="alert" style={{ margin: 0, color: "var(--pc-bad, #B42318)", fontWeight: 600 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save offer"}</button>
            <button type="button" className="pc-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  );
}
