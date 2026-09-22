/**
 * Template tokens — product data inside template text and code.
 *
 *   {{ product.title }}            the product's name
 *   {{ product.price }}            lowest price shown to this shopper, e.g. $12.50
 *   {{ product.vendor }}  {{ product.type }}  {{ product.code }}
 *   {{ product.fabric }}  {{ product.weight }}
 *   {{ product.metafields.KEY }}   a metafield set on the product
 *
 * An unknown token, or a metafield the product doesn't have, prints nothing.
 * In custom code the values are HTML-escaped: product data is text, never code.
 */

export interface TokenContext {
  product: Record<string, string>;
  metafields: Record<string, string>;
}

export const TOKEN_HELP: { token: string; label: string }[] = [
  { token: "{{ product.title }}", label: "Title" },
  { token: "{{ product.price }}", label: "Lowest price" },
  { token: "{{ product.vendor }}", label: "Vendor" },
  { token: "{{ product.type }}", label: "Product type" },
  { token: "{{ product.code }}", label: "Product code" },
  { token: "{{ product.fabric }}", label: "Fabric" },
  { token: "{{ product.weight }}", label: "Weight" },
];

const TOKEN = /\{\{\s*product\.([a-z_]+)(?:\.([a-z][a-z0-9_]*))?\s*\}\}/gi;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

export function resolveTokens(input: string | undefined | null, ctx: TokenContext | undefined, opts?: { html?: boolean }): string {
  if (!input) return "";
  if (!ctx) return input;
  return input.replace(TOKEN, (_m, field: string, key?: string) => {
    const f = field.toLowerCase();
    const raw = f === "metafields" ? (key ? ctx.metafields[key.toLowerCase()] ?? "" : "") : ctx.product[f] ?? "";
    return opts?.html ? escapeHtml(raw) : raw;
  });
}

/** Every string in a page-builder section, tokens filled in (code fields escaped). */
export function resolveSectionTokens<T extends object>(section: T, ctx: TokenContext | undefined): T {
  if (!ctx) return section;
  const CODE = new Set(["html", "css", "js"]);
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") return resolveTokens(v, ctx, { html: key !== undefined && CODE.has(key) });
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, k)]));
    }
    return v;
  };
  return walk(section) as T;
}

interface ProductLike {
  name?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  product_code?: string | null;
  fabric?: string | null;
  weight?: string | null;
  metafields?: Record<string, string> | null;
  variants?: { effective_price?: string | number | null; retail_price?: string | number | null }[] | null;
  base_price?: number | null;
}

export function productTokenContext(p: ProductLike | null | undefined): TokenContext {
  const prices = (p?.variants ?? [])
    .map((v) => Number(v.effective_price ?? v.retail_price ?? NaN))
    .filter((n) => isFinite(n) && n > 0);
  if (!prices.length && p?.base_price) prices.push(Number(p.base_price));
  const low = prices.length ? Math.min(...prices) : null;
  return {
    product: {
      title: p?.name ?? "",
      price: low != null ? `$${low.toFixed(2)}` : "",
      vendor: p?.vendor ?? "",
      type: p?.product_type ?? "",
      code: p?.product_code ?? "",
      fabric: p?.fabric ?? "",
      weight: p?.weight ?? "",
    },
    metafields: p?.metafields ?? {},
  };
}
