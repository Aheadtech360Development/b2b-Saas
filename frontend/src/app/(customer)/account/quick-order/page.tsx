"use client";

/**
 * Quick order: a company buyer's two fast ways to fill the cart. The grid
 * takes one product's colours by sizes at once, at the buyer's own price; the
 * SKU box takes a pasted list ("SKU, quantity" per line) and says which lines
 * it could not add. The storefront's full quick order sheet (many products at
 * once, products with options) stays one click away.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { productsService } from "@/services/products.service";
import { cartService } from "@/services/cart.service";
import { trackCartAdd } from "@/lib/tracking";
import { compareSizes } from "@/lib/utils";
import { money } from "@/lib/customerWords";
import { Banner, PageHead, num } from "@/components/portal/ui";
import type { ProductDetail, ProductListItem } from "@/types/product.types";

const ONE_COLOR = "Standard";
const ONE_SIZE = "One size";
const colorOf = (v: { color: string | null }) => v.color?.trim() || ONE_COLOR;
const sizeOf = (v: { size: string | null }) => v.size?.trim() || ONE_SIZE;

function MatrixGrid() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2 || (product && q === product.name)) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      productsService.listProducts({ q: q.trim(), page_size: 10 })
        .then((r) => setResults(r.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, [q, product]);

  async function pick(p: ProductListItem) {
    setResults([]);
    setQ(p.name);
    setQty({});
    setMessage(null);
    setLoadingProduct(true);
    try { setProduct(await productsService.getProductBySlug(p.slug)); }
    catch { setProduct(null); setMessage({ tone: "bad", text: "That product could not be opened." }); }
    finally { setLoadingProduct(false); }
  }

  const variants = useMemo(() => (product?.variants ?? []).filter((v) => v.status !== "discontinued"), [product]);
  const colors = useMemo(() => [...new Set(variants.map(colorOf))], [variants]);
  const sizes = useMemo(() => [...new Set(variants.map(sizeOf))].sort(compareSizes), [variants]);
  const cell = (c: string, s: string) => variants.find((v) => colorOf(v) === c && sizeOf(v) === s);
  const kind = product?.gang_sheet_enabled ? "gang_sheet" : product?.pricing_mode === "configurable" ? "configurable" : "matrix";

  const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ variant_id: id, quantity: n }));
  const pieces = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => {
    const v = variants.find((x) => x.id === l.variant_id);
    return s + l.quantity * num(v?.effective_price ?? v?.retail_price);
  }, 0);
  const prices = [...new Set(lines.map((l) => { const v = variants.find((x) => x.id === l.variant_id); return num(v?.effective_price ?? v?.retail_price).toFixed(2); }))];

  async function add() {
    if (!product || !lines.length) return;
    setAdding(true);
    setMessage(null);
    try {
      trackCartAdd(await cartService.addMatrix(product.id, lines), lines);
      window.dispatchEvent(new Event("cart_updated"));
      setQty({});
      setMessage({ tone: "ok", text: `${pieces} piece${pieces === 1 ? "" : "s"} of ${product.name} added to your cart.` });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "These could not be added to your cart." });
    } finally {
      setAdding(false);
    }
  }

  return (
    <section id="grid" className="cp-card cp-pad cp-stack-sm" style={{ gap: 14 }} aria-labelledby="grid-title">
      <h2 id="grid-title" className="cp-h2">Matrix ordering grid</h2>
      <div className="cp-field" style={{ position: "relative" }}>
        <label className="cp-label" htmlFor="qo-product">Product</label>
        <input id="qo-product" className="cp-input" type="search" autoComplete="off" placeholder="Search by name or style number"
          value={q} onChange={(e) => { setQ(e.target.value); if (product && e.target.value !== product.name) setProduct(null); }} />
        {(results.length > 0 || searching) && (
          <div className="cp-search-menu" role="listbox" aria-label="Products">
            {searching && results.length === 0 ? <span className="cp-note" style={{ padding: "8px 12px" }}>Searching…</span> : results.map((p) => (
              <a key={p.id} role="option" aria-selected={false} href={`/products/${p.slug}`} onClick={(e) => { e.preventDefault(); pick(p); }}>
                {p.name}<small>{p.product_code || p.variants[0]?.sku || ""}</small>
              </a>
            ))}
          </div>
        )}
      </div>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {loadingProduct && <p className="cp-note" style={{ margin: 0 }}>Opening…</p>}

      {product && kind !== "matrix" && (
        <Banner tone="info">
          {product.name} has its own options. <Link href={`/products/${product.slug}`} className="cp-link">Open it to order</Link>.
        </Banner>
      )}

      {product && kind === "matrix" && (
        variants.length === 0 ? <p className="cp-note" style={{ margin: 0 }}>This product has nothing to order right now.</p> : (
          <>
            <div className="cp-card" style={{ overflow: "hidden" }}>
              <div className="cp-tbl-wrap">
                <table className="cp-tbl" style={{ minWidth: Math.max(420, 140 + sizes.length * 84) }}>
                  <thead><tr><th>Colour</th>{sizes.map((s) => <th key={s} className="cp-num">{s}</th>)}</tr></thead>
                  <tbody>
                    {colors.map((c) => (
                      <tr key={c}>
                        <td className="cp-strong">{c}</td>
                        {sizes.map((s) => {
                          const v = cell(c, s);
                          if (!v) return <td key={s} className="cp-num cp-muted">—</td>;
                          const max = v.stock_quantity ?? 9999;
                          return (
                            <td key={s} className="cp-num">
                              <input className="cp-input" type="number" min={0} max={max} inputMode="numeric"
                                aria-label={`${c} ${s} quantity`} title={`${money(num(v.effective_price ?? v.retail_price))} each${max < 9999 ? `, ${max} in stock` : ""}`}
                                disabled={max <= 0} placeholder={max <= 0 ? "Out" : ""}
                                style={{ height: 36, width: 72, textAlign: "right", padding: "0 8px" }}
                                value={qty[v.id] || ""}
                                onChange={(e) => {
                                  const n = Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0)));
                                  setQty((p) => ({ ...p, [v.id]: n }));
                                }} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="cp-actions" style={{ justifyContent: "space-between" }}>
              <span className="cp-note">
                {pieces
                  ? `${pieces} piece${pieces === 1 ? "" : "s"}${prices.length === 1 ? ` at ${money(Number(prices[0]))} each` : ""}, ${money(subtotal)}`
                  : "Type a quantity in any box."}
              </span>
              <button type="button" className="cp-btn cp-btn-p" disabled={!pieces || adding} onClick={add}>{adding ? "Adding…" : "Add to cart"}</button>
            </div>
          </>
        )
      )}
    </section>
  );
}

interface SkuResult {
  valid: { sku: string; quantity: number; variant_id: string | null }[];
  invalid: { sku: string; quantity: number }[];
  insufficient_stock: { sku: string; quantity: number; available_quantity: number | null }[];
  added_to_cart: number;
}

function SkuBox() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [result, setResult] = useState<SkuResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    setResult(null);
    const rows: { sku: string; quantity: number }[] = [];
    const unreadable: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^(\S+?)[\s,;\t]+(\d+)$/.exec(line) ?? /^(\S+)$/.exec(line);
      const quantity = m?.[2] ? parseInt(m[2], 10) : 1;
      if (!m || quantity <= 0) { unreadable.push(line); continue; }
      rows.push({ sku: m[1]!, quantity });
    }
    setBad(unreadable);
    if (!rows.length) { setError("Paste one SKU and quantity per line, for example: TEE-BLK-L, 12"); return; }
    setSending(true);
    try {
      const r = await cartService.quickOrder(rows) as SkuResult;
      setResult(r);
      if (r.valid.length) {
        // What went in leaves the box; what needs a look stays.
        const left = [...r.invalid.map((i) => `${i.sku}, ${i.quantity}`), ...r.insufficient_stock.map((i) => `${i.sku}, ${i.quantity}`), ...unreadable];
        setText(left.join("\n"));
        window.dispatchEvent(new Event("cart_updated"));
        const added = r.valid.filter((v) => v.variant_id).map((v) => ({ variant_id: v.variant_id!, quantity: v.quantity }));
        trackCartAdd(await cartService.getCart().catch(() => null), added);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "These could not be added to your cart.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cp-card cp-pad cp-stack-sm" style={{ gap: 14 }} aria-labelledby="sku-title">
      <h2 id="sku-title" className="cp-h2">Quick buy by SKU</h2>
      <div className="cp-field">
        <label className="cp-label" htmlFor="qo-skus">Paste SKUs and quantities</label>
        <textarea id="qo-skus" className="cp-textarea cp-mono" rows={8} placeholder={"TEE-BLK-L, 12\nTEE-BLK-XL, 6"} value={text} onChange={(e) => setText(e.target.value)} />
        <span className="cp-hint">One per line: the SKU, then the quantity (a comma, space or tab between).</span>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      {result && result.valid.length > 0 && <Banner tone="ok">{result.valid.length} line{result.valid.length === 1 ? "" : "s"} added to your cart.</Banner>}
      {(result && (result.invalid.length > 0 || result.insufficient_stock.length > 0)) || bad.length > 0 ? (
        <div className="cp-banner" data-tone="warn" role="status" style={{ display: "block" }}>
          <strong>These need a look:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {result?.invalid.map((i) => <li key={`n-${i.sku}`}>{i.sku}: no product has this SKU</li>)}
            {result?.insufficient_stock.map((i) => <li key={`s-${i.sku}`}>{i.sku}: only {i.available_quantity ?? 0} in stock, you asked for {i.quantity}</li>)}
            {bad.map((b) => <li key={`b-${b}`}>&ldquo;{b}&rdquo;: not a SKU and quantity</li>)}
          </ul>
        </div>
      ) : null}
      <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="cp-btn cp-btn-p" disabled={!text.trim() || sending} onClick={add}>{sending ? "Adding…" : "Add all to cart"}</button>
      </div>
    </section>
  );
}

export default function PortalQuickOrderPage() {
  return (
    <>
      <PageHead eyebrow="Quick order" title="Quick order" sub="Fill the grid or paste SKUs. Your own prices show as you go."
        actions={
          <>
            <Link href="/quick-order" className="cp-btn">Full order sheet</Link>
            <Link href="/cart" className="cp-btn cp-btn-p">Go to cart</Link>
          </>
        } />
      <div className="cp-cols">
        <div className="cp-col-main"><MatrixGrid /></div>
        <div className="cp-col-side"><SkuBox /></div>
      </div>
    </>
  );
}
