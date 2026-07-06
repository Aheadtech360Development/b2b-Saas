"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { productsService } from "@/services/products.service";
import { apiClient } from "@/lib/api-client";
import dynamic from "next/dynamic";
import type { Category } from "@/types/product.types";

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
  padding: "10px 12px", textAlign: "left", fontSize: "11px", textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
};

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

const ALL_SIZES = ["XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "One Size"];

interface PendingVariant {
  id: string;
  color: string;
  size: string;
  price: string;
  sku: string;
}

interface SizeChartRow {
  size: string;
  chest: string;
  length: string;
  sleeve: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flyerInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Media
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // Flyer
  const [pendingFlyer, setPendingFlyer] = useState<File | null>(null);

  // Tags
  const [tagInput, setTagInput] = useState("");

  // SEO toggle
  const [editSEO, setEditSEO] = useState(false);

  // Variant modal
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [bulkColors, setBulkColors] = useState("");
  const [bulkSizes, setBulkSizes] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [pendingVariants, setPendingVariants] = useState<PendingVariant[]>([]);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    status: "draft",
    product_type: "",
    vendor: "",
    gender: "",
    fabric: "",
    product_code: "",
    weight: "",
    category_id: "",
    tags: [] as string[],
    meta_title: "",
    meta_description: "",
    care_instructions: "",
    print_guide_methods: [] as string[],
    size_chart_data: [] as SizeChartRow[],
  });

  useEffect(() => {
    productsService.getCategories().then(cats => setCategories(cats ?? [])).catch(() => {});
  }, []);

  function setField(name: string, value: unknown) {
    setForm(prev => {
      const updated = { ...prev, [name]: value } as typeof prev;
      if (name === "name") {
        const autoSlug = (value as string).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (prev.slug === prev.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")) {
          updated.slug = autoSlug;
        }
      }
      return updated;
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setField(e.target.name, e.target.value);
  }

  function addTag() {
    const t = tagInput.trim().replace(/,/g, "");
    if (!t || form.tags.includes(t)) { setTagInput(""); return; }
    setForm(p => ({ ...p, tags: [...p.tags, t] }));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }));
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPendingImages(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setImagePreviewUrls(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removePendingImage(index: number) {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index));
  }

  function handleFlyerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPendingFlyer(file);
    e.target.value = "";
  }

  function handleAddVariants() {
    const colors = bulkColors.split(",").map(c => c.trim()).filter(Boolean);
    if (!colors.length || !bulkSizes.length) return;
    const productCode = form.name.split(" ").map(w => w[0] ?? "").join("").toUpperCase() || "SKU";
    const newRows: PendingVariant[] = [];
    for (const color of colors) {
      for (const size of bulkSizes) {
        const colorCode = color.slice(0, 3).toUpperCase();
        const sizeCode = size.toUpperCase().replace(/\//g, "");
        newRows.push({
          id: crypto.randomUUID(),
          color,
          size,
          price: bulkPrice,
          sku: `${productCode}-${colorCode}-${sizeCode}-${Date.now().toString(36).toUpperCase()}`,
        });
      }
    }
    setPendingVariants(prev => [...prev, ...newRows]);
    setBulkColors(""); setBulkSizes([]); setBulkPrice("");
    setShowAddVariant(false);
  }

  function removePendingVariant(id: string) {
    setPendingVariants(prev => prev.filter(v => v.id !== id));
  }

  function addSizeChartRow() {
    setForm(p => ({ ...p, size_chart_data: [...p.size_chart_data, { size: "", chest: "", length: "", sleeve: "" }] }));
  }

  function removeSizeChartRow(i: number) {
    setForm(p => ({ ...p, size_chart_data: p.size_chart_data.filter((_, idx) => idx !== i) }));
  }

  function updateSizeChartRow(i: number, field: keyof SizeChartRow, value: string) {
    setForm(p => {
      const rows = [...p.size_chart_data];
      rows[i] = { ...rows[i], [field]: value } as SizeChartRow;
      return { ...p, size_chart_data: rows };
    });
  }

  function togglePrintMethod(method: string) {
    setForm(p => {
      const cur = p.print_guide_methods;
      const next = cur.includes(method) ? cur.filter(m => m !== method) : [...cur, method];
      return { ...p, print_guide_methods: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description || null,
        status: form.status,
        product_type: form.product_type || null,
        vendor: form.vendor || null,
        gender: form.gender || null,
        fabric: form.fabric || null,
        product_code: form.product_code || null,
        weight: form.weight || null,
        tags: form.tags.length ? form.tags : null,
        category_ids: form.category_id ? [form.category_id] : [],
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        care_instructions: form.care_instructions || null,
        print_guide: form.print_guide_methods.length ? { methods: form.print_guide_methods } : null,
        size_chart_data: form.size_chart_data.length ? form.size_chart_data : null,
      };

      const product = await adminService.createProduct(payload) as { id: string; slug: string };

      // Upload images
      for (const file of pendingImages) {
        await adminService.uploadImage(product.id, file).catch(() => {});
      }

      // Create variants
      for (const v of pendingVariants) {
        await apiClient.post(`/api/v1/admin/products/${product.id}/variants`, {
          sku: v.sku,
          color: v.color,
          size: v.size,
          retail_price: parseFloat(v.price) || 0,
          status: "active",
        }).catch(() => {});
      }

      // Upload flyer
      if (pendingFlyer) {
        const fd = new FormData();
        fd.append("file", pendingFlyer);
        await apiClient.postForm(`/api/v1/admin/products/${product.id}/upload-flyer`, fd).catch(() => {});
      }

      setSuccess(true);
      setTimeout(() => router.push("/admin/products"), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create product");
      setSaving(false);
    }
  }

  // Group pending variants by color for display
  const variantsByColor: Record<string, PendingVariant[]> = {};
  pendingVariants.forEach(v => {
    if (!variantsByColor[v.color]) variantsByColor[v.color] = [];
    variantsByColor[v.color]!.push(v);
  });

  const parsedBulkColors = bulkColors.split(",").map(c => c.trim()).filter(Boolean);
  const willCreate = parsedBulkColors.length * bulkSizes.length;

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <button
            onClick={() => router.push("/admin/products")}
            style={{ background: "none", border: "none", color: "#7A7880", cursor: "pointer", fontSize: "13px", padding: 0, marginBottom: "4px" }}
          >
            ← Products
          </button>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>
            ADD PRODUCT
          </h1>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => router.push("/admin/products")}
            style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            form="new-product-form"
            type="submit"
            disabled={saving || success || !form.name.trim() || !form.slug.trim()}
            style={{ padding: "10px 24px", background: success ? "#059669" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: (saving || success || !form.name.trim() || !form.slug.trim()) ? "not-allowed" : "pointer", opacity: (saving || success || !form.name.trim() || !form.slug.trim()) ? 0.6 : 1, fontSize: "14px" }}
          >
            {saving ? "Creating…" : success ? "Created!" : "Create Product"}
          </button>
        </div>
      </div>

      {success && (
        <div style={{ background: "rgba(5,150,105,.08)", border: "1px solid rgba(5,150,105,.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#059669", fontWeight: 600 }}>
          ✓ Product created successfully! Redirecting to product list…
        </div>
      )}
      {error && (
        <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E8242A" }}>
          {error}
        </div>
      )}

      <form id="new-product-form" onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px", alignItems: "start" }}>

          {/* ── LEFT COLUMN ── */}
          <div>

            {/* Title & Description */}
            <div style={sectionCard}>
              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>Product Name <span style={{ color: "#E8242A" }}>*</span></label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Classic Cotton T-Shirt"
                  style={{ ...inputStyle, fontSize: "16px", fontWeight: 600 }}
                />
              </div>
              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>URL Slug <span style={{ color: "#E8242A" }}>*</span></label>
                <input
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                  required
                  placeholder="e.g. classic-cotton-t-shirt"
                  style={inputStyle}
                />
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Auto-generated from name. Must be unique.</div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <RichTextEditor
                  value={form.description}
                  onChange={val => setForm(p => ({ ...p, description: val }))}
                  placeholder="Describe this product — fabric details, print compatibility, sizing notes…"
                />
              </div>
            </div>

            {/* Media */}
            <div style={sectionCard}>
              <span style={sectionTitle}>MEDIA</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                {imagePreviewUrls.map((url, i) => (
                  <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px 12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: i === 0 ? "rgba(26,92,255,.03)" : "#fff" }}>
                    <div style={{ width: "64px", height: "64px", borderRadius: "6px", overflow: "hidden", flexShrink: 0, border: "1px solid #E2E0DA", background: "#f5f5f5" }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ background: i === 0 ? "#1A5CFF" : "#F4F3EF", color: i === 0 ? "#fff" : "#7A7880", fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "3px" }}>
                        {i === 0 ? "★ PRIMARY" : `Image ${i + 1}`}
                      </span>
                      <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>{pendingImages[i]?.name}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingImage(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "18px", lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                    >×</button>
                  </div>
                ))}
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ borderRadius: "8px", border: "2px dashed #E2E0DA", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", background: "#FAFAFA", padding: "16px", transition: "border-color .2s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A5CFF")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E2E0DA")}
              >
                <span style={{ fontSize: "20px", color: "#aaa" }}>+</span>
                <span style={{ fontSize: "13px", color: "#7A7880" }}>Add media</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageSelect} />
              <p style={{ fontSize: "11px", color: "#aaa", marginTop: "8px" }}>Images are uploaded after creation. First image becomes primary.</p>
            </div>

            {/* Variants */}
            <div style={sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ ...sectionTitle, marginBottom: 0 }}>VARIANTS</span>
                <button
                  type="button"
                  onClick={() => setShowAddVariant(true)}
                  style={{ padding: "6px 14px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                >
                  + Add Variants
                </button>
              </div>
              <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "-4px", marginBottom: "14px" }}>
                Generate color/size combinations. You can add more variants after creation.
              </p>

              {pendingVariants.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", border: "1.5px dashed #E2E0DA", borderRadius: "8px", color: "#aaa", fontSize: "13px" }}>
                  No variants added yet. Click <strong>+ Add Variants</strong> to generate color/size combinations.
                </div>
              ) : (
                <div>
                  {Object.entries(variantsByColor).map(([color, rows]) => (
                    <div key={color} style={{ border: "1px solid #E2E0DA", borderRadius: "8px", marginBottom: "10px", overflow: "hidden" }}>
                      {/* Color header */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#F4F3EF" }}>
                        <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: COLOR_MAP[color] ?? "#888", border: "1.5px solid rgba(0,0,0,.1)", flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>{color}</span>
                        <span style={{ fontSize: "12px", color: "#7A7880" }}>({rows.length} size{rows.length !== 1 ? "s" : ""})</span>
                      </div>
                      {/* Size rows */}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #E2E0DA" }}>
                            {["Size", "SKU", "Price", ""].map(h => (
                              <th key={h} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(v => (
                            <tr key={v.id} style={{ borderBottom: "1px solid #F4F3EF" }}>
                              <td style={{ padding: "8px 12px", fontWeight: 700 }}>{v.size}</td>
                              <td style={{ padding: "8px 12px", color: "#7A7880", fontSize: "12px" }}>{v.sku}</td>
                              <td style={{ padding: "8px 12px" }}>{v.price ? `$${v.price}` : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                <button
                                  type="button"
                                  onClick={() => removePendingVariant(v.id)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "16px", lineHeight: 1, padding: "0 4px" }}
                                >×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div style={{ fontSize: "11px", color: "#aaa", marginTop: "8px" }}>
                    {pendingVariants.length} variant{pendingVariants.length !== 1 ? "s" : ""} will be created after saving.
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div>

            {/* Status */}
            <div style={sectionCard}>
              <span style={sectionTitle}>STATUS</span>
              <select name="status" value={form.status} onChange={handleChange} style={{ ...inputStyle, background: "#fff" }}>
                <option value="draft">○ Draft</option>
                <option value="active">● Active</option>
              </select>
              <div style={{ marginTop: "12px" }}>
                <button
                  form="new-product-form"
                  type="submit"
                  disabled={saving || success || !form.name.trim() || !form.slug.trim()}
                  style={{ width: "100%", padding: "10px", background: success ? "#059669" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: (saving || success || !form.name.trim() || !form.slug.trim()) ? "not-allowed" : "pointer", fontSize: "14px", opacity: (saving || success || !form.name.trim() || !form.slug.trim()) ? 0.6 : 1 }}
                >
                  {saving ? "Creating…" : success ? "Created!" : "Create Product"}
                </button>
              </div>
            </div>

            {/* Product Organization */}
            <div style={sectionCard}>
              <span style={sectionTitle}>PRODUCT ORGANIZATION</span>

              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Product Type</label>
                <input name="product_type" value={form.product_type} onChange={handleChange} placeholder="e.g. T-Shirt, Hoodie" style={inputStyle} />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Vendor</label>
                <input name="vendor" value={form.vendor} onChange={handleChange} placeholder="e.g. AF Apparels" style={inputStyle} />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Gender</label>
                <select name="gender" value={form.gender} onChange={handleChange} style={{ ...inputStyle, background: "#fff" }}>
                  <option value="">Select gender…</option>
                  <option value="mens">Men's</option>
                  <option value="womens">Women's</option>
                  <option value="youth">Youth</option>
                  <option value="unisex">Unisex</option>
                </select>
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Fabric</label>
                <input name="fabric" value={form.fabric} onChange={handleChange} placeholder="e.g. 100% Cotton, 50/50 Cotton-Poly" style={inputStyle} />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Product Code</label>
                <input name="product_code" value={form.product_code} onChange={handleChange} placeholder="e.g. G5000, PC61" style={inputStyle} />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Weight (g)</label>
                <input name="weight" value={form.weight} onChange={handleChange} placeholder="e.g. 150, 175" style={inputStyle} />
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Category</label>
                <select name="category_id" value={form.category_id} onChange={handleChange} style={{ ...inputStyle, background: "#fff" }}>
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
                  {form.tags.map(tag => (
                    <span key={tag} style={{ background: "#F4F3EF", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "14px", lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                    onBlur={addTag}
                    placeholder={form.tags.length ? "" : "Add tag…"}
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
                Appears in the Description, Print Guide, and Size Chart tabs on the product page.
              </p>

              {/* Care Instructions */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Care Instructions</label>
                <textarea
                  rows={4}
                  name="care_instructions"
                  value={form.care_instructions}
                  onChange={handleChange}
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
                    const checked = form.print_guide_methods.includes(method);
                    return (
                      <label key={method} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830", cursor: "pointer", padding: "6px 10px", border: `1.5px solid ${checked ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", background: checked ? "rgba(26,92,255,.05)" : "#fff", transition: "all .15s" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePrintMethod(method)}
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
                    onClick={addSizeChartRow}
                    style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    + Add Row
                  </button>
                </div>
                {form.size_chart_data.length === 0 ? (
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
                        {form.size_chart_data.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                            {(["size", "chest", "length", "sleeve"] as const).map(field => (
                              <td key={field} style={{ padding: "4px 6px" }}>
                                <input
                                  value={row[field]}
                                  onChange={e => updateSizeChartRow(i, field, e.target.value)}
                                  placeholder={field === "size" ? "XL" : "—"}
                                  style={{ width: "100%", padding: "5px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", fontFamily: "var(--font-jakarta)", outline: "none" }}
                                />
                              </td>
                            ))}
                            <td style={{ padding: "4px 6px" }}>
                              <button
                                type="button"
                                onClick={() => removeSizeChartRow(i)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "16px", lineHeight: 1, padding: "0 4px" }}
                              >×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>Appears in the Size Chart tab on the product page.</div>
              </div>
            </div>

            {/* SEO */}
            <div style={sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <span style={{ ...sectionTitle, marginBottom: 0 }}>SEARCH ENGINE LISTING</span>
                <button
                  type="button"
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
                      name="meta_title"
                      value={form.meta_title}
                      onChange={handleChange}
                      placeholder={form.name || "Product title"}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: "11px", marginTop: "3px", color: (form.meta_title || form.name).length > 60 ? "#E8242A" : "#aaa" }}>
                      {(form.meta_title || form.name).length}/60 characters
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Meta Description</label>
                    <textarea
                      name="meta_description"
                      value={form.meta_description}
                      onChange={handleChange}
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                    <div style={{ fontSize: "11px", marginTop: "3px", color: form.meta_description.length > 160 ? "#E8242A" : "#aaa" }}>
                      {form.meta_description.length}/160 characters
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", padding: "14px 16px", background: "#FAFAFA" }}>
                  <div style={{ fontSize: "11px", color: "#059669", marginBottom: "3px" }}>
                    af-apparel.com/products/{form.slug || "product-slug"}
                  </div>
                  <div style={{ fontSize: "16px", color: "#1a0dab", marginBottom: "4px", fontWeight: 400 }}>
                    {form.meta_title || form.name || "Product Title"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#545454", lineHeight: 1.5 }}>
                    {form.meta_description || form.description?.replace(/<[^>]+>/g, "").slice(0, 160) || "No description"}
                  </div>
                </div>
              )}
            </div>

            {/* Marketing Flyer */}
            <div style={sectionCard}>
              <span style={sectionTitle}>MARKETING FLYER</span>
              {pendingFlyer && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#FAFAFA", marginBottom: "12px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8242A" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFlyer.name}</div>
                    <div style={{ fontSize: "11px", color: "#7A7880" }}>PDF Flyer — will upload after creation</div>
                  </div>
                  <button type="button" onClick={() => setPendingFlyer(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "16px", lineHeight: 1, padding: "2px 4px" }}>×</button>
                </div>
              )}
              <input ref={flyerInputRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handleFlyerSelect} />
              <button
                type="button"
                onClick={() => flyerInputRef.current?.click()}
                style={{ width: "100%", padding: "10px", border: "1.5px dashed #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#1A5CFF", fontFamily: "var(--font-jakarta)" }}
              >
                {pendingFlyer ? "Replace Flyer (PDF)" : "Upload Flyer (PDF)"}
              </button>
            </div>

          </div>
        </div>
      </form>

      {/* ── Add Variants Modal ── */}
      {showAddVariant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "540px", maxHeight: "90vh", overflowY: "auto", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em" }}>ADD VARIANTS</h3>
              <button type="button" onClick={() => { setShowAddVariant(false); setBulkColors(""); setBulkSizes([]); setBulkPrice(""); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
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
              {parsedBulkColors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {parsedBulkColors.map(c => (
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
                <button type="button" onClick={() => setBulkSizes(ALL_SIZES)} style={{ fontSize: "11px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>Select All</button>
                <button type="button" onClick={() => setBulkSizes([])} style={{ fontSize: "11px", color: "#7A7880", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Clear</button>
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
                Will create {willCreate} variant{willCreate !== 1 ? "s" : ""} ({parsedBulkColors.length} color{parsedBulkColors.length !== 1 ? "s" : ""} × {bulkSizes.length} size{bulkSizes.length !== 1 ? "s" : ""})
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setShowAddVariant(false); setBulkColors(""); setBulkSizes([]); setBulkPrice(""); }}
                style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddVariants}
                disabled={!parsedBulkColors.length || !bulkSizes.length}
                style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px", opacity: (!parsedBulkColors.length || !bulkSizes.length) ? 0.6 : 1 }}
              >
                {willCreate > 0 ? `Add ${willCreate} Variant${willCreate !== 1 ? "s" : ""}` : "Add Variants"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
