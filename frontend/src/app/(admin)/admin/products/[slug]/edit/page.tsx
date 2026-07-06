// frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { productsService } from "@/services/products.service";
import { apiClient } from "@/lib/api-client";
import dynamic from "next/dynamic";
import { SearchIcon, TrashIcon } from "@/components/ui/icons";

const RichTextEditor = dynamic(
  () => import("@/components/admin/RichTextEditor").then(m => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div style={{ border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "14px 16px", minHeight: "160px", color: "#aaa", fontSize: "14px" }}>
        Loading editor…
      </div>
    ),
  }
);
import type { Category, ProductDetail, ProductImage, ProductVariant } from "@/types/product.types";

// ── Style constants ────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const sectionCard: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px",
  padding: "24px", marginBottom: "16px",
};
const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".08em",
  color: "#2A2830", marginBottom: "16px", display: "block",
};
const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
};

const SIZE_ORDER = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "ONE SIZE"];

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


interface VariantGroup {
  color: string;
  variants: ProductVariant[];
}

export default function AdminProductEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flyerInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [flyerMsg, setFlyerMsg] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editSEO, setEditSEO] = useState(false);

  // Variant expand state
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandAll, setExpandAll] = useState(false);

  // Variant local edits: variantId → field overrides
  const [variantEdits, setVariantEdits] = useState<Record<string, Record<string, string>>>({});

  // Bulk apply to all variants
  const [bulkApply, setBulkApply] = useState({ price: "", compare: "", cost: "", origin: "", stock: "" });

  async function applyToAllVariants() {
    if (!product) return;
    const updates: Record<string, string> = {};
    if (bulkApply.price.trim()) updates.retail_price = bulkApply.price.trim();
    if (bulkApply.compare.trim()) updates.compare_price = bulkApply.compare.trim();
    if (bulkApply.cost.trim()) updates.cost_per_item = bulkApply.cost.trim();
    if (bulkApply.origin.trim()) updates.country_of_origin = bulkApply.origin.trim();
    if (bulkApply.stock.trim()) updates.stock_quantity = bulkApply.stock.trim();
    if (!Object.keys(updates).length) return;
    await Promise.all(
      product.variants.map(v => adminService.updateVariant(product.id, v.id, updates))
    );
    setBulkApply({ price: "", compare: "", cost: "", origin: "", stock: "" });
    await load();
  }

  async function applyToSelectedVariants() {
    if (!product || !selectedVariantIds.size) return;
    const updates: Record<string, string> = {};
    if (bulkApply.price.trim()) updates.retail_price = bulkApply.price.trim();
    if (bulkApply.compare.trim()) updates.compare_price = bulkApply.compare.trim();
    if (bulkApply.cost.trim()) updates.cost_per_item = bulkApply.cost.trim();
    if (bulkApply.origin.trim()) updates.country_of_origin = bulkApply.origin.trim();
    if (bulkApply.stock.trim()) updates.stock_quantity = bulkApply.stock.trim();
    if (!Object.keys(updates).length) return;
    await Promise.all(
      product.variants.filter(v => selectedVariantIds.has(v.id)).map(v => adminService.updateVariant(product.id, v.id, updates))
    );
    setBulkApply({ price: "", compare: "", cost: "", origin: "", stock: "" });
    setSelectedVariantIds(new Set());
    await load();
  }

  async function handleBulkDeleteVariants() {
    if (!product || selectedVariantIds.size === 0) return;
    if (!confirm(`Delete ${selectedVariantIds.size} selected variant(s)? This cannot be undone.`)) return;
    try {
      const result = await adminService.deleteVariantsBulk(product.id, [...selectedVariantIds]);
      if (result?.discontinued && result.discontinued > 0) {
        alert(`${result.discontinued} variant(s) have order history and were discontinued instead of deleted.`);
      }
    } catch (err: unknown) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "Server error"}`);
    }
    setSelectedVariantIds(new Set());
    await load();
  }

  // Add Variant modal (Shopify-style multi)
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [bulkColors, setBulkColors] = useState("");
  const [bulkSizes, setBulkSizes] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [addingVariant, setAddingVariant] = useState(false);

  // Variant selection for "Apply to Selected"
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  async function load() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [p, cats] = await Promise.all([
        adminService.getProduct(slug),
        productsService.getCategories().catch(() => [] as Category[]),
      ]);
      if (!p) {
        setLoadError("Product not returned by API");
        return;
      }
      setProduct(p);
      setCategories(cats ?? []);
      if (p.variants?.length) {
        const firstColor = p.variants[0]?.color ?? "No Color";
        setExpandedGroups([firstColor]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]); // eslint-disable-line

  const groupedVariants = useMemo<VariantGroup[]>(() => {
    if (!product?.variants) return [];
    const map: Record<string, ProductVariant[]> = {};
    product.variants
      .filter(v => v.status !== "discontinued")
      .forEach(v => {
        const color = v.color ?? "No Color";
        if (!map[color]) map[color] = [];
        map[color].push(v);
      });
    return Object.entries(map).map(([color, variants]) => ({
      color,
      variants: [...variants].sort((a, b) => {
        const ai = SIZE_ORDER.indexOf((a.size ?? "").toUpperCase());
        const bi = SIZE_ORDER.indexOf((b.size ?? "").toUpperCase());
        if (ai === -1 && bi === -1) return (a.size ?? "").localeCompare(b.size ?? "");
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }),
    }));
  }, [product?.variants]);

  function toggleGroup(color: string) {
    setExpandedGroups(prev =>
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  }

  function updateVariantEdit(id: string, field: string, value: string) {
    setVariantEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  }

  function getVariantValue(v: ProductVariant, field: keyof ProductVariant): string {
    const edit = variantEdits[v.id]?.[field];
    if (edit !== undefined) return edit;
    const val = v[field];
    return val == null ? "" : String(val);
  }

  async function saveVariant(variantId: string) {
    if (!product || !variantEdits[variantId]) return;
    await adminService.updateVariant(product.id, variantId, variantEdits[variantId]);
  }

  async function handleAddVariants() {
    if (!product) return;
    const colors = bulkColors.split(",").map(c => c.trim()).filter(Boolean);
    if (!colors.length || !bulkSizes.length) return;
    setAddingVariant(true);
    try {
      const productCode = product.name.split(" ").map(w => w[0] ?? "").join("").toUpperCase();
      const price = parseFloat(bulkPrice) || 0;
      const newVariants: ProductVariant[] = [];
      for (const color of colors) {
        for (const size of bulkSizes) {
          const colorCode = color.slice(0, 3).toUpperCase();
          const sizeCode = size.toUpperCase();
          const sku = `${productCode}-${colorCode}-${sizeCode}-${Date.now().toString(36).toUpperCase()}`;
          const created = await apiClient.post<ProductVariant>(`/api/v1/admin/products/${product.id}/variants`, {
            sku, color, size, retail_price: price, status: "active",
          });
          newVariants.push(created);
        }
      }
      setProduct(prev => prev ? { ...prev, variants: [...prev.variants, ...newVariants] } : prev);
      const newColors = colors.filter(c => c);
      setExpandedGroups(prev => [...new Set([...prev, ...newColors])]);
      setBulkColors(""); setBulkSizes([]); setBulkPrice("");
      setShowAddVariant(false);
    } catch (err) {
      alert("Failed to add variants.");
      console.error(err);
    } finally {
      setAddingVariant(false);
    }
  }

  async function handleDeleteVariant(variantId: string) {
    if (!product) return;
    if (!confirm("Delete this variant? This cannot be undone.")) return;
    try {
      const result = await adminService.deleteVariantsBulk(product.id, [variantId]);
      if (result?.discontinued && result.discontinued > 0) {
        alert("Variant has order history and was discontinued instead of deleted.");
      }
    } catch (err: unknown) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "Server error"}`);
    }
    setProduct(prev => prev ? {
      ...prev,
      variants: prev.variants.filter(v => v.id !== variantId),
    } : prev);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!product || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      await adminService.uploadImage(product.id, file);
    }
    await load();
    e.target.value = "";
  }

  async function handleDeleteImage(imageId: string) {
    if (!product) return;
    await adminService.deleteImage(product.id, imageId);
    setProduct(prev => prev ? {
      ...prev,
      images: prev.images.filter(img => img.id !== imageId),
    } : prev);
  }

  async function handleSetPrimary(imageId: string) {
    if (!product) return;
    const ordered = [imageId, ...product.images.filter(img => img.id !== imageId).map(img => img.id)];
    await adminService.reorderImages(product.id, ordered);
    await load();
  }

  async function handleUpdateImageColor(imageId: string, color: string) {
    if (!product) return;
    await apiClient.patch(`/api/v1/admin/products/${product.id}/images/${imageId}`, { alt_text: color || null });
    setProduct(prev => prev ? {
      ...prev,
      images: prev.images.map(img => img.id === imageId ? { ...img, alt_text: color || null } : img),
    } : prev);
  }

  function moveImageInGroup(imageId: string, direction: "up" | "down") {
    if (!product) return;
    const images = product.images;
    const img = images.find(i => i.id === imageId);
    if (!img) return;
    const color = img.alt_text || "";
    const groupImages = images.filter(i => (i.alt_text || "") === color);
    const groupIdx = groupImages.findIndex(i => i.id === imageId);
    if (direction === "up" && groupIdx === 0) return;
    if (direction === "down" && groupIdx === groupImages.length - 1) return;
    const newGroup = [...groupImages];
    const swapIdx = direction === "up" ? groupIdx - 1 : groupIdx + 1;
    const tmp = newGroup[groupIdx] as ProductImage;
    newGroup[groupIdx] = newGroup[swapIdx] as ProductImage;
    newGroup[swapIdx] = tmp;
    // Rebuild full array: preserve color-group order, replace this group's images
    const seen = new Set<string>();
    const colorOrder: string[] = [];
    for (const i of images) { const c = i.alt_text || ""; if (!seen.has(c)) { seen.add(c); colorOrder.push(c); } }
    const newImages = colorOrder.flatMap(c => c === color ? newGroup : images.filter(i => (i.alt_text || "") === c));
    setProduct(prev => prev ? { ...prev, images: newImages } : prev);
    adminService.reorderImages(product.id, newImages.map(i => i.id));
  }

  async function handleFlyerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!product || !e.target.files?.length) return;
    const file = e.target.files[0]!;
    setUploadingFlyer(true);
    setFlyerMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiClient.postForm(`/api/v1/admin/products/${product.id}/upload-flyer`, fd);
      setFlyerMsg("Flyer uploaded successfully.");
      await load();
    } catch {
      setFlyerMsg("Upload failed. Please try again.");
    } finally {
      setUploadingFlyer(false);
      e.target.value = "";
    }
  }

  async function handleDeleteFlyer() {
    if (!product || !confirm("Remove the flyer for this product?")) return;
    try {
      await apiClient.delete(`/api/v1/admin/products/${product.id}/flyer`);
      setFlyerMsg("Flyer removed.");
      await load();
    } catch {
      setFlyerMsg("Failed to remove flyer.");
    }
  }

  async function handleSave() {
    if (!product) return;
    setIsSaving(true);
    setSaveMsg("");
    try {
      // Save all dirty variant edits in parallel
      const variantSaves = Object.keys(variantEdits).map(vid => saveVariant(vid));
      // Save product fields
      const productSave = adminService.updateProduct(product.id, {
        name: product.name,
        description: product.description,
        status: product.status,
        meta_title: product.meta_title,
        meta_description: product.meta_description,
        product_type: product.product_type,
        vendor: product.vendor,
        tags: product.tags,
        category_ids: product.categories.map(c => c.id),
        fabric: (product as any).fabric,
        product_code: (product as any).product_code,
        weight: (product as any).weight,
        gender: (product as any).gender,
        care_instructions: (product as any).care_instructions ?? null,
        print_guide: (product as any).print_guide ?? null,
        size_chart_data: (product as any).size_chart_data ?? null,
        highlight_text: (product as any).highlight_text ?? null,
      });
      await Promise.all([...variantSaves, productSave]);
      setVariantEdits({});
      setSaveSuccess(true);
      setSaveMsg("Saved! Redirecting to products…");
      setTimeout(() => router.push("/admin/products"), 1200);
    } finally {
      setIsSaving(false);
    }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || !product) return;
    setProduct(p => p ? { ...p, tags: [...(p.tags ?? []), trimmed] } : p);
  }

  function removeTag(tag: string) {
    if (!product) return;
    setProduct(p => p ? { ...p, tags: (p.tags ?? []).filter(t => t !== tag) } : p);
  }

  if (isLoading && !product) {
    return (
      <div style={{ fontFamily: "var(--font-jakarta)", display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#aaa", fontSize: "14px" }}>
        Loading product…
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{ fontFamily: "var(--font-jakarta)", padding: "48px", textAlign: "center" }}>
        <div style={{ marginBottom: "12px" }}><SearchIcon size={32} color="#aaa" /></div>
        <div style={{ fontSize: "16px", color: "#2A2830", fontWeight: 600 }}>
          {loadError ? "Error loading product" : "Product not found"}
        </div>
        {loadError && (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#E8242A", background: "rgba(232,36,42,.06)", padding: "10px 16px", borderRadius: "8px", display: "inline-block", maxWidth: "480px" }}>
            {loadError}
          </div>
        )}
        <div style={{ marginTop: "16px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={() => load()}
            style={{ padding: "10px 20px", background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/admin/products")}
            style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
          >
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Top Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <button
            onClick={() => router.push("/admin/products")}
            style={{ background: "none", border: "none", color: "#7A7880", cursor: "pointer", fontSize: "13px", padding: 0, display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}
          >
            ← Products
          </button>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>
            {product.name}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {saveMsg && <span style={{ color: "#059669", fontSize: "13px", fontWeight: 600 }}>{saveMsg}</span>}
          <button
            onClick={() => router.push(`/products/${product.slug}`)}
            style={{ padding: "10px 14px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
          >
            👁 Preview
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || saveSuccess}
            style={{ padding: "10px 24px", background: saveSuccess ? "#059669" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: (isSaving || saveSuccess) ? "not-allowed" : "pointer", opacity: isSaving ? 0.7 : 1, fontSize: "14px" }}
          >
            {isSaving ? "Saving…" : saveSuccess ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* 2-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px", alignItems: "start" }}>

        {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
        <div>

          {/* Title & Description */}
          <div style={sectionCard}>
            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Title <span style={{ color: "#E8242A" }}>*</span></label>
              <input
                value={product.name}
                onChange={e => setProduct(p => p ? { ...p, name: e.target.value } : p)}
                style={{ ...inputStyle, fontSize: "16px", fontWeight: 600 }}
              />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>
                Highlight Box Text
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#B0ADBA", marginLeft: "8px" }}>
                  shown in blue box on product page
                </span>
              </label>
              <textarea
                value={(product as any).highlight_text ?? ""}
                onChange={e => setProduct(p => p ? { ...p, highlight_text: e.target.value } as any : p)}
                rows={3}
                placeholder="e.g. Print-optimized CVC Blend. Tested for DTF transfers, screen printing, and embroidery. Consistent shrinkage below 3%."
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <RichTextEditor
                value={product.description ?? ""}
                onChange={val => setProduct(p => p ? { ...p, description: val } : p)}
                placeholder="Describe this product — fabric details, print compatibility, sizing notes…"
              />
            </div>
          </div>

          {/* Media */}
          <div style={sectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ ...sectionTitle, marginBottom: 0 }}>MEDIA</span>
              <span style={{ fontSize: "11px", color: "#aaa" }}>Images grouped by color · ▲▼ to reorder · ★ to set primary</span>
            </div>

            {/* Images grouped by color with sort controls */}
            {(product.images?.length ?? 0) > 0 && (() => {
              const variantColors = [...new Set(product.variants?.map(v => v.color).filter(Boolean) as string[])];
              // Build color order: assigned colors first (in first-appearance order), unassigned last
              const seen = new Set<string>();
              const colorOrder: string[] = [];
              for (const im of product.images) { const c = im.alt_text || ""; if (!seen.has(c)) { seen.add(c); colorOrder.push(c); } }
              const orderedColors = [...colorOrder.filter(c => c !== ""), ...(colorOrder.includes("") ? [""] : [])];
              return (
                <div style={{ marginBottom: "12px" }}>
                  {orderedColors.map(color => {
                    const groupImages = product.images.filter(im => (im.alt_text || "") === color);
                    return (
                      <div key={color || "__none"} style={{ marginBottom: "14px" }}>
                        {/* Color group header */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px", padding: "5px 10px", background: "#F4F3EF", borderRadius: "6px" }}>
                          {color && COLOR_MAP[color] && (
                            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: COLOR_MAP[color], border: "1px solid rgba(0,0,0,.12)", flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{color || "No Color Assigned"}</span>
                          <span style={{ fontSize: "11px", color: "#7A7880" }}>· {groupImages.length} image{groupImages.length !== 1 ? "s" : ""}</span>
                        </div>
                        {/* Images in this group */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {groupImages.map((img, groupIdx) => (
                            <div key={img.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: product.images[0]?.id === img.id ? "rgba(26,92,255,.03)" : "#fff" }}>
                              {/* Up/down sort buttons */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0 }}>
                                <button type="button" onClick={() => moveImageInGroup(img.id, "up")} disabled={groupIdx === 0}
                                  style={{ width: "24px", height: "22px", border: "1px solid #E2E0DA", borderRadius: "4px", background: groupIdx === 0 ? "#fafafa" : "#F4F3EF", cursor: groupIdx === 0 ? "default" : "pointer", color: groupIdx === 0 ? "#ccc" : "#7A7880", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                                  title="Move up">▲</button>
                                <button type="button" onClick={() => moveImageInGroup(img.id, "down")} disabled={groupIdx === groupImages.length - 1}
                                  style={{ width: "24px", height: "22px", border: "1px solid #E2E0DA", borderRadius: "4px", background: groupIdx === groupImages.length - 1 ? "#fafafa" : "#F4F3EF", cursor: groupIdx === groupImages.length - 1 ? "default" : "pointer", color: groupIdx === groupImages.length - 1 ? "#ccc" : "#7A7880", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                                  title="Move down">▼</button>
                              </div>
                              {/* Thumbnail */}
                              <div style={{ width: "64px", height: "64px", borderRadius: "6px", overflow: "hidden", flexShrink: 0, border: "1px solid #E2E0DA", background: "#f5f5f5" }}>
                                <img src={img.url_medium} alt={img.alt_text ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              {/* Controls */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                  {product.images[0]?.id === img.id ? (
                                    <span style={{ background: "#1A5CFF", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "3px" }}>★ PRIMARY</span>
                                  ) : (
                                    <button onClick={() => handleSetPrimary(img.id)}
                                      style={{ background: "#F4F3EF", border: "1px solid #E2E0DA", color: "#7A7880", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "3px", cursor: "pointer" }}
                                    >☆ Set Primary</button>
                                  )}
                                </div>
                                {/* Color assignment */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <label style={{ fontSize: "11px", color: "#7A7880", whiteSpace: "nowrap" }}>Color:</label>
                                  {variantColors.length > 0 ? (
                                    <select value={img.alt_text ?? ""} onChange={e => handleUpdateImageColor(img.id, e.target.value)}
                                      style={{ padding: "4px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", background: "#fff", maxWidth: "160px" }}>
                                      <option value="">— No color —</option>
                                      {variantColors.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : (
                                    <input value={img.alt_text ?? ""} onChange={e => handleUpdateImageColor(img.id, e.target.value)}
                                      placeholder="e.g. Navy (links to color tab)"
                                      style={{ padding: "4px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "180px" }} />
                                  )}
                                </div>
                              </div>
                              {/* Delete */}
                              <button onClick={() => handleDeleteImage(img.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", padding: "4px", flexShrink: 0 }}
                              ><TrashIcon size={15} color="#E8242A" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Upload tile */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ borderRadius: "8px", border: "2px dashed #E2E0DA", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", background: "#FAFAFA", padding: "16px", transition: "border-color .2s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A5CFF")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#E2E0DA")}
            >
              <span style={{ fontSize: "20px", color: "#aaa" }}>+</span>
              <span style={{ fontSize: "13px", color: "#7A7880" }}>Add media</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageUpload} />
          </div>

          {/* Variants */}
          <div style={sectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ ...sectionTitle, marginBottom: 0 }}>VARIANTS</span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {selectedVariantIds.size > 0 && (
                  <button
                    onClick={handleBulkDeleteVariants}
                    style={{ padding: "6px 14px", background: "rgba(232,36,42,.08)", color: "#E8242A", border: "1px solid #FECACA", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Delete Selected ({selectedVariantIds.size})
                  </button>
                )}
                <button
                  onClick={() => setExpandAll(v => !v)}
                  style={{ padding: "6px 14px", border: "1px solid #E2E0DA", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: "#fff" }}
                >
                  {expandAll ? "Collapse All" : "Expand All"}
                </button>
                <button
                  onClick={() => setShowAddVariant(true)}
                  style={{ padding: "6px 14px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                >
                  + Add Variant
                </button>
              </div>
            </div>

            {/* Apply to All / Selected bar */}
            {groupedVariants.length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", padding: "12px 14px", background: "#F4F3EF", borderRadius: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#7A7880", whiteSpace: "nowrap" }}>BULK EDIT:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Price $</span>
                  <input type="number" placeholder="—" value={bulkApply.price} onChange={e => setBulkApply(p => ({ ...p, price: e.target.value }))} style={{ width: "72px", padding: "5px 7px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Compare $</span>
                  <input type="number" placeholder="—" value={bulkApply.compare} onChange={e => setBulkApply(p => ({ ...p, compare: e.target.value }))} style={{ width: "72px", padding: "5px 7px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Cost $</span>
                  <input type="number" placeholder="—" value={bulkApply.cost} onChange={e => setBulkApply(p => ({ ...p, cost: e.target.value }))} style={{ width: "72px", padding: "5px 7px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Country</span>
                  <input type="text" placeholder="e.g. Bangladesh" value={bulkApply.origin} onChange={e => setBulkApply(p => ({ ...p, origin: e.target.value }))} style={{ width: "120px", padding: "5px 7px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Stock</span>
                  <input type="number" placeholder="—" value={bulkApply.stock} onChange={e => setBulkApply(p => ({ ...p, stock: e.target.value }))} style={{ width: "60px", padding: "5px 7px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }} />
                </div>
                <button
                  onClick={applyToAllVariants}
                  disabled={!bulkApply.price && !bulkApply.compare && !bulkApply.cost && !bulkApply.origin && !bulkApply.stock}
                  style={{ padding: "5px 14px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: (!bulkApply.price && !bulkApply.compare && !bulkApply.cost && !bulkApply.origin && !bulkApply.stock) ? 0.4 : 1 }}
                >
                  Apply to All
                </button>
                {selectedVariantIds.size > 0 && (
                  <button
                    onClick={applyToSelectedVariants}
                    disabled={!bulkApply.price && !bulkApply.compare && !bulkApply.cost && !bulkApply.origin && !bulkApply.stock}
                    style={{ padding: "5px 14px", background: "#059669", color: "#fff", border: "none", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: (!bulkApply.price && !bulkApply.compare && !bulkApply.cost && !bulkApply.origin && !bulkApply.stock) ? 0.4 : 1 }}
                  >
                    Apply to Selected ({selectedVariantIds.size})
                  </button>
                )}
              </div>
            )}

            {groupedVariants.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>
                No variants yet. Use the bulk generate tool to create color/size variants.
              </div>
            ) : groupedVariants.map(group => (
              <div key={group.color} style={{ border: "1px solid #E2E0DA", borderRadius: "8px", marginBottom: "10px", overflow: "hidden" }}>
                {/* Color header */}
                <div
                  onClick={() => toggleGroup(group.color)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", cursor: "pointer", background: "#F4F3EF", userSelect: "none" }}
                >
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: COLOR_MAP[group.color] ?? "#888", border: "1.5px solid rgba(0,0,0,.1)", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{group.color}</span>
                  <span style={{ fontSize: "12px", color: "#7A7880" }}>({group.variants.length} sizes)</span>
                  <span style={{ marginLeft: "auto", fontSize: "12px", color: "#7A7880" }}>
                    Stock: {group.variants.reduce((s, v) => s + (v.stock_quantity ?? 0), 0)} units
                  </span>
                  <span style={{ fontSize: "12px", color: "#aaa", transform: (expandAll || expandedGroups.includes(group.color)) ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s", display: "inline-block" }}>▼</span>
                </div>

                {/* Variants table */}
                {(expandAll || expandedGroups.includes(group.color)) && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#FAFAFA" }}>
                        <th style={{ ...thStyle, width: "36px" }}>
                          <input
                            type="checkbox"
                            checked={group.variants.every(v => selectedVariantIds.has(v.id))}
                            onChange={e => {
                              setSelectedVariantIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) group.variants.forEach(v => next.add(v.id));
                                else group.variants.forEach(v => next.delete(v.id));
                                return next;
                              });
                            }}
                          />
                        </th>
                        {["Size", "SKU", "Price", "Compare Price", "Cost / Item", "Country of Origin", "Weight (g)", "Stock", ""].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.variants.map(variant => (
                        <tr key={variant.id} style={{ borderBottom: "1px solid #F4F3EF", background: selectedVariantIds.has(variant.id) ? "rgba(26,92,255,.04)" : undefined }}>
                          <td style={{ padding: "10px 16px", width: "36px" }}>
                            <input
                              type="checkbox"
                              checked={selectedVariantIds.has(variant.id)}
                              onChange={e => {
                                setSelectedVariantIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(variant.id); else next.delete(variant.id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: "13px" }}>{variant.size ?? "—"}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <input
                              value={getVariantValue(variant, "sku")}
                              onChange={e => updateVariantEdit(variant.id, "sku", e.target.value)}
                              onBlur={() => saveVariant(variant.id)}
                              style={{ padding: "6px 10px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "130px" }}
                            />
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ color: "#aaa", fontSize: "13px" }}>$</span>
                              <input
                                type="number"
                                value={getVariantValue(variant, "retail_price")}
                                onChange={e => updateVariantEdit(variant.id, "retail_price", e.target.value)}
                                onBlur={() => saveVariant(variant.id)}
                                style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "80px" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ color: "#aaa", fontSize: "13px" }}>$</span>
                              <input
                                type="number"
                                value={getVariantValue(variant, "compare_price")}
                                onChange={e => updateVariantEdit(variant.id, "compare_price", e.target.value)}
                                onBlur={() => saveVariant(variant.id)}
                                placeholder="0.00"
                                style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "80px" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ color: "#aaa", fontSize: "13px" }}>$</span>
                              <input
                                type="number"
                                value={getVariantValue(variant, "cost_per_item")}
                                onChange={e => updateVariantEdit(variant.id, "cost_per_item", e.target.value)}
                                onBlur={() => saveVariant(variant.id)}
                                placeholder="0.00"
                                style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "80px" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <input
                              type="text"
                              value={getVariantValue(variant, "country_of_origin")}
                              onChange={e => updateVariantEdit(variant.id, "country_of_origin", e.target.value)}
                              onBlur={() => saveVariant(variant.id)}
                              placeholder="e.g. Bangladesh"
                              style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "140px" }}
                            />
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <input
                              type="number"
                              value={getVariantValue(variant, "weight_grams")}
                              onChange={e => {
                                const val = e.target.value;
                                product?.variants
                                  .filter(v => v.size === variant.size)
                                  .forEach(v => updateVariantEdit(v.id, "weight_grams", val));
                              }}
                              onBlur={() => {
                                product?.variants
                                  .filter(v => v.size === variant.size)
                                  .forEach(v => { if (variantEdits[v.id]) saveVariant(v.id); });
                              }}
                              placeholder="e.g. 71"
                              style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "70px" }}
                            />
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <input
                              type="number"
                              value={getVariantValue(variant, "stock_quantity")}
                              onChange={e => updateVariantEdit(variant.id, "stock_quantity", e.target.value)}
                              onBlur={() => saveVariant(variant.id)}
                              style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "70px", textAlign: "center" }}
                            />
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <button
                              onClick={() => handleDeleteVariant(variant.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", padding: "2px 4px", display: "inline-flex" }}
                            ><TrashIcon size={16} color="#E8242A" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* ── RIGHT SIDEBAR ──────────────────────────────────────────────── */}
        <div>

          {/* Status Card */}
          <div style={sectionCard}>
            <span style={sectionTitle}>STATUS</span>
            <select
              value={product.status}
              onChange={e => setProduct(p => p ? { ...p, status: e.target.value as ProductDetail["status"] } : p)}
              style={{ ...inputStyle, background: "#fff" }}
            >
              <option value="active">● Active</option>
              <option value="draft">○ Draft</option>
              <option value="archived">✕ Archived</option>
            </select>
            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button
                onClick={handleSave}
                disabled={isSaving || saveSuccess}
                style={{ flex: 1, padding: "10px", background: saveSuccess ? "#059669" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: (isSaving || saveSuccess) ? "not-allowed" : "pointer", fontSize: "14px", opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? "Saving…" : saveSuccess ? "Saved!" : "Save"}
              </button>
              <button
                onClick={() => router.push(`/products/${product.slug}`)}
                style={{ padding: "10px 14px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px" }}
              >
                👁
              </button>
            </div>
          </div>

          {/* Product Organization */}
          <div style={sectionCard}>
            <span style={sectionTitle}>PRODUCT ORGANIZATION</span>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Product Type</label>
              <input
                value={product.product_type ?? ""}
                onChange={e => setProduct(p => p ? { ...p, product_type: e.target.value } : p)}
                placeholder="e.g. T-Shirt, Hoodie"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Vendor</label>
              <input
                value={product.vendor ?? ""}
                onChange={e => setProduct(p => p ? { ...p, vendor: e.target.value } : p)}
                placeholder="e.g. AF Apparels"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Gender</label>
              <select
                value={(product as any).gender ?? ""}
                onChange={e => setProduct(p => p ? { ...p, gender: e.target.value } as any : p)}
                style={{ ...inputStyle, background: "#fff" }}
              >
                <option value="">Select gender…</option>
                <option value="mens">Men's</option>
                <option value="womens">Women's</option>
                <option value="youth">Youth</option>
                <option value="unisex">Unisex</option>
              </select>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Fabric</label>
              <input
                value={(product as any).fabric ?? ""}
                onChange={e => setProduct(p => p ? { ...p, fabric: e.target.value } as any : p)}
                placeholder="e.g. 100% Cotton, 50/50 Cotton-Poly"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Product Code</label>
              <input
                value={(product as any).product_code ?? ""}
                onChange={e => setProduct(p => p ? { ...p, product_code: e.target.value } as any : p)}
                placeholder="e.g. G5000, PC61"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Weight (g)</label>
              <input
                value={(product as any).weight ?? ""}
                onChange={e => setProduct(p => p ? { ...p, weight: e.target.value } as any : p)}
                placeholder="e.g. 150, 175"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Category</label>
              <select
                value={product.categories?.[0]?.id ?? ""}
                onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setProduct(p => p ? { ...p, categories: cat ? [cat] : [] } : p);
                }}
                style={{ ...inputStyle, background: "#fff" }}
              >
                <option value="">Select category…</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tags</label>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "8px", minHeight: "44px", cursor: "text" }}
                onClick={e => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
              >
                {(product.tags ?? []).map(tag => (
                  <span key={tag} style={{ background: "#F4F3EF", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "14px", lineHeight: 1, padding: 0 }}
                    >×</button>
                  </span>
                ))}
                <input
                  placeholder={product.tags?.length ? "" : "Add tag…"}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(e.currentTarget.value.replace(",", "").trim());
                      e.currentTarget.value = "";
                    }
                  }}
                  style={{ border: "none", outline: "none", fontSize: "13px", minWidth: "100px", fontFamily: "var(--font-jakarta)", flexGrow: 1 }}
                />
              </div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Press Enter or comma to add</div>
            </div>
          </div>

          {/* Product Tabs Content */}
          <div style={sectionCard}>
            <span style={sectionTitle}>PRODUCT TABS CONTENT</span>
            <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "20px", marginTop: "-8px" }}>
              This content appears in the Description, Print Guide, and Size Chart tabs on the product page.
            </p>

            {/* Care Instructions */}
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Care Instructions</label>
              <textarea
                rows={4}
                value={(product as any).care_instructions ?? ""}
                onChange={e => setProduct(p => p ? { ...p, care_instructions: e.target.value } as any : p)}
                placeholder="e.g. Machine wash cold, tumble dry low, do not bleach…"
                style={{ ...inputStyle, resize: "vertical" }}
              />
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px" }}>Appears in the Specifications tab.</div>
            </div>

            {/* Print Guide */}
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Print Guide — Supported Methods</label>
              <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {["DTF (Direct to Film)", "Screen Printing", "Embroidery", "DTG (Direct to Garment)", "Heat Transfer", "Sublimation", "Vinyl / HTV", "Laser Engraving"].map(method => {
                  const methods: string[] = ((product as any).print_guide as any)?.methods ?? [];
                  const checked = methods.includes(method);
                  return (
                    <label key={method} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830", cursor: "pointer", padding: "6px 10px", border: `1.5px solid ${checked ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", background: checked ? "rgba(26,92,255,.05)" : "#fff", transition: "all .15s" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const cur: string[] = ((product as any).print_guide as any)?.methods ?? [];
                          const next = e.target.checked ? [...cur, method] : cur.filter(m => m !== method);
                          setProduct(p => p ? { ...p, print_guide: { ...((p as any).print_guide ?? {}), methods: next } } as any : p);
                        }}
                        style={{ accentColor: "#1A5CFF" }}
                      />
                      {method}
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>Checked methods appear as green ticks in the Print Guide tab.</div>
            </div>

            {/* Size Chart */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Size Chart</label>
                <button
                  type="button"
                  onClick={() => {
                    const rows: any[] = ((product as any).size_chart_data as any) ?? [];
                    setProduct(p => p ? { ...p, size_chart_data: [...rows, { size: "", chest: "", length: "", sleeve: "" }] } as any : p);
                  }}
                  style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  + Add Row
                </button>
              </div>

              {(((product as any).size_chart_data as any[]) ?? []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", border: "1.5px dashed #E2E0DA", borderRadius: "8px", color: "#aaa", fontSize: "13px" }}>
                  No size chart rows yet. Click + Add Row to build one.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#F4F3EF" }}>
                        {["Size", "Chest (in)", "Length (in)", "Sleeve (in)", ""].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(((product as any).size_chart_data as any[]) ?? []).map((row: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                          {(["size", "chest", "length", "sleeve"] as const).map(field => (
                            <td key={field} style={{ padding: "4px 6px" }}>
                              <input
                                value={row[field] ?? ""}
                                onChange={e => {
                                  const rows = [...(((product as any).size_chart_data as any[]) ?? [])];
                                  rows[i] = { ...rows[i], [field]: e.target.value };
                                  setProduct(p => p ? { ...p, size_chart_data: rows } as any : p);
                                }}
                                placeholder={field === "size" ? "XL" : "—"}
                                style={{ width: "100%", padding: "5px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", fontFamily: "var(--font-jakarta)", outline: "none" }}
                              />
                            </td>
                          ))}
                          <td style={{ padding: "4px 6px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                const rows = (((product as any).size_chart_data as any[]) ?? []).filter((_: any, idx: number) => idx !== i);
                                setProduct(p => p ? { ...p, size_chart_data: rows } as any : p);
                              }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "16px", lineHeight: 1, padding: "0 4px" }}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>This table appears in the Size Chart tab on the product page.</div>
            </div>
          </div>

          {/* SEO */}
          <div style={sectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ ...sectionTitle, marginBottom: 0 }}>SEARCH ENGINE LISTING</span>
              <button
                onClick={() => setEditSEO(v => !v)}
                style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
              >
                {editSEO ? "Preview" : "Edit"}
              </button>
            </div>

            {editSEO ? (
              <div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelStyle}>SEO Title</label>
                  <input
                    value={product.meta_title ?? product.name ?? ""}
                    onChange={e => setProduct(p => p ? { ...p, meta_title: e.target.value } : p)}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: "11px", marginTop: "3px", color: (product.meta_title ?? product.name ?? "").length > 60 ? "#E8242A" : "#aaa" }}>
                    {(product.meta_title ?? product.name ?? "").length}/60 characters
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Meta Description</label>
                  <textarea
                    value={product.meta_description ?? ""}
                    onChange={e => setProduct(p => p ? { ...p, meta_description: e.target.value } : p)}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                  <div style={{ fontSize: "11px", marginTop: "3px", color: (product.meta_description ?? "").length > 160 ? "#E8242A" : "#aaa" }}>
                    {(product.meta_description ?? "").length}/160 characters
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", padding: "14px 16px", background: "#FAFAFA" }}>
                <div style={{ fontSize: "11px", color: "#059669", marginBottom: "3px" }}>
                  af-apparel.com/products/{product.slug}
                </div>
                <div style={{ fontSize: "16px", color: "#1a0dab", marginBottom: "4px", fontWeight: 400 }}>
                  {product.meta_title ?? product.name}
                </div>
                <div style={{ fontSize: "13px", color: "#545454", lineHeight: 1.5 }}>
                  {product.meta_description ?? product.description?.slice(0, 160) ?? "No description"}
                </div>
              </div>
            )}
          </div>

          {/* Marketing Flyer */}
          <div style={sectionCard}>
            <span style={sectionTitle}>MARKETING FLYER</span>
            {(() => {
              const flyer = product?.assets?.find((a: any) => a.asset_type === "flyer");
              return (
                <>
                  {flyer && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#FAFAFA", marginBottom: "12px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8242A" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{flyer.file_name}</div>
                        <div style={{ fontSize: "11px", color: "#7A7880" }}>PDF Flyer</div>
                      </div>
                      <a href={flyer.url} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "#1A5CFF", fontWeight: 700, whiteSpace: "nowrap" }}>View</a>
                      <button onClick={handleDeleteFlyer} style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", padding: "2px 4px", fontSize: "16px", lineHeight: 1 }}>×</button>
                    </div>
                  )}
                  <input ref={flyerInputRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handleFlyerUpload} />
                  <button
                    onClick={() => flyerInputRef.current?.click()}
                    disabled={uploadingFlyer}
                    style={{ width: "100%", padding: "10px", border: "1.5px dashed #E2E0DA", borderRadius: "8px", background: uploadingFlyer ? "#f9fafb" : "#fff", cursor: uploadingFlyer ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 600, color: uploadingFlyer ? "#aaa" : "#1A5CFF", fontFamily: "var(--font-jakarta)" }}
                  >
                    {uploadingFlyer ? "Uploading…" : flyer ? "Replace Flyer (PDF)" : "Upload Flyer (PDF)"}
                  </button>
                  {flyerMsg && (
                    <p style={{ marginTop: "8px", fontSize: "12px", color: flyerMsg.includes("success") ? "#059669" : "#E8242A" }}>{flyerMsg}</p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Danger Zone */}
          <div style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: "10px", padding: "20px" }}>
            <span style={{ ...sectionTitle, color: "#E8242A", marginBottom: "12px" }}>DANGER ZONE</span>
            <button
              onClick={async () => {
                if (!product || !confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
                await adminService.deleteProduct(product.id);
                router.push("/admin/products");
              }}
              style={{ width: "100%", padding: "10px", background: "rgba(232,36,42,.08)", color: "#E8242A", border: "1px solid #FECACA", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              <TrashIcon size={14} color="#E8242A" /> Delete Product
            </button>
          </div>

        </div>
      </div>

      {/* ── Add Variant Modal ──────────────────────────────────────── */}
      {showAddVariant && (() => {
        const parsedColors = bulkColors.split(",").map(c => c.trim()).filter(Boolean);
        const willCreate = parsedColors.length * bulkSizes.length;
        const ALL_SIZES = ["XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "One Size"];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#fff", borderRadius: "12px", width: "540px", maxHeight: "90vh", overflowY: "auto", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em" }}>ADD VARIANTS</h3>
                <button onClick={() => { setShowAddVariant(false); setBulkColors(""); setBulkSizes([]); setBulkPrice(""); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
              </div>

              {/* Colors */}
              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>Colors <span style={{ color: "#E8242A" }}>*</span></label>
                <input
                  value={bulkColors}
                  onChange={e => setBulkColors(e.target.value)}
                  placeholder="Navy, Black, White, Red, Forest…"
                  style={inputStyle}
                />
                <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>Separate multiple colors with commas</p>
                {parsedColors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                    {parsedColors.map(c => (
                      <span key={c} style={{ display: "flex", alignItems: "center", gap: "5px", background: "#F4F3EF", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: COLOR_MAP[c] ?? "#888", border: "1px solid rgba(0,0,0,.1)", display: "inline-block", flexShrink: 0 }} />
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Sizes */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ ...labelStyle, marginBottom: "10px" }}>Sizes <span style={{ color: "#E8242A" }}>*</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {ALL_SIZES.map(s => {
                    const checked = bulkSizes.includes(s);
                    return (
                      <label key={s} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", border: `1.5px solid ${checked ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: checked ? 700 : 500, background: checked ? "rgba(26,92,255,.06)" : "#fff", color: checked ? "#1A5CFF" : "#2A2830", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setBulkSizes(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                          style={{ display: "none" }}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                  <button onClick={() => setBulkSizes(ALL_SIZES)} style={{ fontSize: "11px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>Select All</button>
                  <button onClick={() => setBulkSizes([])} style={{ fontSize: "11px", color: "#7A7880", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Clear</button>
                </div>
              </div>

              {/* Price */}
              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>Price ($)</label>
                <input
                  type="number"
                  value={bulkPrice}
                  onChange={e => setBulkPrice(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inputStyle, width: "140px" }}
                />
              </div>

              {/* Preview */}
              {willCreate > 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.2)", borderRadius: "6px", fontSize: "13px", color: "#059669", fontWeight: 600, marginBottom: "16px" }}>
                  Will create {willCreate} variant{willCreate !== 1 ? "s" : ""} ({parsedColors.length} color{parsedColors.length !== 1 ? "s" : ""} × {bulkSizes.length} size{bulkSizes.length !== 1 ? "s" : ""})
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowAddVariant(false); setBulkColors(""); setBulkSizes([]); setBulkPrice(""); }}
                  style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddVariants}
                  disabled={addingVariant || !parsedColors.length || !bulkSizes.length}
                  style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px", opacity: (addingVariant || !parsedColors.length || !bulkSizes.length) ? 0.6 : 1 }}
                >
                  {addingVariant ? "Adding…" : `Add ${willCreate || ""} Variant${willCreate !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
