"use client";

/**
 * Sources: where one of the shop's own products can come from besides its
 * own shelves (backend services/suppliers/sourcing.py). Buyers see one
 * product with the stock of every source together; an order takes the
 * shop's own stock first, then the cheapest supplier that has it. On the
 * Variants and stock tab of a stocked product.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ask } from "@/lib/dialog";
import { useLock } from "@/lib/entitlements";
import { errText } from "@/components/admin/suppliers/ui";
import { suppliersService, type CatalogStyle } from "@/services/suppliers.service";
import {
  productSourcesService, type ProductSources as Sources, type SourcePreview,
} from "@/services/productSources.service";

const money = (n: number | null) => (n == null ? "" : `$${n.toFixed(2)}`);

function costs(min: number | null, max: number | null): string {
  if (min == null) return "";
  return min === max || max == null ? `cost ${money(min)}` : `cost ${money(min)} to ${money(max)}`;
}

export function ProductSources({ productId }: { productId: string }) {
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
  // suppliers it can take: those stay as they were.
  const keep = (next: Sources) => setData((prev) => ({ ...next, can_link: next.can_link ?? prev?.can_link ?? [] }));

  if (locked) return null;
  if (data?.imported_from) {
    return (
      <section className="pc-card pc-pad" data-product-sources="imported" style={{ marginBottom: "16px" }}>
        <h2 className="pc-h2">Sources</h2>
        <p className="pc-sub-line" style={{ margin: 0 }}>
          This product was imported from a supplier, so its stock already comes from there. Sources are added to
          your own products: one product for the buyer, with your stock and your suppliers&apos; together.
        </p>
      </section>
    );
  }

  async function remove(supplier: string, label: string) {
    if (!(await ask(`Remove ${label} from this product? Its stock stops counting here, and orders take only your own stock and any other source.`, { ok: "Remove", danger: true }))) return;
    setBusy(true);
    try {
      keep(await productSourcesService.unlink(supplier, productId));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const linked = data?.suppliers ?? [];
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
        takes your stock first, then the cheapest supplier that has it, and that supplier is sent its part.
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
              {s.supplier === "sanmar" && <> · orders for SanMar are placed by hand for now</>}
            </div>
          </div>
          <button type="button" className="pc-btn" disabled={busy} onClick={() => void remove(s.supplier, s.label)}>Remove</button>
        </div>
      ))}
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
        <AddSource productId={productId} canLink={data.can_link}
          onCancel={() => setAdding(false)}
          onDone={(next) => { keep(next); setAdding(false); }} />
      )}
    </section>
  );
}

function AddSource({ productId, canLink, onCancel, onDone }: {
  productId: string;
  canLink: Sources["can_link"];
  onCancel: () => void;
  onDone: (next: Sources) => void;
}) {
  const ready = canLink.filter((c) => c.connected);
  const [supplier, setSupplier] = useState(ready[0]?.supplier ?? "");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CatalogStyle[] | null>(null);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready.length) {
    return (
      <div className="pc-note" data-connect-first style={{ marginTop: "12px" }}>
        Connect S&amp;S Activewear or SanMar first, in <Link href="/admin/suppliers" className="pc-link">Products → Suppliers</Link>.
        {" "}<button type="button" className="pc-link" onClick={onCancel}>Close</button>
      </div>
    );
  }

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setFound((await suppliersService.catalog(supplier, { q: q.trim() })).items);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function choose(style: CatalogStyle) {
    setBusy(true);
    setError("");
    try {
      setPreview(await productSourcesService.preview(supplier, productId, style.style_id));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      onDone(await productSourcesService.link(supplier, productId, preview.style_id));
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const usable = preview ? preview.pairs.filter((p) => !p.taken_by) : [];
  const close = preview ? preview.pairs.filter((p) => p.how === "close") : [];
  const taken = preview ? preview.pairs.filter((p) => p.taken_by) : [];
  return (
    <div data-add-source-panel style={{ marginTop: "12px", borderTop: "1px solid var(--pc-line-soft)", paddingTop: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select className="pc-input" aria-label="Supplier" value={supplier} style={{ width: "auto" }}
          onChange={(e) => { setSupplier(e.target.value); setFound(null); setPreview(null); }}>
          {ready.map((c) => <option key={c.supplier} value={c.supplier}>{c.label}</option>)}
        </select>
        <input className="pc-input" aria-label="Style number or name" placeholder="Style number or name, e.g. 5000"
          value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 220px" }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />
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
            <strong>{preview.style}</strong> at {preview.label}: {usable.length} of {preview.variants} colours and sizes found.
          </p>
          {close.length > 0 && (
            <p className="pc-sub-line" data-close-matches>
              Matched by a close colour name, check these: {close.map((p) => `${p.color} ${p.size} = ${p.supplier_color} ${p.supplier_size}`).join("; ")}.
            </p>
          )}
          {preview.unmatched.length > 0 && (
            <p className="pc-sub-line" data-unmatched>
              Not at {preview.label}, so only your stock sells: {preview.unmatched.map((v) => `${v.color ?? ""} ${v.size ?? ""}`.trim()).join(", ")}.
            </p>
          )}
          {taken.length > 0 && (
            <p className="pc-sub-line" data-taken>
              Already a source of another product, so left out: {taken.map((p) => `${p.color} ${p.size} (${p.taken_by})`).join(", ")}.
            </p>
          )}
          {preview.spare > 0 && (
            <p className="pc-sub-line">{preview.label} has {preview.spare} more colours and sizes in this style that this product does not have. They are not added.</p>
          )}
          {preview.duplicates.length > 0 && (
            <p className="pc-note" data-duplicates>
              You also have this style as its own product, imported from {preview.label}:{" "}
              {preview.duplicates.map((d) => d.name).join(", ")}. Hide or delete it so the shirt shows once.
            </p>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy || usable.length === 0}
              onClick={() => void link()}>Link {usable.length} to {preview.label}</button>
            <button type="button" className="pc-btn" disabled={busy} onClick={() => setPreview(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
