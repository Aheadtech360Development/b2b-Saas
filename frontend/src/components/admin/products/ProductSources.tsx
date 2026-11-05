"use client";

/**
 * Sources: where one of the shop's own products can come from besides its
 * own shelves (backend services/suppliers/sourcing.py). Buyers see one
 * product with the stock of every source together; an order takes the
 * shop's own stock first, then a supplier by the shop's rule. On the
 * Variants and stock tab of a stocked product.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ask } from "@/lib/dialog";
import { useLock } from "@/lib/entitlements";
import { errText } from "@/components/admin/suppliers/ui";
import { adminService } from "@/services/admin.service";
import { suppliersService, type CatalogStyle } from "@/services/suppliers.service";
import {
  productSourcesService, type ProductSources as Sources, type SourcePreview, type SourcingRule,
} from "@/services/productSources.service";

const money = (n: number | null) => (n == null ? "" : `$${n.toFixed(2)}`);

function costs(min: number | null, max: number | null): string {
  if (min == null) return "";
  return min === max || max == null ? `cost ${money(min)}` : `cost ${money(min)} to ${money(max)}`;
}

const label = (color: string | null, size: string | null) => [color, size].filter(Boolean).join(" ") || "–";

export function ProductSources({ productId, onChanged }: { productId: string; onChanged?: () => void }) {
  // Retail has no supplier catalogues, so there is nothing to link.
  const locked = useLock("supplier_catalog");
  const [data, setData] = useState<Sources | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await productSourcesService.get(productId));
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, [productId]);

  useEffect(() => { if (!locked) void load(); }, [load, locked]);

  // Linking and removing answer with the product's sources, not the
  // suppliers it can take or the shop's rule: those stay as they were.
  const keep = (next: Sources) => setData((prev) => ({
    ...next, can_link: next.can_link ?? prev?.can_link ?? [], rule: next.rule ?? prev?.rule,
  }));

  if (locked) return null;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (data?.imported_from) {
    const from = data.imported_from === "sanmar" ? "SanMar" : "S&S Activewear";
    return (
      <section className="pc-card pc-pad" data-product-sources="imported" style={{ marginBottom: "16px" }}>
        <h2 className="pc-h2">Sources</h2>
        <p className="pc-sub-line" style={{ marginTop: 0 }}>
          This product was imported from {from}, so all its stock comes from there. Make it your own product to
          sell your own stock of it too, and to add another supplier. It keeps its page, SKUs and {from} stock.
        </p>
        {error && <p className="pc-note" role="alert">{error}</p>}
        <button type="button" className="pc-btn" data-kind="primary" disabled={busy} data-convert
          onClick={() => void run(async () => {
            if (!(await ask(`Make this your own product, with ${from} as its source? Its ${from} stock keeps counting, and from now on you can add your own stock and another supplier.`, { ok: "Make it my own" }))) return;
            keep(await productSourcesService.convert(data.imported_from as string, productId));
            onChanged?.();
          })}>
          Make it my own product
        </button>
      </section>
    );
  }

  const linked = data?.suppliers ?? [];
  const ready = (data?.can_link ?? []).filter((c) => c.connected);
  return (
    <section className="pc-card pc-pad" data-product-sources style={{ marginBottom: "16px" }}>
      <div className="pc-title-row" style={{ justifyContent: "space-between", marginBottom: "6px" }}>
        <h2 className="pc-h2" style={{ margin: 0 }}>Sources</h2>
        {data && !adding && (
          <button type="button" className="pc-btn" onClick={() => setAdding(true)} data-add-source>+ Add a supplier</button>
        )}
      </div>
      <p className="pc-sub-line" style={{ marginTop: 0 }}>
        Sell this product from your own stock and your suppliers&apos; at once. Buyers see one product. An order
        takes your stock first, then a supplier, and that supplier is sent its part.
      </p>
      {error && <p className="pc-note" role="alert">{error}</p>}
      {!data && !error && <div className="pc-sub-line" aria-busy>Loading sources…</div>}
      {data && linked.length === 0 && !adding && (
        <p className="pc-sub-line" data-no-sources>No supplier linked yet: only your own stock is sold.</p>
      )}
      {linked.map((s) => (
        <div key={s.supplier} className="pc-set-row" data-source={s.supplier} style={{ padding: "12px 0" }}>
          <div>
            <strong>{s.label}</strong>
            <div className="pc-sub-line" style={{ margin: 0 }}>
              Style {s.style_id} · {s.linked} of {data?.variants.length ?? 0} colours and sizes linked · {s.stock} in stock
              {costs(s.cost_min, s.cost_max) && <> · {costs(s.cost_min, s.cost_max)}</>}
              {s.supplier === "sanmar" && (
                <> · ordered from SanMar by hand, see{" "}
                  <Link href="/admin/suppliers?supplier=sanmar&tab=manual" className="pc-link">Orders to place</Link></>
              )}
            </div>
          </div>
          <button type="button" className="pc-btn" disabled={busy}
            onClick={() => void run(async () => {
              if (!(await ask(`Remove ${s.label} from this product? Its stock stops counting here, and orders take only your own stock and any other source.`, { ok: "Remove", danger: true }))) return;
              keep(await productSourcesService.unlink(s.supplier, productId));
            })}>Remove</button>
        </div>
      ))}
      {data && (linked.length > 0 || ready.length > 1) && (
        <label className="pc-sub-line" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", margin: "10px 0 0" }} data-rule>
          When your own stock runs out, take from
          <select className="pc-input" style={{ width: "auto" }} value={data.rule ?? "cheapest"} disabled={busy}
            aria-label="When your own stock runs out, take from"
            onChange={(e) => {
              const value = e.target.value as SourcingRule;
              void run(async () => {
                const saved = await productSourcesService.setRule(value);
                setData((d) => (d ? { ...d, rule: saved.rule } : d));
              });
            }}>
            <option value="cheapest">the cheapest supplier (one that has the whole line first)</option>
            {(data.can_link ?? []).map((c) => <option key={c.supplier} value={c.supplier}>{c.label} first</option>)}
          </select>
          <span>for every product with sources.</span>
        </label>
      )}
      {data && linked.length > 0 && (
        <details style={{ marginTop: "8px" }} data-source-table>
          <summary className="pc-link">Stock by colour and size</summary>
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ marginTop: "10px" }}>
              <thead>
                <tr>
                  <th>Colour</th><th>Size</th><th className="pc-num">Your stock</th>
                  {linked.map((s) => <th key={s.supplier} className="pc-num">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v) => (
                  <tr key={v.variant_id}>
                    <td>{v.color ?? "–"}</td><td>{v.size ?? "–"}</td><td className="pc-num">{v.own}</td>
                    {linked.map((s) => (
                      <td key={s.supplier} className="pc-num">{v.sources[s.supplier]?.stock ?? "not linked"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {adding && data && (
        <AddSource productId={productId} canLink={data.can_link} variants={data.variants}
          onCancel={() => setAdding(false)}
          onDone={(next) => { keep(next); setAdding(false); }} />
      )}
    </section>
  );
}

function AddSource({ productId, canLink, variants, onCancel, onDone }: {
  productId: string;
  canLink: Sources["can_link"];
  variants: Sources["variants"];
  onCancel: () => void;
  onDone: (next: Sources) => void;
}) {
  const ready = canLink.filter((c) => c.connected);
  const [supplier, setSupplier] = useState(ready[0]?.supplier ?? "");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CatalogStyle[] | null>(null);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  // The shop's pick per variant: a supplier SKU, or "" for not at this supplier.
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // What the automatic match said, to send only what the shop changed.
  const auto = useMemo(() => {
    const out: Record<string, string> = {};
    for (const v of variants) out[v.variant_id] = "";
    for (const p of preview?.pairs ?? []) if (!p.taken_by) out[p.variant_id] = p.supplier_sku;
    return out;
  }, [preview, variants]);

  if (!ready.length) {
    return (
      <div className="pc-note" data-connect-first style={{ marginTop: "12px" }}>
        Connect S&amp;S Activewear or SanMar first, in <Link href="/admin/suppliers" className="pc-link">Products → Suppliers</Link>.
        {" "}<button type="button" className="pc-link" onClick={onCancel}>Close</button>
      </div>
    );
  }

  async function step(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const search = () => step(async () => {
    setPreview(null);
    setFound((await suppliersService.catalog(supplier, { q: q.trim() })).items);
  });

  const choose = (style: CatalogStyle) => step(async () => {
    const p = await productSourcesService.preview(supplier, productId, style.style_id);
    setPreview(p);
    const next: Record<string, string> = {};
    for (const v of variants) next[v.variant_id] = "";
    for (const pair of p.pairs) if (!pair.taken_by) next[pair.variant_id] = pair.supplier_sku;
    setChoice(next);
  });

  const link = () => step(async () => {
    if (!preview) return;
    const changed: Record<string, string | null> = {};
    for (const [vid, sku] of Object.entries(choice)) if (sku !== auto[vid]) changed[vid] = sku || null;
    onDone(await productSourcesService.link(supplier, productId, preview.style_id,
      Object.keys(changed).length ? changed : undefined));
  });

  const hide = (id: string) => step(async () => {
    await adminService.updateProduct(id, { status: "draft" });
    setHidden((h) => new Set(h).add(id));
  });

  const used = new Map<string, number>();
  for (const sku of Object.values(choice)) if (sku) used.set(sku, (used.get(sku) ?? 0) + 1);
  const twice = [...used.values()].some((n) => n > 1);
  const count = Object.values(choice).filter(Boolean).length;
  const how = new Map((preview?.pairs ?? []).map((p) => [p.variant_id, p] as const));

  return (
    <div data-add-source-panel style={{ marginTop: "12px", borderTop: "1px solid var(--pc-line-soft)", paddingTop: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select className="pc-input" aria-label="Supplier" value={supplier} style={{ width: "auto" }}
          onChange={(e) => { setSupplier(e.target.value); setFound(null); setPreview(null); }}>
          {ready.map((c) => <option key={c.supplier} value={c.supplier}>{c.label}</option>)}
        </select>
        <input className="pc-input" aria-label="Style number or name" placeholder="Style number or name, e.g. 5000"
          value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 220px" }}
          onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); void search(); } }} />
        <button type="button" className="pc-btn" disabled={busy || !q.trim()} onClick={() => void search()}>Search</button>
        <button type="button" className="pc-btn" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="pc-note" role="alert">{error}</p>}

      {found && !preview && (
        found.length === 0
          ? <p className="pc-sub-line" data-no-styles>No style matches that. Try the style number.</p>
          : (
            <div style={{ marginTop: "10px" }} data-styles>
              {found.slice(0, 12).map((s) => (
                <div key={s.style_id} className="pc-set-row" style={{ padding: "8px 0" }}>
                  <span>{s.brand} {s.style_name}<span className="pc-sub-line" style={{ margin: 0, display: "block" }}>{s.title}</span></span>
                  <button type="button" className="pc-btn" disabled={busy} onClick={() => void choose(s)}>Choose</button>
                </div>
              ))}
            </div>
          )
      )}

      {preview && (
        <div style={{ marginTop: "12px" }} data-source-preview>
          <p style={{ margin: "0 0 6px" }}>
            <strong>{preview.style}</strong> at {preview.label}: {count} of {preview.variants} colours and sizes found.
            Check each one, and pick it by hand where it is wrong or missing.
          </p>
          {preview.duplicates.filter((d) => !hidden.has(d.id)).map((d) => (
            <div key={d.id} className="pc-note" data-duplicates style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <span>You also have this style as its own product, imported from {preview.label}: {d.name}. Hide it so the shirt shows once.</span>
              <button type="button" className="pc-btn" disabled={busy} onClick={() => void hide(d.id)}>Set it to Draft</button>
            </div>
          ))}
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ marginTop: "8px" }} data-match-table>
              <thead><tr><th>Yours</th><th>At {preview.label}</th></tr></thead>
              <tbody>
                {variants.map((v) => {
                  const p = how.get(v.variant_id);
                  return (
                    <tr key={v.variant_id} data-match={v.variant_id}>
                      <td>{label(v.color, v.size)}</td>
                      <td>
                        <select className="pc-input" aria-label={`${label(v.color, v.size)} at ${preview.label}`}
                          value={choice[v.variant_id] ?? ""} style={{ width: "auto", maxWidth: "100%" }}
                          onChange={(e) => setChoice((c) => ({ ...c, [v.variant_id]: e.target.value }))}>
                          <option value="">Not at {preview.label}</option>
                          {preview.rows.map((r) => (
                            <option key={r.sku} value={r.sku} disabled={Boolean(r.taken_by)}>
                              {label(r.color, r.size)}{r.taken_by ? ` (already on ${r.taken_by})` : ""}
                            </option>
                          ))}
                        </select>
                        {p?.how === "close" && choice[v.variant_id] === p.supplier_sku && (
                          <span className="pc-pill" data-tone="amber" style={{ marginLeft: "8px", textTransform: "none" }}>close name, check</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.spare > 0 && (
            <p className="pc-sub-line">{preview.label} has more colours and sizes in this style than this product. They are not added.</p>
          )}
          {twice && <p className="pc-note" role="alert">One {preview.label} colour and size is picked twice. Each can go with one of yours only.</p>}
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy || count === 0 || twice}
              onClick={() => void link()}>Link {count} to {preview.label}</button>
            <button type="button" className="pc-btn" disabled={busy} onClick={() => setPreview(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
