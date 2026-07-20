"use client";

/**
 * MenuLinkField — smart link picker: choose a Product / Category / Page, or type
 * a Custom URL. Writes the resolved href string. Used in the Menus manager, the
 * Storefront hero CTA, and "view all" links.
 */
import { useState } from "react";
import type { Category } from "@/types/product.types";
import type { StorefrontPageRecord } from "@/services/pages.service";

export interface LinkPickerProduct { id: string; name: string; slug?: string }

type LinkType = "product" | "category" | "page" | "custom";

export function MenuLinkField({ href, onChange, products, categories, pages, compact }: {
  href: string;
  onChange: (href: string) => void;
  products: LinkPickerProduct[];
  categories: Category[];
  pages: StorefrontPageRecord[];
  compact?: boolean;
}) {
  const inferType = (): LinkType => {
    if (href?.startsWith("/products/")) return "product";
    if (href?.startsWith("/products?category=")) return "category";
    if (pages.some((p) => `/${p.slug}` === href) || href === "/" || href === "/products") return "page";
    return "custom";
  };
  const [type, setType] = useState<LinkType>(inferType());

  const box: React.CSSProperties = { border: "1px solid #E2E0DA", borderRadius: "8px", padding: compact ? "7px 10px" : "10px 12px", fontSize: compact ? "13px" : "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
  const productSlug = href?.startsWith("/products/") ? href.slice(10) : "";
  const catSlug = href?.startsWith("/products?category=") ? href.slice(19) : "";
  const pageVal = (pages.some((p) => `/${p.slug}` === href) || href === "/" || href === "/products") ? href : "";

  return (
    <div style={{ display: "flex", gap: "6px", flex: 1, flexWrap: "wrap" }}>
      <select value={type} onChange={(e) => setType(e.target.value as LinkType)} style={{ ...box, flex: "0 0 118px" }}>
        <option value="product">Product</option>
        <option value="category">Category</option>
        <option value="page">Page</option>
        <option value="custom">Custom URL</option>
      </select>
      {type === "product" && (
        <select value={productSlug} onChange={(e) => onChange(e.target.value ? `/products/${e.target.value}` : "")} style={{ ...box, flex: 1, minWidth: "150px" }}>
          <option value="">— select a product —</option>
          {products.filter((p) => p.slug).map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </select>
      )}
      {type === "category" && (
        <select value={catSlug} onChange={(e) => onChange(e.target.value ? `/products?category=${e.target.value}` : "")} style={{ ...box, flex: 1, minWidth: "150px" }}>
          <option value="">— select a category —</option>
          {categories.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      )}
      {type === "page" && (
        <select value={pageVal} onChange={(e) => onChange(e.target.value)} style={{ ...box, flex: 1, minWidth: "150px" }}>
          <option value="">— select a page —</option>
          <option value="/">Home</option>
          <option value="/products">Shop All</option>
          {pages.map((p) => <option key={p.id} value={`/${p.slug}`}>{p.title}</option>)}
        </select>
      )}
      {type === "custom" && (
        <input value={href} onChange={(e) => onChange(e.target.value)} placeholder="https://… or /any-path" style={{ ...box, flex: 1, minWidth: "150px" }} />
      )}
    </div>
  );
}
