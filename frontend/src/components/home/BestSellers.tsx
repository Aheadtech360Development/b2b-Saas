"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { productsService } from "@/services/products.service";

interface ProductVariant {
  color?: string | null;
  retail_price?: number | string;
  effective_price?: number | string;
}

interface ProductImageOut {
  url_thumbnail: string;
  url_medium: string;
  url_medium_webp?: string | null;
  alt_text?: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  slug: string;
  base_price?: number;
  primary_image?: ProductImageOut | string | null;
  moq?: number;
  categories?: { name: string }[];
  variants?: ProductVariant[];
  fabric?: string | null;
  product_code?: string | null;
  weight?: string | null;
}

const COLOR_MAP: Record<string, string> = {
  White: "#FFFFFF", Black: "#111111", Navy: "#1e3a5f", Red: "#E8242A",
  Blue: "#1A5CFF", Royal: "#2251CC", "Royal Blue": "#2251CC",
  Grey: "#9ca3af", Gray: "#9ca3af", "Dark Grey": "#4b5563", "Dark Gray": "#4b5563",
  "Light Grey": "#d1d5db", "Light Gray": "#d1d5db", Charcoal: "#374151",
  "Sport Grey": "#9ca3af", "Heather Grey": "#b0b7c3", "Athletic Heather": "#b0b7c3",
  Heather: "#b0b7c3", "Dark Heather": "#6b7280", Sand: "#c6a67f", Natural: "#f5f0e8",
  Tan: "#c9a96e", Brown: "#78350f", Maroon: "#7f1d1d", Burgundy: "#881337",
  Green: "#166534", Forest: "#1B4332", "Forest Green": "#14532d", "Kelly Green": "#15803d",
  Lime: "#65a30d", Yellow: "#eab308", Gold: "#f69d0b", Mustard: "#D4A843",
  Orange: "#ea580c", Purple: "#7c3aed", Pink: "#ffcfce", "Hot Pink": "#db2777",
  Coral: "#f87171", Teal: "#0cafcc", Turquoise: "#06b6d4", Mint: "#6ee7b7",
  Olive: "#4d7c0f", Cream: "#fef3c7", Ivory: "#fffff0", "Sky Blue": "#38bdf8",
  Lavender: "#a78bfa", "Light Blue": "#7DD3FC", "Stonewash Blue": "#5b8fa8",
  "Dark Navy": "#0f1f3d", Indigo: "#3730a3", Cardinal: "#7b1520", Crimson: "#9f0712",
  "Carolina Blue": "#56a0d3", "Columbia Blue": "#9bc4e2", Silver: "#c0c0c0",
  "Ash Grey": "#b2b2b2", Ash: "#b2b2b2", Stone: "#a8a29e", Mocha: "#7c5c48",
  Chocolate: "#5c3d2e", Caramel: "#b5651d", Camo: "#78866b", "Oatmeal Heather": "#D6CFC7",
  "Sports Grey": "#C4C4C4",
  "Charcoal Heather": "#4A4A4A",
  "Texas Orange": "#BF5700",
  "Baby Pink": "#F4C2C2",
  "Moss Green": "#305040",
  "Lime Green": "#32CD32",
  "Rust": "#B7410E",
  "Peach": "#FFDAB9",
  "Pacific Blue": "#1CA9C9",
  "Dust": "#ebdcc8",
  "Military Green": "#4B5320",
  "Neon Yellow": "#FFFF33",
  "Neon Orange": "#FF5F1F",
  "Denim": "#1560BD",
  "Salt & Pepper": "#8E8E8E",
  "Powder Blue": "#B0E0E6",
  "Pure Navy": "#373f53",
  "Sawana Brown": "#7d6c5b",
  "Decadent Chocolate": "#723638",
};
const swatchColor = (name: string) => COLOR_MAP[name] ?? "#ccc";

const FALLBACK: ProductItem[] = [
  { id: "1", name: "Classic White T-Shirt", slug: "classic-white-t-shirt", base_price: 8.99, categories: [{ name: "T-Shirts" }] },
  { id: "2", name: "Business Polo Shirt", slug: "business-polo-shirt", base_price: 28.00, categories: [{ name: "Polo Shirts" }] },
  { id: "3", name: "Sport Hoodie", slug: "sport-hoodie", base_price: 32.00, categories: [{ name: "Hoodies" }] },
  { id: "4", name: "Casual Denim Jacket", slug: "casual-denim-jacket", base_price: 65.00, categories: [{ name: "Jackets" }] },
];

const BADGES: Record<number, { label: string; bg: string }> = {
  0: { label: "BEST SELLER", bg: "#E8242A" },
  1: { label: "POPULAR", bg: "#1A5CFF" },
};

export function BestSellers() {
  const [products, setProducts] = useState<ProductItem[]>([]);

  useEffect(() => {
    productsService
      .listProducts({ page_size: 4 })
      .then(res => {
        const items = (res?.items ?? []) as ProductItem[];
        setProducts(items.length > 0 ? items : FALLBACK);
      })
      .catch(() => setProducts(FALLBACK));
  }, []);

  return (
    <section style={{ padding: "80px 0", background: "#fff" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 32px" }}>

        {/* Section header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px" }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "clamp(32px,3.5vw,48px)", color: "#2A2830", letterSpacing: ".01em", lineHeight: 1, marginBottom: "8px" }}>
              Best Sellers
            </h2>
            <p style={{ fontSize: "15px", color: "#7A7880", margin: 0, fontWeight: 500 }}>
              Most ordered styles by our wholesale customers
            </p>
          </div>
          <Link href="/products" style={{ fontSize: "15px", fontWeight: 700, color: "#1A5CFF", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
            View All Products →
          </Link>
        </div>

        {/* Grid — same 4-col as collection page */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }} className="best-sellers-grid">
          {products.map((product, i) => {
            const primaryImage = product.primary_image;
            const imgSrc = typeof primaryImage === "string"
              ? primaryImage
              : (primaryImage as ProductImageOut | null)?.url_medium_webp
                ?? (primaryImage as ProductImageOut | null)?.url_medium
                ?? null;
            const imgAlt = (primaryImage as ProductImageOut | null)?.alt_text ?? product.name;
            const variantColors = [...new Set((product.variants ?? []).map(v => v.color).filter(Boolean) as string[])];
            const extraColors = variantColors.length > 5 ? variantColors.length - 5 : 0;
            const primaryVariant = product.variants?.[0];
            const price = primaryVariant?.effective_price ?? primaryVariant?.retail_price ?? product.base_price;

            return (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                style={{ display: "block", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden", textDecoration: "none", transition: "all .25s" }}
                className="prod-card-hover"
              >
                {/* Image area — matches collection card */}
                <div style={{ background: "white", height: "360px", position: "relative", overflow: "hidden" }}>
                  {imgSrc ? (
                    <Image
                      src={imgSrc}
                      alt={imgAlt}
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#2A2830" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg>
                    </div>
                  )}
                  {/* Badge */}
                  {BADGES[i] && (
                    <div style={{ position: "absolute", top: "12px", left: "12px", background: BADGES[i]!.bg, color: "#fff", fontFamily: "var(--font-bebas)", fontSize: "11px", letterSpacing: ".08em", padding: "4px 10px", borderRadius: "4px", zIndex: 1 }}>
                      {BADGES[i]!.label}
                    </div>
                  )}
                  {/* In Stock badge */}
                  <div style={{ position: "absolute", top: "12px", right: "12px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#059669", zIndex: 1 }}>
                    <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3.5" fill="#059669"/></svg> In Stock
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: "14px 16px" }}>
                  {/* Category/fabric label */}
                  <div style={{ fontSize: "11px", color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "4px", fontWeight: 600 }}>
                    {[product.fabric, product.product_code, product.weight].filter(Boolean).join(" · ") || product.categories?.[0]?.name || "Apparel"}
                  </div>

                  {/* Product name */}
                  <div style={{ fontFamily: "var(--font-bebas)", fontSize: "17px", letterSpacing: ".02em", marginBottom: "10px", color: "#2A2830", lineHeight: 1.2 }}>
                    {product.name}
                  </div>

                  {/* Color swatches */}
                  {variantColors.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                      {variantColors.slice(0, 5).map((c) => (
                        <div
                          key={c}
                          title={c}
                          style={{
                            width: "14px", height: "14px", borderRadius: "50%",
                            background: swatchColor(c),
                            border: "1.5px solid rgba(0,0,0,.12)",
                            flexShrink: 0,
                          }}
                        />
                      ))}
                      {extraColors > 0 && (
                        <span style={{ fontSize: "11px", color: "#7A7880", fontWeight: 600 }}>+{extraColors}</span>
                      )}
                    </div>
                  )}

                  {/* Price */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {price ? (
                      <div style={{ fontSize: "13px", color: "#2A2830", fontWeight: 700, lineHeight: 1 }}>
                        From ${Number(price).toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
