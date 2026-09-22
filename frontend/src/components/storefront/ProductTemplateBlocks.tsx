"use client";

/**
 * Product templates on the storefront: the layout types, the custom blocks,
 * and the rule for which blocks show. The product page itself draws the four
 * standard blocks (title, price, highlight, buy) — this file only draws what a
 * template adds around them. Mirrors backend/app/services/product_templates.py.
 */
import type { PageSection } from "@/components/storefront/SectionRenderer";
import CustomCodeFrame from "@/components/storefront/CustomCodeFrame";
import { resolveTokens, type TokenContext } from "@/lib/templateTokens";

export type StandardBlockType = "title" | "price" | "highlight" | "buy";
export type CustomBlockType = "announcement" | "text" | "custom_code";

export interface TemplateBlock {
  id: string;
  type: StandardBlockType | CustomBlockType;
  enabled?: boolean;
  /** Only show when the product has a value for this metafield. */
  show_if_metafield?: string;
  // price
  show_from_price?: boolean;
  // announcement
  text?: string;
  icon?: string;
  bg_color?: string;
  text_color?: string;
  align?: "left" | "center";
  // text
  heading?: string;
  body?: string;
  style?: "plain" | "callout" | "muted";
  // custom_code
  html?: string;
  css?: string;
  js?: string;
}

export interface TemplateLayout {
  blocks: TemplateBlock[];
  sections: PageSection[];
}

export interface StorefrontTemplate extends TemplateLayout {
  template_id: string;
  name: string;
  preview: boolean;
}

export const STANDARD_BLOCKS: Record<StandardBlockType, string> = {
  title: "Title",
  price: "Price",
  highlight: "Highlight box",
  buy: "Variants & add to cart",
};

export const CUSTOM_BLOCKS: Record<CustomBlockType, { label: string; icon: string; hint: string }> = {
  announcement: { label: "Announcement bar", icon: "📣", hint: "A coloured strip — offers, shipping notes, deadlines." },
  text: { label: "Text", icon: "✍️", hint: "A heading and a paragraph — guarantees, trust text, care notes." },
  custom_code: { label: "Custom code", icon: "</>", hint: "Your own HTML, CSS and JavaScript." },
};

export const isStandard = (t: string): t is StandardBlockType => t in STANDARD_BLOCKS;

/** The product page as it was before templates: what a product with no template gets. */
export const LEGACY_BLOCKS: TemplateBlock[] = [
  { id: "title", type: "title" },
  { id: "price", type: "price", show_from_price: false },
  { id: "highlight", type: "highlight" },
  { id: "buy", type: "buy" },
];

/** Every standard block exactly once, whatever the stored layout says. */
export function withStandardBlocks(blocks: TemplateBlock[] | undefined | null): TemplateBlock[] {
  const out: TemplateBlock[] = [];
  const seen = new Set<string>();
  for (const b of blocks ?? []) {
    if (!b || typeof b !== "object") continue;
    if (isStandard(b.type)) {
      if (seen.has(b.type)) continue;
      seen.add(b.type);
      out.push({ ...b, id: b.type, enabled: true });
    } else if (b.type in CUSTOM_BLOCKS) {
      out.push(b);
    }
  }
  for (const t of Object.keys(STANDARD_BLOCKS) as StandardBlockType[]) {
    if (!seen.has(t)) out.push({ id: t, type: t });
  }
  return out;
}

export function blockVisible(b: TemplateBlock, ctx: TokenContext): boolean {
  if (isStandard(b.type)) return true;
  if (b.enabled === false) return false;
  if (b.show_if_metafield) return Boolean((ctx.metafields[b.show_if_metafield] ?? "").trim());
  return true;
}

/** One custom block, with the product's data filled in. */
export function CustomBlockView({ block, ctx }: { block: TemplateBlock; ctx: TokenContext }) {
  if (block.type === "announcement") {
    const text = resolveTokens(block.text, ctx).trim();
    if (!text) return null;
    return (
      <div style={{
        background: block.bg_color || "var(--brand-primary, #1C3557)", color: block.text_color || "#fff",
        padding: "10px 14px", marginBottom: "18px", fontSize: "13.5px", fontWeight: 600, lineHeight: 1.45,
        textAlign: block.align === "left" ? "left" : "center", borderRadius: "var(--brand-radius, 4px)",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {block.icon ? <span style={{ marginRight: "8px" }}>{block.icon}</span> : null}{text}
      </div>
    );
  }
  if (block.type === "text") {
    const heading = resolveTokens(block.heading, ctx).trim();
    const body = resolveTokens(block.body, ctx).trim();
    if (!heading && !body) return null;
    const style = block.style ?? "plain";
    const box: React.CSSProperties = style === "callout"
      ? { background: "#F6F6F4", border: "1px solid #E2E2DE", padding: "14px 16px", borderRadius: "var(--brand-radius, 4px)" }
      : {};
    return (
      <div style={{ ...box, marginBottom: "18px", fontFamily: "'DM Sans', sans-serif" }}>
        {heading && (
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A", marginBottom: body ? "4px" : 0 }}>
            {block.icon ? <span style={{ marginRight: "6px" }}>{block.icon}</span> : null}{heading}
          </div>
        )}
        {body && (
          <p style={{ fontSize: style === "muted" ? "12.5px" : "13.5px", color: style === "muted" ? "#8A8A8A" : "#4B4B4B", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
            {!heading && block.icon ? <span style={{ marginRight: "6px" }}>{block.icon}</span> : null}{body}
          </p>
        )}
      </div>
    );
  }
  if (block.type === "custom_code") {
    return (
      <div style={{ marginBottom: "18px" }}>
        <CustomCodeFrame
          html={resolveTokens(block.html, ctx, { html: true })}
          css={resolveTokens(block.css, ctx, { html: true })}
          js={resolveTokens(block.js, ctx, { html: true })}
        />
      </div>
    );
  }
  return null;
}
