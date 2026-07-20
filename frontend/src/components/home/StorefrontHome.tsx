"use client";

/**
 * StorefrontHome — the customer-facing homepage, fully driven by the brand's
 * storefront config (BrandingProvider). Sections render in the brand's chosen
 * order and can be toggled on/off from the admin Storefront editor.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useBranding, type SectionKey } from "@/components/providers/BrandingProvider";
import { productsService } from "@/services/products.service";
import SectionRenderer from "@/components/storefront/SectionRenderer";
import type { Category, ProductListItem } from "@/types/product.types";

export default function StorefrontHome() {
  const b = useBranding();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);

  useEffect(() => {
    productsService.getCategories().then((c) => setCategories(c || [])).catch(() => {});
    productsService.listProducts({ page_size: 100 }).then((r) => setProducts(r.items || [])).catch(() => {});
  }, []);

  const fixed: Record<SectionKey, React.ReactNode> = {
    hero: b.show_hero ? <HeroSection key="hero" /> : null,
    featured_categories: b.show_featured_categories ? <FeaturedCategories key="cats" categories={categories} /> : null,
    featured_products: b.show_featured_products ? <FeaturedProducts key="prods" products={products} /> : null,
  };
  const FIXED_KEYS: SectionKey[] = ["hero", "featured_categories", "featured_products"];

  const homeSections = b.home_sections ?? [];
  const addonById = new Map(homeSections.filter((s) => s.id).map((s) => [s.id as string, s]));

  // Build the full ordered list: use section_order, then append any fixed keys
  // or addons not yet listed (new addons render at the end initially).
  const order = b.section_order?.length ? [...b.section_order] : [...FIXED_KEYS];
  const seen = new Set(order);
  FIXED_KEYS.forEach((k) => { if (!seen.has(k)) order.push(k); });
  homeSections.forEach((s) => { if (s.id && !seen.has(`addon:${s.id}`)) order.push(`addon:${s.id}`); });

  return (
    <main style={{ fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)" }}>
      {order.map((key) => {
        if (key.startsWith("addon:")) {
          const s = addonById.get(key.slice(6));
          return s ? <SectionRenderer key={key} sections={[s]} /> : null;
        }
        return <div key={key}>{fixed[key as SectionKey]}</div>;
      })}
    </main>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function HeroSection() {
  const b = useBranding();
  const heading = b.hero_heading || "Quality Wholesale Products, Direct to Your Business";
  const sub = b.hero_subheading || b.tagline || "Competitive pricing and fast fulfillment.";
  return (
    <section style={{ background: b.hero_bg_color || "#F8F8F6" }}>
      <div className="hero-inner-grid" style={{ maxWidth: "1500px", margin: "0 auto", display: "grid", gridTemplateColumns: b.hero_image_url ? "1fr 1fr" : "1fr", gap: "48px", alignItems: "center", padding: "72px 24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontWeight: 600, fontSize: "46px", color: b.hero_text_color || "#1A1A1A", lineHeight: 1.1, marginBottom: "18px", letterSpacing: "-0.01em" }}>
            {heading}
          </h1>
          <p style={{ fontSize: "18px", color: b.hero_text_color ? `${b.hero_text_color}cc` : "#6B6B6B", lineHeight: 1.6, marginBottom: "28px", maxWidth: "520px" }}>
            {sub}
          </p>
          <Link href={b.hero_cta_link || "/products"} style={{ display: "inline-block", background: b.primary_color, color: "#fff", padding: "14px 28px", fontSize: "15px", fontWeight: 600, textDecoration: "none", borderRadius: "var(--brand-btn-radius, 4px)" }}>
            {b.hero_cta_text || "Shop Now"} →
          </Link>
        </div>
        {b.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.hero_image_url} alt={heading} style={{ width: "100%", height: "auto", maxHeight: "480px", objectFit: "cover", borderRadius: `${b.hero_image_radius ?? 4}px`, opacity: (b.hero_image_opacity ?? 100) / 100, display: "block" }} />
        )}
      </div>
    </section>
  );
}

// ── Featured Categories ────────────────────────────────────────────────────────
function FeaturedCategories({ categories }: { categories: Category[] }) {
  const b = useBranding();
  const limit = b.featured_categories_limit || 4;
  const tops = categories.filter((c) => !c.parent_id);
  let picked = tops;
  if (b.featured_category_ids?.length) {
    const map = new Map(categories.map((c) => [c.id, c]));
    picked = b.featured_category_ids.map((id) => map.get(id)).filter(Boolean) as Category[];
  }
  picked = picked.slice(0, limit);
  if (picked.length === 0) return null;
  return (
    <section style={{ padding: "var(--brand-section-py, 64px) 24px", background: "#fff", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
          <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "32px", fontWeight: 600, color: "#1A1A1A" }}>
            {b.featured_categories_heading || "Shop by Category"}
          </h2>
          {b.featured_categories_view_all_text && (
            <Link href={b.featured_categories_view_all_link || "/products"} style={{ fontSize: "14px", color: b.primary_color, fontWeight: 700, textDecoration: "none" }}>{b.featured_categories_view_all_text} →</Link>
          )}
        </div>
        <div className="storefront-featured-grid">
          {picked.map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px", background: "var(--brand-card-bg, #F8F8F6)", border: "var(--brand-card-border, 1px solid #E2E2DE)", borderRadius: "var(--brand-card-radius, 6px)", boxShadow: "var(--brand-card-shadow, none)", textDecoration: "none", color: "#1A1A1A", fontWeight: 600, fontSize: "16px", textAlign: "center", transition: "all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = b.primary_color; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--brand-card-bg, #F8F8F6)"; e.currentTarget.style.color = "#1A1A1A"; }}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Featured Products ──────────────────────────────────────────────────────────
function FeaturedProducts({ products }: { products: ProductListItem[] }) {
  const b = useBranding();
  const limit = b.featured_products_limit || 4;
  let items = products;
  if (b.featured_product_ids?.length) {
    const map = new Map(products.map((p) => [p.id, p]));
    items = b.featured_product_ids.map((id) => map.get(id)).filter(Boolean) as ProductListItem[];
  }
  items = items.slice(0, limit);
  if (items.length === 0) return null;
  return (
    <section style={{ padding: "var(--brand-section-py, 64px) 24px", background: "#FAFAF8", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
          <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "32px", fontWeight: 600, color: "#1A1A1A" }}>
            {b.featured_products_heading || "Featured Products"}
          </h2>
          {b.featured_products_view_all_text && (
            <Link href={b.featured_products_view_all_link || "/products"} style={{ fontSize: "14px", color: b.primary_color, fontWeight: 700, textDecoration: "none" }}>{b.featured_products_view_all_text} →</Link>
          )}
        </div>
        <div className="storefront-featured-grid">
          {items.map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} style={{ textDecoration: "none", color: "#1A1A1A", background: "var(--brand-card-bg, #fff)", border: "var(--brand-card-border, 1px solid #E2E2DE)", borderRadius: "var(--brand-card-radius, 6px)", overflow: "hidden", display: "block", transition: "box-shadow .2s", boxShadow: "var(--brand-card-shadow, none)" }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--brand-card-shadow, none)")}>
              <div style={{ aspectRatio: "1 / 1", background: "#F4F3EF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {p.primary_image?.url_medium ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.primary_image.url_medium} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#bbb", fontSize: "13px" }}>No image</span>
                )}
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.name}</div>
                {p.product_code && <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>{p.product_code}</div>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
