"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import type { Category, ProductListItem } from "@/types/product.types";
import { SearchIcon, ShirtIcon } from "@/components/ui/icons";

interface ProductListClientProps {
  initialProducts: ProductListItem[];
  total: number;
  currentPage: number;
  pages: number;
  categories: Category[];
  sizes: string[];
  colors: string[];
}

// Color name → hex for swatch dots
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

function swatchColor(name: string): string {
  return COLOR_MAP[name] ?? "#ccc";
}

export function ProductListClient({
  initialProducts,
  total,
  currentPage,
  pages,
  categories,
  sizes,
  colors,
}: ProductListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  // URL param values — declared before effects so they can be used as deps
  const currentCategory = searchParams.get("category") ?? "";
  const currentSize = searchParams.get("size") ?? "";
  const currentColor = searchParams.get("color") ?? "";
  const currentGender = searchParams.get("gender") ?? "";
  const currentInStock = searchParams.get("in_stock") ?? "";
  const currentPriceMin = searchParams.get("price_min") ?? "";
  const currentPriceMax = searchParams.get("price_max") ?? "";
  const currentProductCode = searchParams.get("product_code") ?? "";
  const currentQ = searchParams.get("q") ?? "";

  // Client-side product state — initialized from SSR data (guest prices),
  // re-fetched with auth token on every navigation so wholesale prices appear.
  const [products, setProducts] = useState<ProductListItem[]>(initialProducts);

  // Sync SSR products into state on every client-side navigation.
  // initialProducts is a new array reference each time the server re-renders
  // (i.e. whenever the URL changes), so this effect fires on every navigation.
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch with auth token for wholesale prices.
  // Includes all filter params as deps so it re-runs on every navigation.
  // Cancellation flag prevents stale responses from overwriting newer results.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const params: Record<string, string> = {};
    if (currentCategory) params.category = currentCategory;
    if (currentSize) params.size = currentSize;
    if (currentColor) params.color = currentColor;
    if (currentGender) params.gender = currentGender;
    if (currentInStock) params.in_stock = currentInStock;
    if (currentPriceMin) params.price_min = currentPriceMin;
    if (currentPriceMax) params.price_max = currentPriceMax;
    if (currentProductCode) params.product_code = currentProductCode;
    if (currentQ) params.q = currentQ;
    const qs = new URLSearchParams({ ...params, page_size: "24" }).toString();
    apiClient.get<{ items: ProductListItem[] }>(`/api/v1/products?${qs}`)
      .then((res) => { if (!cancelled && res?.items?.length) setProducts(res.items); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [isAuthenticated, currentCategory, currentSize, currentColor, currentGender, currentInStock, currentPriceMin, currentPriceMax, currentProductCode, currentQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter drawer state (mobile)
  const [filterOpen, setFilterOpen] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState("featured");

  // Bulk download state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  // Local slider/input state — applied on "Apply" click
  const [localPriceMin, setLocalPriceMin] = useState(Number(currentPriceMin) || 0);
  const [localPriceMax, setLocalPriceMax] = useState(Number(currentPriceMax) || 500);
  const [localMinStock, setLocalMinStock] = useState(0);
  const [localCode, setLocalCode] = useState(currentProductCode);

  function buildFilterUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `/products?${params.toString()}`;
  }

  function buildPageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    return `/products?${params.toString()}`;
  }

  function handleCategoryClick(slug: string) {
    const next = currentCategory === slug ? null : slug;
    router.push(buildFilterUrl({ category: next }));
    setFilterOpen(false);
  }

  function handleSizeClick(size: string) {
    const next = currentSize === size ? null : size;
    router.push(buildFilterUrl({ size: next }));
    setFilterOpen(false);
  }

  function handleColorClick(color: string) {
    const next = currentColor === color ? null : color;
    router.push(buildFilterUrl({ color: next }));
    setFilterOpen(false);
  }

  function handleClearAll() {
    setLocalPriceMin(0);
    setLocalPriceMax(500);
    setLocalMinStock(0);
    setLocalCode("");
    router.push("/products");
    setFilterOpen(false);
  }

  function applyPriceFilter() {
    router.push(buildFilterUrl({
      price_min: localPriceMin > 0 ? String(localPriceMin) : null,
      price_max: localPriceMax < 500 ? String(localPriceMax) : null,
    }));
    setFilterOpen(false);
  }

  function applyCodeFilter() {
    router.push(buildFilterUrl({ product_code: localCode.trim() || null }));
    setFilterOpen(false);
  }

  function handleGenderClick(gender: string) {
    const next = currentGender === gender ? null : gender;
    router.push(buildFilterUrl({ gender: next }));
    setFilterOpen(false);
  }

  function handleInStockClick() {
    const next = currentInStock === "true" ? null : "true";
    router.push(buildFilterUrl({ in_stock: next }));
    setFilterOpen(false);
  }


  const hasFilters = currentCategory || currentSize || currentColor || currentGender || currentInStock || currentPriceMin || currentPriceMax || currentProductCode;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDownload() {
    if (selected.size === 0) return;
    setBulkDownloading(true);
    setBulkMessage(null);
    try {
      const res: any = await apiClient.post("/api/v1/products/bulk-download", {
        product_ids: Array.from(selected),
      });
      const taskId = res.data?.task_id;
      setBulkMessage(`ZIP generation queued (task: ${taskId?.slice(0, 8)}…). Check back in a moment.`);
    } catch {
      setBulkMessage("Failed to queue bulk download.");
    } finally {
      setBulkDownloading(false);
    }
  }

  // Sidebar content (shared by desktop & mobile drawer)
  const filterHeaderStyle: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#1A1A1A",
    marginBottom: "12px",
  };
  const filterGroupStyle: React.CSSProperties = { marginBottom: "28px" };

  const sidebarContent = (
    <div>
      {/* Gender */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Gender</h4>
        {[
          { label: "Men's", value: "mens" },
          { label: "Women's", value: "womens" },
          { label: "Youth", value: "youth" },
          { label: "Unisex", value: "unisex" },
        ].map(g => (
          <label key={g.value} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1A1A1A", marginBottom: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            <input
              type="checkbox"
              checked={currentGender === g.value}
              onChange={() => handleGenderClick(g.value)}
              style={{ accentColor: "#1C3557", cursor: "pointer" }}
            />
            {g.label}
          </label>
        ))}
      </div>

      {/* Availability */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Availability</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1A1A1A", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          <input
            type="checkbox"
            checked={currentInStock === "true"}
            onChange={handleInStockClick}
            style={{ accentColor: "#1C3557", cursor: "pointer" }}
          />
          In Stock Only
        </label>
      </div>

      {/* Category */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Category</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1A1A1A", marginBottom: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          <input
            type="checkbox"
            checked={currentCategory === ""}
            onChange={() => handleCategoryClick("")}
            style={{ accentColor: "#1C3557", cursor: "pointer" }}
          />
          All Products
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif" }}>{total}</span>
        </label>
        {categories.map((cat) => (
          <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1A1A1A", marginBottom: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            <input
              type="checkbox"
              checked={currentCategory === cat.slug}
              onChange={() => handleCategoryClick(cat.slug)}
              style={{ accentColor: "#1C3557", cursor: "pointer" }}
            />
            {cat.name}
          </label>
        ))}
      </div>

      {/* Color swatches */}
      {colors.length > 0 && (
        <div style={filterGroupStyle}>
          <h4 style={filterHeaderStyle}>Color</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {colors.map((color) => {
              const hex = swatchColor(color);
              const isSelected = currentColor === color;
              return (
                <button
                  key={color}
                  onClick={() => handleColorClick(color)}
                  title={color}
                  style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    background: hex,
                    border: "1px solid #E2E2DE",
                    cursor: "pointer",
                    outline: isSelected ? "2px solid #1C3557" : "none",
                    outlineOffset: "2px",
                    flexShrink: 0,
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Size chips */}
      {sizes.length > 0 && (
        <div style={filterGroupStyle}>
          <h4 style={filterHeaderStyle}>Size</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {sizes.map((size) => {
              const sel = currentSize === size;
              return (
                <button
                  key={size}
                  onClick={() => handleSizeClick(size)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 0,
                    fontSize: "12px",
                    fontFamily: "'DM Sans', sans-serif",
                    border: `1px solid ${sel ? "#1C3557" : "#E2E2DE"}`,
                    background: sel ? "#1C3557" : "#FFFFFF",
                    color: sel ? "#FFFFFF" : "#1A1A1A",
                    cursor: "pointer",
                    transition: "all .12s",
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Price Range</h4>
        <input
          type="range"
          min={0} max={500} step={5}
          value={localPriceMax}
          onChange={e => setLocalPriceMax(Math.max(Number(e.target.value), localPriceMin + 5))}
          style={{ width: "100%", accentColor: "#1C3557", marginBottom: "10px" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input
            type="text"
            value={localPriceMin}
            onChange={e => setLocalPriceMin(Number(e.target.value.replace(/\D/g, "")) || 0)}
            style={{ width: "70px", border: "1px solid #E2E2DE", padding: "6px 8px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
          />
          <span style={{ fontSize: "12px", color: "#6B6B6B" }}>–</span>
          <input
            type="text"
            value={localPriceMax}
            onChange={e => setLocalPriceMax(Number(e.target.value.replace(/\D/g, "")) || 0)}
            style={{ width: "70px", border: "1px solid #E2E2DE", padding: "6px 8px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
          />
          <button
            onClick={applyPriceFilter}
            style={{ background: "#1C3557", color: "#fff", border: "none", padding: "7px 14px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Min. Inventory */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Min. Inventory</h4>
        <input
          type="range"
          min={0} max={200} step={10}
          value={localMinStock}
          onChange={e => setLocalMinStock(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#1C3557" }}
        />
        <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "6px", fontFamily: "'DM Sans', sans-serif" }}>
          ≥ {localMinStock} units per product
        </div>
      </div>

      {/* Product Code */}
      <div style={filterGroupStyle}>
        <h4 style={filterHeaderStyle}>Product Code</h4>
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            type="text"
            placeholder="e.g. G5000"
            value={localCode}
            onChange={e => setLocalCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyCodeFilter()}
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E2E2DE", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", color: "#1A1A1A", outline: "none" }}
          />
          <button
            onClick={applyCodeFilter}
            style={{ padding: "7px 14px", background: "#1C3557", color: "#fff", border: "none", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >
            Go
          </button>
        </div>
        {currentProductCode && (
          <button
            onClick={() => { setLocalCode(""); router.push(buildFilterUrl({ product_code: null })); }}
            style={{ marginTop: "6px", fontSize: "11px", color: "#6B6B6B", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}
          >
            ✕ Clear code
          </button>
        )}
      </div>

      {hasFilters && (
        <button
          onClick={handleClearAll}
          style={{ fontSize: "12px", color: "#1C3557", fontWeight: 500, cursor: "pointer", padding: "5px 0", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  const filteredByStock = localMinStock > 0
    ? products.filter(p => {
      const total = (p.variants ?? []).reduce((sum: number, v: any) => sum + (v.stock_quantity ?? 100), 0);
      return total >= localMinStock;
    })
    : products;

  const displayedProducts = [...filteredByStock].sort((a, b) => {
    if (sortBy === "price_asc") {
      const aPrice = (a.variants?.[0] as any)?.retail_price ?? 0;
      const bPrice = (b.variants?.[0] as any)?.retail_price ?? 0;
      return aPrice - bPrice;
    }
    if (sortBy === "price_desc") {
      const aPrice = (a.variants?.[0] as any)?.retail_price ?? 0;
      const bPrice = (b.variants?.[0] as any)?.retail_price ?? 0;
      return bPrice - aPrice;
    }
    if (sortBy === "name_asc") return a.name.localeCompare(b.name);
    if (sortBy === "name_desc") return b.name.localeCompare(a.name);
    return 0; // featured — keep server order
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-start", minHeight: "600px", maxWidth: "1500px", margin: "0 auto"}}>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:block"
        style={{ width: "300px", flexShrink: 0, borderRight: "1px solid #E2E2DE", padding: "28px 20px 28px 20px", position: "sticky", top: "72px", maxHeight: "calc(100vh - 72px)", overflowY: "auto", background: "#f8f8f6" }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile filter drawer overlay ── */}
      {filterOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 499 }}
            onClick={() => setFilterOpen(false)}
          />
          {/* Drawer */}
          <div style={{ position: "fixed", left: 0, top: 0, height: "100vh", width: "300px", background: "#fff", zIndex: 500, overflowY: "auto", padding: "24px" }}>
            <button
              onClick={() => setFilterOpen(false)}
              style={{ position: "absolute", top: "16px", right: "16px", fontSize: "24px", background: "none", border: "none", cursor: "pointer", color: "#1A1A1A", lineHeight: 1, padding: "4px" }}
              aria-label="Close filters"
            >
              ×
            </button>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1A1A1A", marginBottom: "24px", marginTop: "4px" }}>Filters</h4>
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <div className="prod-content-pad" style={{ flex: 1, padding: "24px 28px", minWidth: 0 }}>

        {/* Top bar: filter button + count + bulk download */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Mobile filter button */}
            <button
              onClick={() => setFilterOpen(true)}
              className="lg:hidden"
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", fontWeight: 600, color: "#2A2830", background: "#fff", cursor: "pointer" }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M11 20h2" />
              </svg>
              Filters {hasFilters && "•"}
            </button>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#7A7880" }}>
              {total} Product{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Bulk download toolbar */}
          {selected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#7A7880" }}>{selected.size} selected</span>
              <button
                onClick={handleBulkDownload}
                disabled={bulkDownloading}
                style={{ padding: "7px 16px", background: "#1A5CFF", color: "#fff", borderRadius: "5px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", opacity: bulkDownloading ? 0.5 : 1 }}
              >
                {bulkDownloading ? "Queuing…" : "Bulk Download"}
              </button>
              <button onClick={() => setSelected(new Set())} style={{ fontSize: "12px", color: "#7A7880", background: "none", border: "none", cursor: "pointer" }}>
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Sort bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #E2E2DE", padding: "8px 0 12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", whiteSpace: "nowrap" }}>Sort:</span>
          {[
            { label: "Featured", value: "featured" },
            { label: "Price: Low–High", value: "price_asc" },
            { label: "Price: High–Low", value: "price_desc" },
            { label: "New Arrivals", value: "new_arrivals" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "13px",
                color: sortBy === opt.value ? "#1C3557" : "#6B6B6B",
                fontWeight: sortBy === opt.value ? 600 : 400,
                padding: "2px 4px",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {bulkMessage && (
          <div style={{ marginBottom: "16px", background: "rgba(28,53,87,.06)", border: "1px solid rgba(28,53,87,.2)", padding: "12px 16px", fontSize: "13px", color: "#1C3557", fontFamily: "'DM Sans', sans-serif" }}>
            {bulkMessage}
          </div>
        )}

        {/* Active filter pills */}
        {hasFilters && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}>
            {currentCategory && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                {categories.find(c => c.slug === currentCategory)?.name ?? currentCategory}
                <button onClick={() => router.push(buildFilterUrl({ category: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {currentColor && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                {currentColor}
                <button onClick={() => router.push(buildFilterUrl({ color: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {currentSize && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                Size: {currentSize}
                <button onClick={() => router.push(buildFilterUrl({ size: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {currentGender && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                {currentGender}
                <button onClick={() => router.push(buildFilterUrl({ gender: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {currentInStock === "true" && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                In Stock
                <button onClick={() => router.push(buildFilterUrl({ in_stock: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {(currentPriceMin || currentPriceMax) && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                ${currentPriceMin || 0}–${currentPriceMax || 500}
                <button onClick={() => router.push(buildFilterUrl({ price_min: null, price_max: null }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {currentProductCode && (
              <span style={{ background: "#e8edf3", border: "1px solid #c5d0dc", fontSize: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", color: "#1C3557" }}>
                Code: {currentProductCode}
                <button onClick={() => { setLocalCode(""); router.push(buildFilterUrl({ product_code: null })); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1C3557", lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            <button
              onClick={handleClearAll}
              style={{ fontSize: "12px", color: "#1C3557", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >
              Clear All
            </button>
          </div>
        )}

        {/* Product grid */}
        {displayedProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#7A7880" }}>
            <SearchIcon size={40} color="#7A7880" style={{ opacity: 0.4, marginBottom: "12px" }} />
            <p style={{ fontFamily: "var(--font-bebas)", fontSize: "20px", letterSpacing: ".04em", marginBottom: "6px", color: "#2A2830" }}>No Products Found</p>
            <p style={{ fontSize: "14px" }}>Try adjusting your filters or search term.</p>
            {hasFilters && (
              <button onClick={handleClearAll} style={{ marginTop: "16px", padding: "8px 20px", background: "#E8242A", color: "#fff", borderRadius: "5px", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer" }}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }} className="prod-grid-responsive">
            {displayedProducts.map((product) => {
              const primaryImage = product.primary_image;
              const primaryVariant = product.variants?.[0];
              const price = primaryVariant?.effective_price ?? primaryVariant?.retail_price;
              const variantColors = [...new Set(product.variants?.map(v => v.color).filter(Boolean) as string[])];
              const extraColors = variantColors.length > 5 ? variantColors.length - 5 : 0;

              return (
                <div key={product.id} style={{ position: "relative" }}>
                  {/* Bulk select checkbox */}
                  {/* <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", top: "12px", left: "12px", zIndex: 10, width: "16px", height: "16px", cursor: "pointer" }}
                  /> */}

                  <Link
                    href={`/products/${product.slug}`}
                    style={{ display: "block", background: "#FFFFFF", border: "1px solid #E2E2DE", overflow: "hidden", textDecoration: "none", transition: "border-color .2s" }}
                    className="prod-card-hover"
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1C3557"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#E2E2DE"; }}
                  >
                    {/* Image area */}
                    <div style={{ background: "#ffffff", height: "220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6B6B6B", fontSize: "12px", position: "relative" }}>
                      {primaryImage ? (
                        <Image
                          src={primaryImage.url_medium_webp ?? primaryImage.url_medium}
                          alt={primaryImage.alt_text ?? product.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 33vw"
                          style={{ objectFit: "contain" }}
                        />
                      ) : (
                        <>
                          <ShirtIcon size={44} color="#bbb" style={{ opacity: 0.3, marginBottom: "6px" }} />
                        </>
                      )}
                    </div>

                    {/* Body */}
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, color: "#1A1A1A", marginBottom: "4px", lineHeight: 1.3 }}>
                        {product.name}
                      </div>
                      {((product as any).product_code || (product as any).code) && (
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#6B6B6B", marginTop: "3px" }}>
                          {(product as any).product_code || (product as any).code}
                        </div>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ marginTop: "40px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {currentPage > 1 && (
              <button
                onClick={() => router.push(buildPageUrl(currentPage - 1))}
                style={{ padding: "9px 18px", fontSize: "13px", border: "1.5px solid #E2E0DA", borderRadius: "6px", background: "#fff", color: "#2A2830", cursor: "pointer", fontWeight: 600 }}
              >
                ← Previous
              </button>
            )}
            <span style={{ fontSize: "13px", color: "#7A7880", fontWeight: 600 }}>
              Page {currentPage} of {pages}
            </span>
            {currentPage < pages && (
              <button
                onClick={() => router.push(buildPageUrl(currentPage + 1))}
                style={{ padding: "9px 18px", fontSize: "13px", border: "1.5px solid #E2E0DA", borderRadius: "6px", background: "#fff", color: "#2A2830", cursor: "pointer", fontWeight: 600 }}
              >
                Next →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
