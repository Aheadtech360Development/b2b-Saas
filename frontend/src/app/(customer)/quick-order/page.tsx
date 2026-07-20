"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import { productsService } from "@/services/products.service";
import { cartService } from "@/services/cart.service";
import type { ProductListItem, ProductDetail, ProductVariant } from "@/types/product.types";

// ─── Size ordering ────────────────────────────────────────────────────────────
const SIZE_ORDER = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "ONE SIZE"];
function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ─── Color map ────────────────────────────────────────────────────────────────
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

function getColorHex(color: string): string {
  return COLOR_MAP[color] ?? "#888888";
}

function isLight(hex: string): boolean {
  return ["#FFFFFF", "#fffff0", "#fef3c7", "#f5f0e8", "#fef9c3", "#d1d5db", "#c6a67f", "#fef3c7"].includes(hex);
}

// ─── Row state ────────────────────────────────────────────────────────────────
interface QuickOrderRow {
  id: string;
  searchQuery: string;
  selectedProduct: ProductListItem | null;
  productDetail: ProductDetail | null;
  showDropdown: boolean;
  searchResults: ProductListItem[];
  expandedColors: string[];
  quantities: Record<string, Record<string, number>>; // color → size → qty
  isSearching: boolean;
  isLoadingDetail: boolean;
  checked: boolean;
}

function makeRow(): QuickOrderRow {
  return {
    id: Math.random().toString(36).slice(2),
    searchQuery: "",
    selectedProduct: null,
    productDetail: null,
    showDropdown: false,
    searchResults: [],
    expandedColors: [],
    quantities: {},
    isSearching: false,
    isLoadingDetail: false,
    checked: false,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function QuickOrderPage() {
  const [rows, setRows] = useState<QuickOrderRow[]>([makeRow(), makeRow(), makeRow()]);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartMsg, setCartMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Helpers ────────────────────────────────────────────────────────────
  function updateRow(id: string, updates: Partial<QuickOrderRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  function getRowColors(row: QuickOrderRow): string[] {
    if (!row.productDetail) return [];
    return Array.from(new Set(row.productDetail.variants.map((v) => v.color).filter(Boolean))) as string[];
  }

  function getSizesForColor(row: QuickOrderRow, color: string): string[] {
    if (!row.productDetail) return [];
    return sortSizes(
      Array.from(new Set(
        row.productDetail.variants
          .filter((v) => v.color === color && v.size)
          .map((v) => v.size!)
      ))
    );
  }

  function getVariantForColor(row: QuickOrderRow, color: string, size: string): ProductVariant | undefined {
    return row.productDetail?.variants.find((v) => v.color === color && v.size === size);
  }

  function getRowTotals(row: QuickOrderRow): { units: number; price: number } {
    let units = 0, price = 0;
    for (const color of Object.keys(row.quantities)) {
      for (const size of getSizesForColor(row, color)) {
        const qty = row.quantities[color]?.[size] ?? 0;
        if (qty > 0) {
          const v = getVariantForColor(row, color, size);
          units += qty;
          price += qty * parseFloat(v?.effective_price ?? v?.retail_price ?? "0");
        }
      }
    }
    return { units, price };
  }

  function toggleColor(rowId: string, color: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const expanded = r.expandedColors.includes(color)
        ? r.expandedColors.filter((c) => c !== color)
        : [...r.expandedColors, color];
      return { ...r, expandedColors: expanded };
    }));
  }

  // ── Search ─────────────────────────────────────────────────────────────
  function handleSearchChange(rowId: string, value: string) {
    updateRow(rowId, { searchQuery: value, selectedProduct: null, productDetail: null, expandedColors: [], quantities: {}, showDropdown: false });
    if (searchTimers.current[rowId]) clearTimeout(searchTimers.current[rowId]);
    if (value.length < 2) { updateRow(rowId, { searchResults: [] }); return; }
    updateRow(rowId, { isSearching: true });
    searchTimers.current[rowId] = setTimeout(async () => {
      try {
        const result = await productsService.listProducts({ q: value, page_size: 10 });
        setRows((prev) => prev.map((r) =>
          r.id === rowId ? { ...r, searchResults: result.items, showDropdown: true, isSearching: false } : r
        ));
      } catch {
        setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, searchResults: [], isSearching: false } : r));
      }
    }, 300);
  }

  async function handleSelectProduct(rowId: string, product: ProductListItem) {
    updateRow(rowId, { selectedProduct: product, searchQuery: product.name, showDropdown: false, searchResults: [], isLoadingDetail: true, expandedColors: [], quantities: {} });
    try {
      const detail = await productsService.getProductBySlug(product.slug);
      const colors = Array.from(new Set(detail.variants.map((v) => v.color).filter(Boolean))) as string[];
      setRows((prev) => prev.map((r) =>
        r.id === rowId ? { ...r, productDetail: detail, expandedColors: colors.slice(0, 1), isLoadingDetail: false } : r
      ));
    } catch {
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, isLoadingDetail: false } : r));
    }
  }

  function handleQtyChange(rowId: string, color: string, size: string, value: string) {
    const qty = parseInt(value, 10);
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const maxQty = r.productDetail?.variants.find((v) => v.color === color && v.size === size)?.stock_quantity;
      const clamped = isNaN(qty) || qty < 0 ? 0 : maxQty !== undefined ? Math.min(qty, maxQty) : qty;
      const colorQtys = { ...(r.quantities[color] ?? {}), [size]: clamped };
      return { ...r, quantities: { ...r.quantities, [color]: colorQtys } };
    }));
  }

  // ── Add to cart ─────────────────────────────────────────────────────────
  async function handleAddToCart() {
    const activeRows = rows.filter((r) => r.productDetail && getRowTotals(r).units > 0);
    if (activeRows.length === 0) {
      setCartMsg({ type: "error", text: "Enter quantities in at least one row before adding to cart." });
      setTimeout(() => setCartMsg(null), 4000);
      return;
    }
    setIsAddingToCart(true);
    setCartMsg(null);
    let added = 0, errors = 0;
    for (const row of activeRows) {
      const items = Object.keys(row.quantities).flatMap((color) =>
        getSizesForColor(row, color)
          .filter((size) => (row.quantities[color]?.[size] ?? 0) > 0)
          .flatMap((size) => {
            const v = getVariantForColor(row, color, size);
            const qty = row.quantities[color]?.[size];
            if (!v || !qty) return [];
            return [{ variant_id: v.id, quantity: qty }];
          })
      );
      if (items.length > 0) {
        try { await cartService.addMatrix(row.productDetail!.id, items); added++; }
        catch { errors++; }
      }
    }
    setIsAddingToCart(false);
    if (added > 0) {
      window.dispatchEvent(new Event("cart_updated"));
    }
    if (errors > 0) {
      setCartMsg({ type: "error", text: `${errors} product${errors !== 1 ? "s" : ""} failed to add.` });
    } else {
      setCartMsg({ type: "success", text: `${added} product${added !== 1 ? "s" : ""} added to cart.` });
    }
    setTimeout(() => setCartMsg(null), 5000);
  }

  // ── Row actions ─────────────────────────────────────────────────────────
  function deleteRow(id: string) {
    setRows((prev) => (prev.length === 1 ? [makeRow()] : prev.filter((r) => r.id !== id)));
  }

  function copyRow(id: string) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const src = prev[idx]!;
      const copy: QuickOrderRow = {
        ...src,
        id: Math.random().toString(36).slice(2),
        showDropdown: false,
        isSearching: false,
        isLoadingDetail: false,
        expandedColors: [...src.expandedColors],
        quantities: Object.fromEntries(Object.entries(src.quantities).map(([c, q]) => [c, { ...q }])),
        checked: false,
      };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }

  function deleteChecked() {
    setRows((prev) => { const r = prev.filter((r) => !r.checked); return r.length > 0 ? r : [makeRow()]; });
  }

  const checkedCount = rows.filter((r) => r.checked).length;
  const grandTotals = rows.reduce((acc, r) => {
    const t = getRowTotals(r);
    return { units: acc.units + t.units, price: acc.price + t.price };
  }, { units: 0, price: 0 });

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{ minHeight: "100vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}
      onClick={() => setRows((prev) => prev.map((r) => ({ ...r, showDropdown: false })))}
    >
      {/* ══ PAGE HEADER ══════════════════════════════════════════════════ */}
      <div className="qo-header-pad" style={{ background: "#FFFFFF", padding: "32px 32px 28px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "#6B6B6B", marginBottom: "6px" }}>Wholesale</div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px,4vw,40px)", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.1, marginBottom: "10px" }}>
                Quick Order
              </h1>
              {/* How it works strip */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { n: "1", label: "Search product" },
                  { n: "2", label: "Pick a color" },
                  { n: "3", label: "Enter quantities" },
                  { n: "4", label: "Add to cart" },
                ].map((step, i, arr) => (
                  <div key={step.n} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--brand-primary, #1C3557)", color: "#fff", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step.n}</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", fontWeight: 500 }}>{step.label}</span>
                    </div>
                    {i < arr.length - 1 && <span style={{ color: "#6B6B6B", fontSize: "12px", marginLeft: "2px" }}>→</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Header CTA */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, paddingTop: "4px" }}>
              {grandTotals.units > 0 && (
                <div style={{ padding: "8px 14px", background: "#F8F8F6", border: "1px solid #E2E2DE", fontSize: "13px", color: "#6B6B6B", whiteSpace: "nowrap", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 700, color: "var(--brand-primary, #1C3557)", lineHeight: 1 }}>{formatCurrency(grandTotals.price)}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B" }}>{grandTotals.units} unit{grandTotals.units !== 1 ? "s" : ""}</div>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
                disabled={isAddingToCart || grandTotals.units === 0}
                style={{
                  background: grandTotals.units === 0 ? "#E2E2DE" : "var(--brand-primary, #1C3557)",
                  color: grandTotals.units === 0 ? "#6B6B6B" : "#fff",
                  padding: "13px 28px", fontSize: "13px", fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  border: "none",
                  cursor: grandTotals.units === 0 ? "not-allowed" : "pointer",
                  letterSpacing: ".04em", whiteSpace: "nowrap",
                  transition: "background .2s",
                }}
              >
                {isAddingToCart ? "Adding…" : grandTotals.units > 0 ? `Add ${grandTotals.units} to Cart` : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ TOOLBAR ══════════════════════════════════════════════════════ */}
      <div className="qo-toolbar-pad" style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E2DE", padding: "0 32px" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto", height: "44px", display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#7A7880" }}>
            {rows.length} line{rows.length !== 1 ? "s" : ""}
          </span>
          {checkedCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteChecked(); }}
              style={{ padding: "4px 12px", fontSize: "12px", fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: "5px", cursor: "pointer" }}
            >
              Remove {checkedCount} selected
            </button>
          )}
          {cartMsg && (
            <div style={{
              padding: "5px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 600,
              display: "flex", alignItems: "center", gap: "8px",
              background: cartMsg.type === "success" ? "rgba(22,163,74,.1)" : "rgba(220,38,38,.1)",
              border: `1px solid ${cartMsg.type === "success" ? "rgba(22,163,74,.3)" : "rgba(220,38,38,.3)"}`,
              color: cartMsg.type === "success" ? "#16a34a" : "#dc2626",
            }}>
              {cartMsg.type === "success" ? "✓" : "✕"} {cartMsg.text}
              {cartMsg.type === "success" && (
                <Link href="/cart" style={{ color: "#1A5CFF", textDecoration: "none", fontWeight: 700 }}>View Cart →</Link>
              )}
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "20px" }}>
            <Link href="/products" style={{ fontSize: "12px", fontWeight: 600, color: "#7A7880", textDecoration: "none" }}>Browse Catalog</Link>
            <Link href="/cart" style={{ fontSize: "12px", fontWeight: 600, color: "#1A5CFF", textDecoration: "none" }}>View Cart</Link>
          </div>
        </div>
      </div>

      {/* ══ COLUMN HEADERS ═══════════════════════════════════════════════ */}
      <div className="qo-col-header-pad" style={{ background: "#F8F8F6", padding: "0 32px" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 28px 1fr 220px 40px", gap: "0", padding: "8px 12px 6px", alignItems: "center" }}>
            <div />
            <div />
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7A7880" }}>Product</div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7A7880" }}>Color</div>
            <div />
          </div>
        </div>
      </div>

      {/* ══ ROWS ═════════════════════════════════════════════════════════ */}
      <div className="qo-rows-pad" style={{ flex: 1, maxWidth: "1500px", width: "100%", margin: "0 auto", padding: "8px 32px 120px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {rows.map((row, rowIdx) => {
            const colors = getRowColors(row);
            const { units, price } = getRowTotals(row);
            const hasProduct = !!row.selectedProduct;
            const hasColor = row.expandedColors.length > 0;
            const hasQty = units > 0;

            return (
              <div
                key={row.id}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#fff",
                  border: `1.5px solid ${row.checked ? "#1A5CFF" : hasQty ? "rgba(26,92,255,.25)" : "#E2E0DA"}`,
                  borderRadius: "10px",
                  overflow: "visible",
                  boxShadow: hasQty ? "0 2px 8px rgba(26,92,255,.07)" : "0 1px 3px rgba(0,0,0,.04)",
                  transition: "border-color .15s, box-shadow .15s",
                }}
              >
                {/* ── ROW TOP: checkbox + # + search + color + actions ── */}
                <div style={{ display: "grid", gridTemplateColumns: "28px 28px 1fr 220px 40px", gap: "0", alignItems: "center", minHeight: "52px", padding: "0 12px", borderBottom: hasProduct ? "1px solid #F4F3EF" : "none" }}>

                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => updateRow(row.id, { checked: e.target.checked })}
                    style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#1A5CFF" }}
                  />

                  {/* Row # */}
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#ccc", userSelect: "none", textAlign: "center" }}>
                    {rowIdx + 1}
                  </span>

                  {/* Search */}
                  <div style={{ position: "relative", height: "52px", display: "flex", alignItems: "center", borderRight: "1px solid #F4F3EF" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={row.isSearching ? "#1A5CFF" : "#bbb"} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: "10px", pointerEvents: "none", flexShrink: 0, transition: "stroke .2s" }}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={row.searchQuery}
                      onChange={(e) => handleSearchChange(row.id, e.target.value)}
                      onBlur={() => setTimeout(() => updateRow(row.id, { showDropdown: false }), 150)}
                      onFocus={() => { if (row.searchResults.length > 0 && !row.selectedProduct) updateRow(row.id, { showDropdown: true }); }}
                      placeholder={row.isLoadingDetail ? "Loading…" : "Style # or product name…"}
                      disabled={row.isLoadingDetail}
                      style={{
                        width: "100%", height: "100%",
                        border: "none", outline: "none",
                        paddingLeft: "32px", paddingRight: "12px",
                        fontSize: "13px", color: "#2A2830",
                        background: "transparent",
                        fontFamily: "var(--font-jakarta)",
                      }}
                    />
                    {row.searchQuery && !row.selectedProduct && (
                      <button
                        onClick={() => updateRow(row.id, { searchQuery: "", searchResults: [], showDropdown: false })}
                        style={{ position: "absolute", right: "12px", background: "none", border: "none", cursor: "pointer", color: "#7A7880", fontSize: "16px", lineHeight: 1, padding: 0 }}
                      >×</button>
                    )}

                    {/* Autocomplete dropdown */}
                    {row.showDropdown && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
                        background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px",
                        boxShadow: "0 8px 32px rgba(0,0,0,.14)", zIndex: 300,
                        overflow: "hidden", maxHeight: "300px", overflowY: "auto",
                      }}>
                        {row.searchResults.length > 0 ? row.searchResults.map((product) => {
                          const img = product.primary_image;
                          const unitPrice = product.variants[0]?.effective_price ?? product.variants[0]?.retail_price;
                          return (
                            <button
                              key={product.id}
                              onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(row.id, product); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #F4F3EF", cursor: "pointer", textAlign: "left" }}
                              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#F8F7F5")}
                              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                            >
                              <div style={{ width: "36px", height: "36px", flexShrink: 0, borderRadius: "6px", overflow: "hidden", background: "#F4F3EF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {img ? (
                                  <Image src={img.url_thumbnail_webp ?? img.url_thumbnail} alt={img.alt_text ?? product.name} width={36} height={36} style={{ objectFit: "cover" }} />
                                ) : (
                                  <span style={{ fontSize: "16px" }}>👕</span>
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                                <div style={{ fontSize: "11px", color: "#7A7880" }}>
                                  {product.variants[0]?.sku ?? product.slug}
                                  {product.categories[0] && <span style={{ marginLeft: "6px" }}>· {product.categories[0].name}</span>}
                                </div>
                              </div>
                              {unitPrice && (
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A5CFF", flexShrink: 0 }}>
                                  {formatCurrency(parseFloat(unitPrice))}
                                </div>
                              )}
                            </button>
                          );
                        }) : (
                          <div style={{ padding: "18px 14px", fontSize: "13px", color: "#7A7880", textAlign: "center" }}>
                            No products found for &quot;{row.searchQuery}&quot;
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Color column */}
                  <div style={{ padding: "0 12px", borderRight: "1px solid #F4F3EF", height: "52px", display: "flex", alignItems: "center" }}>
                    {row.isLoadingDetail ? (
                      <span style={{ fontSize: "12px", color: "#7A7880" }}>Loading…</span>
                    ) : colors.length > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {colors.slice(0, 8).map((c) => {
                          const hex = getColorHex(c);
                          const light = isLight(hex);
                          const active = row.expandedColors.includes(c);
                          return (
                            <button
                              key={c}
                              title={c}
                              onClick={() => toggleColor(row.id, c)}
                              style={{
                                width: "22px", height: "22px", borderRadius: "50%",
                                background: hex,
                                border: active
                                  ? "2px solid #1A5CFF"
                                  : light ? "1.5px solid #E2E0DA" : "1.5px solid rgba(0,0,0,.15)",
                                cursor: "pointer", padding: 0, flexShrink: 0,
                                boxShadow: active ? "0 0 0 2px rgba(26,92,255,.2)" : "none",
                                transition: "all .15s",
                              }}
                            />
                          );
                        })}
                        {colors.length > 8 && (
                          <select
                            value=""
                            onChange={(e) => { if (e.target.value) toggleColor(row.id, e.target.value); }}
                            style={{ fontSize: "11px", border: "1px solid #E2E0DA", borderRadius: "4px", padding: "2px 4px", background: "#fff", color: "#2A2830", cursor: "pointer", fontFamily: "var(--font-jakarta)" }}
                          >
                            <option value="">More…</option>
                            {colors.slice(8).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                      </div>
                    ) : hasProduct ? (
                      <span style={{ fontSize: "12px", color: "#7A7880" }}>No colors</span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#ddd" }}>—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <IconBtn title="Duplicate row" onClick={() => copyRow(row.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    </IconBtn>
                    <IconBtn title="Remove row" danger onClick={() => deleteRow(row.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </IconBtn>
                  </div>
                </div>

                {/* ── ROW BODY: product info + size grid ── */}
                {hasProduct && (
                  <div style={{ padding: "14px 68px 16px 68px" }}>
                    {row.isLoadingDetail ? (
                      <div style={{ fontSize: "13px", color: "#7A7880", padding: "4px 0" }}>Loading product details…</div>
                    ) : (
                      <>
                        {/* Product summary bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                          <div style={{ width: "36px", height: "36px", flexShrink: 0, borderRadius: "6px", overflow: "hidden", background: "#F4F3EF", border: "1px solid #E2E0DA" }}>
                            {row.selectedProduct?.primary_image ? (
                              <Image
                                src={row.selectedProduct.primary_image.url_thumbnail_webp ?? row.selectedProduct.primary_image.url_thumbnail}
                                alt={row.selectedProduct.name}
                                width={36} height={36}
                                style={{ objectFit: "cover", width: "100%", height: "100%" }}
                              />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>👕</div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {row.selectedProduct?.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", color: "#7A7880", fontFamily: "monospace" }}>
                                {row.selectedProduct?.variants[0]?.sku ?? row.selectedProduct?.slug}
                              </span>
                            </div>
                          </div>
                          {hasQty && (
                            <div style={{ flexShrink: 0, textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#1A5CFF", lineHeight: 1 }}>{formatCurrency(price)}</div>
                              <div style={{ fontSize: "11px", color: "#7A7880" }}>{units} unit{units !== 1 ? "s" : ""}</div>
                            </div>
                          )}
                        </div>

                        {/* Step 2 prompt: no color selected yet */}
                        {!hasColor && colors.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "#F4F3EF", borderRadius: "8px", fontSize: "13px", color: "#7A7880" }}>
                            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#E8242A", color: "#fff", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</span>
                            Click a color above to see sizes — multiple colors can be open at once
                          </div>
                        )}

                        {/* Size / quantity grids — one per expanded color */}
                        {row.expandedColors.map((color) => {
                          const sizes = getSizesForColor(row, color);
                          const colorHex = getColorHex(color);
                          const colorUnits = sizes.reduce((s, sz) => s + (row.quantities[color]?.[sz] ?? 0), 0);
                          const colorPrice = sizes.reduce((s, sz) => {
                            const qty = row.quantities[color]?.[sz] ?? 0;
                            const v = getVariantForColor(row, color, sz);
                            return s + qty * parseFloat(v?.effective_price ?? v?.retail_price ?? "0");
                          }, 0);
                          return (
                            <div key={color} style={{ marginBottom: "12px" }}>
                              {/* Color header */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: colorHex, border: isLight(colorHex) ? "1px solid #ddd" : "none", flexShrink: 0 }} />
                                <span style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{color}</span>
                                {colorUnits > 0 && (
                                  <span style={{ fontSize: "11px", color: "#1A5CFF", fontWeight: 600, marginLeft: "4px" }}>
                                    {colorUnits} unit{colorUnits !== 1 ? "s" : ""} · {formatCurrency(colorPrice)}
                                  </span>
                                )}
                                <button
                                  onClick={() => toggleColor(row.id, color)}
                                  style={{ marginLeft: "auto", fontSize: "11px", color: "#7A7880", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                                  title="Collapse color"
                                >
                                  ▲ collapse
                                </button>
                              </div>
                              {sizes.length > 0 ? (
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ borderCollapse: "separate", borderSpacing: "5px 0", fontSize: "13px" }}>
                                    <thead>
                                      <tr>
                                        {sizes.map((size) => {
                                          const v = getVariantForColor(row, color, size);
                                          const unitPrice = v?.effective_price ?? v?.retail_price;
                                          const oos = !v || v.stock_quantity === 0 || v.status === "out_of_stock";
                                          return (
                                            <th key={size} style={{ padding: "0 0 8px", textAlign: "center", minWidth: "60px" }}>
                                              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "15px", letterSpacing: ".06em", color: oos ? "#ccc" : "#2A2830" }}>{size}</div>
                                              {oos ? (
                                                <div style={{ fontSize: "9px", color: "#E8242A", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Out</div>
                                              ) : unitPrice ? (
                                                <div style={{ fontSize: "10px", color: "#7A7880", fontWeight: 400, fontFamily: "var(--font-jakarta)" }}>
                                                  {formatCurrency(parseFloat(unitPrice))}
                                                </div>
                                              ) : null}
                                            </th>
                                          );
                                        })}
                                        <th style={{ padding: "0 0 8px 14px", textAlign: "right", minWidth: "80px", borderLeft: "1px solid #E2E0DA" }}>
                                          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "15px", color: "#2A2830" }}>Total</div>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        {sizes.map((size) => {
                                          const qty = row.quantities[color]?.[size] ?? 0;
                                          const v = getVariantForColor(row, color, size);
                                          const oos = !v || v.stock_quantity === 0 || v.status === "out_of_stock";
                                          return (
                                            <td key={size} style={{ padding: 0, textAlign: "center" }}>
                                              <input
                                                type="number"
                                                min={0}
                                                max={v?.stock_quantity ?? 0}
                                                disabled={oos}
                                                value={qty === 0 ? "" : qty}
                                                onChange={(e) => handleQtyChange(row.id, color, size, e.target.value)}
                                                placeholder={oos ? "—" : "0"}
                                                style={{
                                                  width: "60px", height: "42px",
                                                  textAlign: "center", fontSize: "15px", fontWeight: 700,
                                                  border: oos ? "1.5px solid #E2E0DA" : qty > 0 ? "2px solid #1A5CFF" : "1.5px solid #E2E0DA",
                                                  borderRadius: "6px", outline: "none",
                                                  background: oos ? "#F9F8F7" : qty > 0 ? "rgba(26,92,255,.04)" : "#fff",
                                                  color: oos ? "#ccc" : "#2A2830",
                                                  cursor: oos ? "not-allowed" : "text",
                                                  transition: "border-color .12s, background .12s",
                                                  fontFamily: "var(--font-jakarta)",
                                                  MozAppearance: "textfield",
                                                }}
                                                onFocus={(e) => { if (!e.currentTarget.value) e.currentTarget.placeholder = ""; }}
                                                onBlur={(e) => { e.currentTarget.placeholder = oos ? "—" : "0"; }}
                                              />
                                            </td>
                                          );
                                        })}
                                        <td style={{ padding: "0 0 0 14px", textAlign: "right", verticalAlign: "middle", borderLeft: "1px solid #E2E0DA" }}>
                                          {colorUnits > 0 ? (
                                            <div>
                                              <div style={{ fontSize: "11px", color: "#7A7880", marginBottom: "1px" }}>{colorUnits} units</div>
                                              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#1A5CFF", lineHeight: 1 }}>
                                                {formatCurrency(colorPrice)}
                                              </div>
                                            </div>
                                          ) : (
                                            <span style={{ fontSize: "13px", color: "#ddd" }}>—</span>
                                          )}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div style={{ fontSize: "12px", color: "#7A7880", padding: "4px 0" }}>No sizes available</div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* ── EMPTY STATE ── */}
                {!hasProduct && !row.isLoadingDetail && (
                  <div style={{ padding: "12px 68px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span style={{ fontSize: "12px", color: "#ccc" }}>
                      Type a product name or style number to search
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ STICKY BOTTOM BAR ════════════════════════════════════════════ */}
      <div style={{
        position: "sticky", bottom: 0, background: "#fff",
        borderTop: "1px solid #E2E0DA", padding: "12px 32px",
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,.07)",
      }}>
        <button
          onClick={() => setRows((prev) => [...prev, makeRow()])}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px", background: "#fff",
            border: "1.5px dashed #E2E0DA", borderRadius: "7px",
            fontSize: "12px", fontWeight: 700, color: "#7A7880",
            cursor: "pointer", textTransform: "uppercase", letterSpacing: ".06em",
            transition: "all .2s",
          }}
          onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A5CFF"; b.style.color = "#1A5CFF"; }}
          onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#E2E0DA"; b.style.color = "#7A7880"; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Line
        </button>

        {grandTotals.units > 0 && (
          <>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: "13px", color: "#7A7880" }}>
              {grandTotals.units} unit{grandTotals.units !== 1 ? "s" : ""}
              <span style={{ margin: "0 8px", color: "#E2E0DA" }}>·</span>
              <span style={{ fontWeight: 700, color: "#2A2830", fontSize: "15px" }}>{formatCurrency(grandTotals.price)}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
              disabled={isAddingToCart}
              style={{
                background: "#1A5CFF", color: "#fff",
                padding: "11px 28px", fontSize: "13px", fontWeight: 700,
                borderRadius: "7px", border: "none",
                cursor: isAddingToCart ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: ".07em",
                transition: "background .2s",
              }}
              onMouseEnter={(e) => { if (!isAddingToCart) (e.currentTarget as HTMLButtonElement).style.background = "#1348d4"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1A5CFF"; }}
            >
              {isAddingToCart ? "Adding…" : `Add ${grandTotals.units} Unit${grandTotals.units !== 1 ? "s" : ""} to Cart`}
            </button>
          </>
        )}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

// ─── Icon button ──────────────────────────────────────────────────────────────
function IconBtn({ children, title, onClick, danger = false }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
        background: hov ? (danger ? "rgba(220,38,38,.07)" : "#F4F3EF") : "transparent",
        border: `1px solid ${hov ? (danger ? "rgba(220,38,38,.25)" : "#ddd") : "transparent"}`,
        borderRadius: "5px", cursor: "pointer",
        color: hov && danger ? "#dc2626" : "#aaa",
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}
