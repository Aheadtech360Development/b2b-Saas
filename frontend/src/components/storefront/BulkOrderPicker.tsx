"use client";

/**
 * The bulk order form: how a blank sold by the case is bought.
 *
 * Colour cards the buyer picks up to ten of (a second click puts one back):
 * the first five, and Load more for the rest, ten at a time. Each colour
 * picked opens its row of sizes, with the price and the stock of every size
 * in words (Sold out, Only 4 left, In stock, N/A for a size the colour does
 * not come in) and a box for how many. A colour sold out in every size says
 * so on its card. One Add to cart puts every quantity in the cart at once, in
 * the same cart the rest of the shop uses.
 *
 * A card shows the colour's own picture: one whose alt text names the colour,
 * which the S&S import writes and the product's Media tab sets ("Color").
 * With no picture for a colour, or when the shop chose swatches only, the card
 * is the colour itself.
 *
 * Drawn on the website builder's product page (render.tsx BuyBox) and on the
 * older product page alike, for a product sold in bulk (products.bulk_order).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ApiClientError } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";
import { addToGuestCart } from "@/lib/guestCart";
import { trackAddToCart, trackCartAdd } from "@/lib/tracking";
import { announceColour, picturesOfColour } from "@/lib/colourPictures";
import { colorHex, isLightColor } from "@/lib/colors";
import { compareSizes } from "@/lib/utils";
import type { ProductDetail } from "@/types/product.types";

/** How many colours one order form takes at a time. */
export const MAX_COLOURS = 10;

/** Colour cards shown when the page opens, and how many more each Load more shows. */
export const FIRST_COLOURS = 5;
export const MORE_COLOURS = 10;

/** What a stock count of this or more means: not counted, so no limit. */
const NO_LIMIT = 9999;

/** Counted stock of this or less reads "Only 4 left". */
const LOW_STOCK = 10;

export interface BulkVariant {
  id: string;
  colour: string;
  size: string;
  price: number | null;
  stock: number;
  sku: string;
}

export interface BulkProduct {
  id: string;
  slug: string;
  name: string;
  images: { url: string; alt: string; thumb?: string }[];
  variants: BulkVariant[];
  colours: { label: string; hex: string }[];
  sizes: { label: string }[];
  /** "swatches": the colour alone on every card, even where a picture exists. */
  bulk_cards?: string;
  moq?: number;
}

const money = (value: number) => `$${value.toFixed(2)}`;

/** The picture a colour's card shows: its front, before a back or a side. */
export function cardPicture(images: BulkProduct["images"], colour: string): string | null {
  const parts = (alt: string) => (alt || "").split(/\s+[-–—|/]\s+|\s*,\s*/).length;
  const pics = [...picturesOfColour(images, colour)].sort((a, b) => parts(a.alt) - parts(b.alt));
  const pic = pics[0];
  return pic ? pic.thumb || pic.url : null;
}

/**
 * What a size's stock cell says. "N/A": the colour does not come in that size.
 * "Sold out": it does, and none is left. A count the shop does not keep is "In
 * stock"; a low one is said as what is left.
 */
export function stockState(v: BulkVariant | undefined): { text: string; tone?: "out" | "low" | "none" } {
  if (!v) return { text: "N/A", tone: "none" };
  if (v.stock <= 0) return { text: "Sold out", tone: "out" };
  if (v.stock >= NO_LIMIT) return { text: "In stock" };
  if (v.stock <= LOW_STOCK) return { text: `Only ${v.stock} left`, tone: "low" };
  return { text: v.stock.toLocaleString("en-US") };
}

/**
 * A product from the older product page's answer (GET /products/{slug}), in
 * the shape this form takes. The price is the buyer's own (their group's),
 * which that page has always shown.
 */
export function bulkProductOf(p: ProductDetail): BulkProduct {
  // A size marked out of stock is still the colour's: it reads Sold out, not N/A.
  const active = (p.variants ?? []).filter((v) => v.status !== "discontinued");
  const colours: BulkProduct["colours"] = [];
  for (const v of active) {
    if (v.color && !colours.some((c) => c.label === v.color)) colours.push({ label: v.color, hex: v.color_hex ?? "" });
  }
  const sizes = Array.from(new Set(active.map((v) => v.size).filter(Boolean) as string[])).sort(compareSizes);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    images: (p.images ?? []).map((i) => ({ url: i.url_large || i.url_medium, alt: i.alt_text || p.name, thumb: i.url_medium || i.url_large })),
    variants: active.map((v) => ({
      id: v.id,
      colour: v.color ?? "",
      size: v.size ?? "",
      price: Number(v.effective_price ?? v.retail_price ?? 0),
      stock: v.status === "out_of_stock" ? 0 : v.stock_quantity ?? 0,
      sku: v.sku,
    })),
    colours,
    sizes: sizes.map((label) => ({ label })),
    bulk_cards: p.bulk_cards ?? "pictures",
    moq: p.moq ?? 1,
  };
}

/** Whether a product from that answer is sold on this form. */
export function soldInBulk(p: ProductDetail): boolean {
  if (!p.bulk_order || p.pricing_mode === "configurable" || p.gang_sheet_enabled) return false;
  const v = p.variants ?? [];
  return v.some((x) => x.color) && v.some((x) => x.size);
}

export default function BulkOrderPicker({ product }: { product: BulkProduct }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [chosen, setChosen] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The first five cards, and more as the buyer asks for them.
  const [shown, setShown] = useState(FIRST_COLOURS);

  const swatchesOnly = product.bulk_cards === "swatches";
  const sizes = product.sizes.map((s) => s.label);
  const byKey = useMemo(() => {
    const map = new Map<string, BulkVariant>();
    for (const v of product.variants) map.set(`${v.colour}\u0000${v.size}`, v);
    return map;
  }, [product.variants]);
  const variantOf = (colour: string, size: string) => byKey.get(`${colour}\u0000${size}`);
  const hexOf = (label: string) => colorHex(label, product.colours.find((c) => c.label === label)?.hex);
  // A colour none of whose sizes has any left.
  const soldOut = useMemo(() => {
    const left = new Map<string, boolean>();
    for (const v of product.variants) left.set(v.colour, (left.get(v.colour) ?? false) || v.stock > 0);
    return new Set([...left].filter(([, any]) => !any).map(([colour]) => colour));
  }, [product.variants]);
  const visible = product.colours.slice(0, shown);
  const more = product.colours.length - visible.length;

  // ── Choosing colours ──
  function toggle(colour: string) {
    setMessage(null);
    if (chosen.includes(colour)) {
      remove(colour);
      return;
    }
    if (soldOut.has(colour)) {
      setNote(`${colour} is sold out in every size.`);
      return;
    }
    if (chosen.length >= MAX_COLOURS) {
      setNote(`Up to ${MAX_COLOURS} colours at a time. Remove one to add ${colour}.`);
      return;
    }
    setNote("");
    setChosen((list) => [...list, colour]);
    // The gallery beside the form shows this colour's pictures.
    announceColour(product.id, colour);
  }

  function remove(colour: string) {
    setNote("");
    setChosen((list) => list.filter((c) => c !== colour));
    setQty((q) => {
      const next = { ...q };
      for (const size of sizes) {
        const v = variantOf(colour, size);
        if (v) delete next[v.id];
      }
      return next;
    });
  }

  function setQuantity(v: BulkVariant, raw: string) {
    setMessage(null);
    let n = Math.max(0, parseInt(raw.replace(/\D/g, ""), 10) || 0);
    if (v.stock < NO_LIMIT && n > v.stock) {
      n = v.stock;
      setNote(`Only ${v.stock.toLocaleString("en-US")} left in ${v.colour}, ${v.size}.`);
    } else {
      setNote("");
    }
    setQty((q) => {
      const next = { ...q };
      if (n > 0) next[v.id] = n;
      else delete next[v.id];
      return next;
    });
  }

  // ── What is in the form ──
  const lines = chosen.flatMap((colour) => sizes.flatMap((size) => {
    const v = variantOf(colour, size);
    const n = v ? qty[v.id] ?? 0 : 0;
    return v && n > 0 ? [{ v, n }] : [];
  }));
  const pieces = lines.reduce((sum, l) => sum + l.n, 0);
  const total = lines.reduce((sum, l) => sum + l.n * (l.v.price ?? 0), 0);
  const moq = product.moq ?? 1;

  async function addAll() {
    if (!lines.length || busy) return;
    setBusy(true);
    setMessage(null);
    const items = lines.map((l) => ({ variant_id: l.v.id, quantity: l.n }));
    try {
      if (isAuthenticated) {
        trackCartAdd(await cartService.addMatrix(product.id, items), items);
      } else {
        // No account needed to shop: the guest cart the rest of the storefront
        // keeps, and the same guest checkout at the end of it.
        for (const { v, n } of lines) {
          addToGuestCart({
            variant_id: v.id, quantity: n, product_id: product.id, product_name: product.name,
            slug: product.slug, color: v.colour || null, size: v.size || null, unit_price: v.price ?? 0,
            image_url: cardPicture(product.images, v.colour) ?? product.images[0]?.url ?? null,
          });
        }
        trackAddToCart(lines.map(({ v, n }) => ({
          id: v.id, sku: v.sku, name: product.name, price: v.price ?? 0, quantity: n,
          variant: [v.colour, v.size].filter(Boolean).join(" / "),
        })));
      }
      window.dispatchEvent(new Event("cart_updated"));
      setQty({});
      setNote("");
      setMessage({ ok: true, text: `Added ${pieces.toLocaleString("en-US")} ${pieces === 1 ? "piece" : "pieces"} to your cart.` });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setMessage({ ok: false, text: "Please sign in again to finish that." });
        const back = `${window.location.pathname}${window.location.search}`;
        window.setTimeout(() => router.push(`/login?next=${encodeURIComponent(back)}`), 1400);
      } else {
        // A refusal says why (a 403 is not a lost session).
        setMessage({ ok: false, text: err instanceof ApiClientError && err.message ? err.message : "Could not add those to your cart." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bop" data-bulk-order={product.id}>
      <style dangerouslySetInnerHTML={{ __html: BULK_CSS }} />
      <p className="bop-hint">Click to select multiple colors (max <b>{MAX_COLOURS}</b>). Click again to deselect.</p>

      <div className="bop-cards" role="group" aria-label="Colours">
        {visible.map((c) => {
          const at = chosen.indexOf(c.label);
          const gone = soldOut.has(c.label);
          const picture = swatchesOnly ? null : cardPicture(product.images, c.label);
          const hex = hexOf(c.label);
          return (
            <button key={c.label} type="button" className="bop-card" aria-pressed={at >= 0} title={gone ? `${c.label}: sold out` : c.label}
                    aria-disabled={gone || undefined} data-colour={c.label} data-on={at >= 0 ? "" : undefined}
                    data-soldout={gone ? "" : undefined} onClick={() => toggle(c.label)}>
              {at >= 0 && <span className="bop-n" aria-hidden>{at + 1}</span>}
              {at >= 0 && <span className="bop-tick" aria-hidden><Check size={12} strokeWidth={3} /></span>}
              <span className="bop-pic">
                {picture
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={picture} alt="" loading="lazy" />
                  : <span className="bop-chip" data-light={isLightColor(hex) ? "" : undefined} style={{ background: hex }} />}
                {gone && <span className="bop-gone">Sold out</span>}
              </span>
              <span className="bop-name">{c.label}</span>
            </button>
          );
        })}
      </div>
      {more > 0 && (
        <button type="button" className="bop-more" data-load-more onClick={() => setShown((n) => n + MORE_COLOURS)}>
          Load more colours <span>({more.toLocaleString("en-US")} more)</span>
        </button>
      )}

      {note && <p className="bop-note" role="status">{note}</p>}

      {chosen.map((colour) => {
        const hex = hexOf(colour);
        return (
          <section key={colour} className="bop-panel" data-colour-panel={colour} aria-label={colour}>
            <header className="bop-head">
              <span className="bop-dot" data-light={isLightColor(hex) ? "" : undefined} style={{ background: hex }} aria-hidden />
              <b>{colour}</b>
              <button type="button" className="bop-remove" onClick={() => remove(colour)} aria-label={`Remove ${colour}`}>
                <X size={13} aria-hidden /> Remove
              </button>
            </header>
            <div className="bop-scroll">
              <table className="bop-grid">
                <thead>
                  <tr>
                    <th aria-label="Size" />
                    {sizes.map((s) => {
                      // A size that cannot be ordered in this colour is greyed at its head too.
                      const v = variantOf(colour, s);
                      return <th key={s} scope="col" data-off={!v || v.stock <= 0 ? "" : undefined}>{s}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr data-row="price">
                    <th scope="row">Price</th>
                    {sizes.map((s) => {
                      const v = variantOf(colour, s);
                      const priced = v && v.price != null;
                      return <td key={s} className={!priced ? "bop-none" : v.stock <= 0 ? "bop-price-off" : "bop-price"}>{priced ? money(v.price!) : "—"}</td>;
                    })}
                  </tr>
                  <tr data-row="stock">
                    <th scope="row">Stock</th>
                    {sizes.map((s) => {
                      const state = stockState(variantOf(colour, s));
                      return <td key={s} className={state.tone ? `bop-${state.tone}` : undefined}>{state.text}</td>;
                    })}
                  </tr>
                  <tr data-row="qty">
                    <th scope="row">Qty</th>
                    {sizes.map((s) => {
                      const v = variantOf(colour, s);
                      const off = !v || v.stock <= 0 || v.price == null;
                      return (
                        <td key={s}>
                          <input className="bop-qty" type="text" inputMode="numeric" pattern="[0-9]*"
                                 aria-label={`${colour}, ${s}: how many`} disabled={off}
                                 value={v ? String(qty[v.id] ?? 0) : "0"}
                                 onFocus={(e) => e.currentTarget.select()}
                                 onChange={(e) => v && setQuantity(v, e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="bop-foot">
        <div className="bop-total" data-bulk-total>
          <span><b>{pieces.toLocaleString("en-US")}</b> {pieces === 1 ? "piece" : "pieces"}</span>
          <span className="bop-sum">{money(total)}</span>
          {moq > 1 && pieces > 0 && pieces < moq && <span className="bop-moq">Minimum order: {moq.toLocaleString("en-US")} pieces</span>}
        </div>
        <button type="button" className="bop-add" disabled={!pieces || busy} onClick={() => void addAll()} data-bulk-add>
          {busy ? "Adding…" : "Add to cart"}
        </button>
      </div>

      {message && (
        <p className="bop-msg" role="status" data-ok={message.ok ? "" : undefined}>
          {message.text}
          {message.ok && <a href="/cart">View cart →</a>}
        </p>
      )}
    </div>
  );
}

// Its own look, so it reads the same on a builder page and on the older one.
// The builder's colours come through when it is on one (--b-*); the brand's
// colour on the older page (--brand-primary).
const BULK_CSS = `
.bop{--bop-ink:var(--b-primary,var(--brand-primary,#14161B));--bop-line:var(--b-border,#E2E2E2);--bop-soft:#F4F4F5;--bop-muted:#6B6B70;--bop-price:#D32F2F;display:flex;flex-direction:column;gap:14px;width:100%;min-width:0;color:var(--b-text,#14161B)}
.bop .bop-hint{margin:0;font-size:13px;color:var(--bop-muted)}
.bop .bop-hint b{color:var(--b-text,#14161B)}
.bop .bop-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;max-width:620px;padding-top:8px}
.bop .bop-more{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border:1.5px solid var(--bop-line);border-radius:999px;background:#fff;color:#14161B;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.bop .bop-more:hover{border-color:var(--bop-ink)}
.bop .bop-more span{font-weight:400;color:var(--bop-muted)}
.bop .bop-card{position:relative;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:7px 6px 8px;border:1.5px solid var(--bop-line);border-radius:10px;background:#fff;cursor:pointer;font:inherit;color:inherit;text-align:center}
.bop .bop-card:hover{border-color:#B9B9BE}
.bop .bop-card[data-on]{border:2.5px solid var(--bop-ink);padding:6px 5px 7px}
.bop .bop-card:focus-visible{outline:2px solid var(--bop-ink);outline-offset:2px}
.bop .bop-pic{position:relative;width:100%;max-width:84px;aspect-ratio:1;border-radius:6px;background:var(--bop-soft);overflow:hidden;display:flex;align-items:center;justify-content:center}
.bop .bop-gone{position:absolute;left:0;right:0;bottom:0;padding:3px 0;background:rgba(20,22,27,.78);color:#fff;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-align:center}
.bop .bop-card[data-soldout]{cursor:not-allowed;background:#FAFAFA}
.bop .bop-card[data-soldout] img,.bop .bop-card[data-soldout] .bop-chip{opacity:.45}
.bop .bop-card[data-soldout] .bop-name{color:#9A9AA0}
.bop .bop-pic img{width:100%;height:100%;object-fit:cover;display:block}
.bop .bop-chip{width:100%;height:100%;display:block}
.bop .bop-chip[data-light]{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);border-radius:6px}
.bop .bop-name{display:block;width:100%;font-size:12px;line-height:1.25;color:#3A3A40;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bop .bop-card[data-on] .bop-name{font-weight:700;color:#14161B}
.bop .bop-n{position:absolute;top:-8px;left:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#E4E4E7;color:#3A3A40;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
.bop .bop-tick{position:absolute;top:5px;right:5px;width:20px;height:20px;border-radius:999px;background:var(--bop-ink);color:#fff;display:flex;align-items:center;justify-content:center}
.bop .bop-note{margin:0;font-size:13px;color:#9A3412;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:8px 12px}
.bop .bop-panel{border:1px solid var(--bop-line);border-radius:12px;overflow:hidden;background:#fff}
.bop .bop-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#F7F7F8;border-bottom:1px solid var(--bop-line)}
.bop .bop-head b{font-size:15px}
.bop .bop-dot{width:16px;height:16px;border-radius:4px;flex:none}
.bop .bop-dot[data-light]{box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.bop .bop-remove{margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--bop-line);border-radius:6px;background:#fff;color:#55555B;font:inherit;font-size:12.5px;cursor:pointer}
.bop .bop-remove:hover{border-color:#B9B9BE;color:#14161B}
.bop .bop-scroll{overflow-x:auto}
.bop .bop-grid{width:100%;border-collapse:collapse;min-width:max-content;font-size:14px}
.bop .bop-grid th,.bop .bop-grid td{border-bottom:1px solid #EFEFF1;border-right:1px solid #EFEFF1;padding:10px 8px;text-align:center;white-space:nowrap}
.bop .bop-grid tr:last-child th,.bop .bop-grid tr:last-child td{border-bottom:none}
.bop .bop-grid th:last-child,.bop .bop-grid td:last-child{border-right:none}
.bop .bop-grid thead th{background:#F1F1F3;font-weight:700;font-size:15px;min-width:76px}
.bop .bop-grid tbody th{text-align:left;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bop-muted);padding-left:14px;min-width:84px}
.bop .bop-grid .bop-price{color:var(--bop-price);font-weight:700}
.bop .bop-grid .bop-none{color:#B4B4BA}
.bop .bop-grid .bop-out{color:var(--bop-price);font-weight:700;font-size:13px}
.bop .bop-grid .bop-low{color:#B45309;font-weight:600;font-size:13px}
.bop .bop-grid .bop-price-off{color:#A1A1A8;font-weight:600}
.bop .bop-grid thead th[data-off]{color:#A1A1A8}
.bop .bop-qty{width:72px;height:40px;border:1.5px solid #D4D4D8;border-radius:8px;text-align:center;font:inherit;font-size:16px;font-weight:700;background:#fff;color:#14161B;padding:0 6px}
.bop .bop-qty:focus{outline:none;border-color:var(--bop-ink);box-shadow:0 0 0 2px rgba(0,0,0,.06)}
.bop .bop-qty:disabled{background:#F1F1F3;border-color:#E4E4E7;color:#B4B4BA;cursor:not-allowed}
.bop .bop-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;justify-content:space-between;padding-top:4px}
.bop .bop-total{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;font-size:14px;color:var(--bop-muted)}
.bop .bop-total b{color:#14161B;font-size:16px}
.bop .bop-sum{font-size:18px;font-weight:700;color:#14161B}
.bop .bop-moq{flex-basis:100%;font-size:12.5px;color:#9A3412}
.bop .bop-add{flex:1 1 220px;max-width:100%;padding:14px 22px;border:none;border-radius:var(--b-btn-radius,10px);background:var(--bop-ink);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer}
.bop .bop-add:disabled{opacity:.45;cursor:not-allowed}
.bop .bop-msg{margin:0;padding:10px 14px;border-radius:8px;font-size:14px;background:#FDECEC;color:#8A1C1C}
.bop .bop-msg[data-ok]{background:#E8F5EE;color:#0F5132}
.bop .bop-msg a{margin-left:10px;font-weight:700;color:inherit}
@media (max-width:600px){.bop .bop-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.bop .bop-qty{width:60px}}
`;
