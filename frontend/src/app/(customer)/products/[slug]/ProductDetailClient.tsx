// frontend/src/app/%28customer%29/products/%5Bslug%5D/ProductDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SIZE_ORDER } from "@/lib/utils";
import type { ProductDetail, ProductVariant } from "@/types/product.types";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";
import { productsService } from "@/services/products.service";

function formatWeightGrams(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes("oz")) {
    const num = parseFloat(s);
    return isNaN(num) ? raw : `${Math.round(num * 28.3495)}g`;
  }
  return s.endsWith("g") ? raw : `${raw}g`;
}

// interface ProductDetailClientProps {
//   product: ProductDetail;
// }

interface ProductDetailClientProps {
  slug: string;
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

const TABS = ["Description", "Specifications", "Size Chart", "Reviews"] as const;
type Tab = (typeof TABS)[number];

// ── Reviews Tab ───────────────────────────────────────────────────────────────

interface ReviewData {
  id: string; rating: number; title: string | null; body: string;
  reviewer_name: string; reviewer_company: string | null;
  is_verified: boolean; image_url?: string | null; created_at: string;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= rating ? "#f69d0b" : "#E2E0DA"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

function ReviewsTab({ productId, isAuthenticated }: { productId: string; isAuthenticated: boolean }) {
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [total, setTotal] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ rating: 5, title: "", body: "", reviewer_name: "", reviewer_company: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);


  async function fetchReviews() {
    setLoading(true);
    try {
      const data = await apiClient.get<{ reviews: ReviewData[]; total: number; avg_rating: number }>(
        `/api/v1/products/${productId}/reviews`
      );
      setReviews(data.reviews ?? []);
      setTotal(data.total ?? 0);
      setAvgRating(data.avg_rating ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchReviews(); }, [productId]); // eslint-disable-line

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reviewer_name.trim() || !form.body.trim()) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      let image_url: string | null = null;

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        try {
          const uploadRes = await apiClient.postForm<{ url: string }>("/api/v1/reviews/upload-image", fd);
          image_url = uploadRes.url;
        } catch {
          // Image upload failed — submit review without image
        }
      }

      await apiClient.post(`/api/v1/products/${productId}/reviews`, {
        rating: form.rating,
        title: form.title || null,
        body: form.body,
        reviewer_name: form.reviewer_name,
        reviewer_company: form.reviewer_company || null,
        image_url,
      });
      setSubmitMsg({ type: "success", text: "Review submitted! Thank you." });
      setForm({ rating: 5, title: "", body: "", reviewer_name: "", reviewer_company: "" });
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      await fetchReviews();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setSubmitMsg({ type: "error", text: msg });
    }
    finally { setSubmitting(false); }
  }

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-jakarta)" };
  const starCounts = [5, 4, 3, 2, 1].map(s => ({ star: s, count: reviews.filter(r => r.rating === s).length }));

  return (
    <div style={{ maxWidth: "720px" }}>
      {/* Summary bar */}
      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px 24px", background: "#F4F3EF", borderRadius: "10px", marginBottom: "24px", border: "1px solid #E2E0DA" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-bebas)", fontSize: "52px", color: "#2A2830", lineHeight: 1 }}>{avgRating.toFixed(1)}</div>
            <StarRow rating={Math.round(avgRating)} />
            <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "4px" }}>{total} review{total !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ flex: 1 }}>
            {starCounts.map(({ star, count }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#7A7880", width: "8px" }}>{star}</span>
                  <div style={{ flex: 1, height: "6px", background: "#E2E0DA", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#f69d0b", borderRadius: "3px" }} />
                  </div>
                  <span style={{ fontSize: "11px", color: "#7A7880", width: "28px" }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#2A2830" }}>
          {loading ? "Loading reviews…" : total === 0 ? "No reviews yet" : `${total} Review${total !== 1 ? "s" : ""}`}
        </div>
        {isAuthenticated && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ padding: "9px 18px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            Write a Review
          </button>
        )}
        {!isAuthenticated && (
          <a
            href="/login"
            style={{ padding: "9px 18px", background: "#f4f3ef", color: "#1B3A5C", border: "1.5px solid #1B3A5C", borderRadius: "7px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
          >
            Log in to Write a Review →
          </a>
        )}
      </div>

      {/* Submit form — only shown when logged in */}
      {isAuthenticated && showForm && (
        <form onSubmit={handleSubmit} style={{ background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "20px 22px", marginBottom: "24px" }}>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "18px", letterSpacing: ".04em", color: "#2A2830", marginBottom: "16px" }}>YOUR REVIEW</div>

          {/* Star picker */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "6px" }}>Rating *</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, rating: s }))} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill={s <= form.rating ? "#f69d0b" : "#E2E0DA"} style={{ transition: "fill .1s" }}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Your Name *</div>
              <input style={inp} value={form.reviewer_name} onChange={e => setForm(f => ({ ...f, reviewer_name: e.target.value }))} placeholder="John Smith" required />
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Company (optional)</div>
              <input style={inp} value={form.reviewer_company} onChange={e => setForm(f => ({ ...f, reviewer_company: e.target.value }))} placeholder="Acme Shirts Co." />
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Review Title (optional)</div>
            <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Great quality blanks" />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Review *</div>
            <textarea style={{ ...inp, minHeight: "100px", resize: "vertical" }} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Share your experience with this product…" required minLength={10} />
          </div>

          {/* Image upload */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Photo (optional)</div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: "1.5px dashed #f69d0b", borderRadius: "7px", cursor: "pointer", fontSize: "13px", color: "#7A7880", fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
              {imageFile ? imageFile.name : "Upload a photo"}
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
            </label>
            {imagePreview && (
              <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
                <img src={imagePreview} alt="Preview" style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #E2E0DA" }} />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ fontSize: "12px", color: "#E8242A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Remove</button>
              </div>
            )}
          </div>

          {submitMsg && (
            <div style={{ padding: "10px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, marginBottom: "12px", background: submitMsg.type === "success" ? "rgba(5,150,105,.08)" : "rgba(232,36,42,.08)", color: submitMsg.type === "success" ? "#059669" : "#E8242A" }}>
              {submitMsg.text}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" onClick={() => { setShowForm(false); setImageFile(null); setImagePreview(null); }} style={{ padding: "10px 18px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !form.reviewer_name.trim() || form.body.trim().length < 10}
              style={{ padding: "10px 24px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: (!form.reviewer_name.trim() || form.body.trim().length < 10) ? 0.5 : 1 }}>
              {submitting ? "Submitting…" : "Submit Review"}
            </button>
          </div>
        </form>
      )}

      {/* Review list */}
      {!loading && reviews.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "40px", background: "#F4F3EF", borderRadius: "10px", color: "#7A7880" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>★</div>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Be the first to review</div>
          <div style={{ fontSize: "13px" }}>Share your experience with this product.</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {reviews.map(r => (
          <div key={r.id} style={{ padding: "18px 20px", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px" }}>
            {/* Name at top */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#F4F3EF", border: "1px solid #E2E0DA", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px", color: "#2A2830", flexShrink: 0 }}>
                  {r.reviewer_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>
                    {r.reviewer_name}
                    {r.reviewer_company && <span style={{ fontWeight: 400, color: "#7A7880" }}> · {r.reviewer_company}</span>}
                  </div>
                  {r.is_verified && (
                    <span style={{ background: "rgba(5,150,105,.1)", color: "#059669", fontSize: "10px", fontWeight: 700, padding: "1px 5px", borderRadius: "3px" }}>Verified</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#7A7880", flexShrink: 0 }}>{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            {/* Stars + title */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: r.title ? "4px" : "8px" }}>
              <StarRow rating={r.rating} size={13} />
            </div>
            {r.title && <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830", marginBottom: "6px" }}>{r.title}</div>}
            <p style={{ fontSize: "14px", color: "#2A2830", lineHeight: 1.6, margin: 0, marginBottom: r.image_url ? "10px" : "0" }}>{r.body}</p>
            {r.image_url && (
              <img src={r.image_url} alt="Review photo" style={{ marginTop: "4px", maxWidth: "180px", maxHeight: "180px", objectFit: "cover", borderRadius: "6px", border: "1px solid #E2E0DA" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupVariantsByColor(variants: ProductVariant[]) {
  const groups: { color: string; variants: ProductVariant[] }[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const color = v.color ?? "Default";
    if (!seen.has(color)) {
      seen.add(color);
      const colorVariants = variants
        .filter(x => (x.color ?? "Default") === color)
        .sort((a, b) => {
          const ai = SIZE_ORDER.indexOf((a.size || "").toUpperCase());
          const bi = SIZE_ORDER.indexOf((b.size || "").toUpperCase());
          if (ai === -1 && bi === -1) return (a.size || "").localeCompare(b.size || "");
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      groups.push({ color, variants: colorVariants });
    }
  }
  return groups;
}

function imgSrc(img: { url_medium_webp?: string | null; url_medium?: string; url_large_webp?: string | null; url_large?: string; url_thumbnail_webp?: string | null; url_thumbnail?: string }) {
  return img.url_large_webp ?? img.url_large ?? img.url_medium_webp ?? img.url_medium ?? "";
}

function thumbSrc(img: { url_thumbnail_webp?: string | null; url_thumbnail?: string }) {
  return img.url_thumbnail_webp ?? img.url_thumbnail ?? "";
}

function isOutOfStock(stock: number | null | undefined): boolean {
  return stock === null || stock === undefined || stock === 0;
}

function getStockLabel(stock: number | null | undefined): string {
  if (isOutOfStock(stock)) return "Out of Stock";
  if ((stock as number) >= 9999) return "In Stock";
  return `${stock} left`;
}

function getStockColor(stock: number | null | undefined): string {
  if (isOutOfStock(stock)) return "#EF4444";
  if ((stock as number) <= 10) return "#F59E0B";
  return "#10B981";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const isRetailUser = user?.account_type === "retail";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [productLoading, setProductLoading] = useState(true);

  // ── Image gallery state ────────────────────────────────────────────────────
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // ── Order state ────────────────────────────────────────────────────────────
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [expandedColors, setExpandedColors] = useState<string[]>([]);
  const [showAllColors, setShowAllColors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartMsg, setCartMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Other state ───────────────────────────────────────────────────────────
  const [assetMsg, setAssetMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Description");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [expandedLibraryColor, setExpandedLibraryColor] = useState<string | null>(null);

  useEffect(() => {
    if (authIsLoading) return; // wait for auth to resolve before fetching
    console.log("[ProductDetail] fetching slug:", slug, "| isAuthenticated:", isAuthenticated);
    setProductLoading(true);
    productsService.getProductBySlug(slug)
      .then((p) => {
        console.log("[ProductDetail] effective_price (first variant):", p.variants?.[0]?.effective_price, "| retail_price:", p.variants?.[0]?.retail_price);
        setProduct(p);
        setExpandedColors(
          groupVariantsByColor(p.variants ?? []).slice(0, 3).map(g => g.color)
        );
        // Auto-select first color that has images, so gallery shows that color on load
        const groups = groupVariantsByColor(p.variants ?? []);
        if (groups.length > 0) {
          const imgs = p.images ?? [];
          const firstColorWithImages = groups.find(g =>
            imgs.some(img => img.alt_text?.toLowerCase().includes(g.color.toLowerCase()))
          );
          if (firstColorWithImages) {
            setSelectedColor(firstColorWithImages.color);
          }
        }
      })
      .catch(() => { })
      .finally(() => setProductLoading(false));
  }, [slug, isAuthenticated, authIsLoading]); // eslint-disable-line

  const colorGroups = useMemo(() => groupVariantsByColor(product?.variants ?? []), [product?.variants]);
  const uniqueColors = colorGroups.map(g => g.color);
  const uniqueSizes = useMemo(
    () => Array.from(new Set(product?.variants?.map(v => v.size).filter(Boolean) ?? [])).sort((a, b) => {
      const ai = SIZE_ORDER.indexOf((a || '').toUpperCase());
      const bi = SIZE_ORDER.indexOf((b || '').toUpperCase());
      if (ai === -1 && bi === -1) return (a || '').localeCompare(b || '');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }) as string[],
    [product?.variants]
  );
  const totalUnits = useMemo(
    () => Object.values(quantities).reduce((s, q) => s + (q || 0), 0),
    [quantities]
  );
  const orderTotal = useMemo(
    () => Object.entries(quantities).reduce((sum, [vid, qty]) => {
      const v = product?.variants?.find(x => x.id === vid);
      return sum + (qty || 0) * Number(v?.effective_price ?? v?.retail_price ?? 0);
    }, 0),
    [quantities, product?.variants]
  );

  if (productLoading || !product) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A7880" }}>
        Loading…
      </div>
    );
  }

  const images = product.images ?? [];
  // ── Derived data ──────────────────────────────────────────────────────────
  const primaryVariant = product.variants?.[0];
  const hasFlyer = product.assets?.some((a: any) => a.asset_type === "flyer");
  const displayColorGroups = showAllColors ? colorGroups : colorGroups.slice(0, 4);
  const filteredGroups = showAllColors ? colorGroups : colorGroups.slice(0, 4);
  const pricePerUnit = Number(primaryVariant?.effective_price ?? primaryVariant?.retail_price ?? 0);
  const anyInStock = (product.variants ?? []).some(v => !isOutOfStock(v.stock_quantity));

  // Color-filtered images for gallery: when a swatch is selected, show only that color's images
  const displayImages = selectedColor
    ? (() => {
        const colorImgs = images.filter(img =>
          img.alt_text?.toLowerCase().includes(selectedColor.toLowerCase())
        );
        return colorImgs.length > 0 ? colorImgs : images;
      })()
    : images;

  // Group images by color for the image library modal
  type ImageGroupEntry = { color: string | null; hex: string; images: typeof images };
  const imageGroups: ImageGroupEntry[] = [];
  if (images.length > 0) {
    const assigned = new Set<string>();
    for (const cg of colorGroups) {
      const colorImgs = images.filter(img =>
        img.alt_text?.toLowerCase().includes(cg.color.toLowerCase())
      );
      if (colorImgs.length > 0) {
        imageGroups.push({ color: cg.color, hex: COLOR_MAP[cg.color] ?? "#E2E2DE", images: colorImgs });
        colorImgs.forEach(img => assigned.add(img.id));
      }
    }
    const unassigned = images.filter(img => !assigned.has(img.id));
    if (unassigned.length > 0) imageGroups.push({ color: null, hex: "#E2E2DE", images: unassigned });
    if (imageGroups.length === 0) imageGroups.push({ color: null, hex: "#E2E2DE", images });
  }

  function toggleColor(color: string) {
    const isCurrentlyExpanded = expandedColors.includes(color);
    if (!isCurrentlyExpanded) {
      const visibleInAccordion = filteredGroups.some(g => g.color === color);
      if (!visibleInAccordion) {
        setShowAllColors(true);
      }
      // After reordering, matching images will be at index 0
      setActiveImageIdx(0);
    }
    setExpandedColors(prev =>
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  }

  function isExpanded(group: { color: string }) {
    return expandedColors.includes(group.color);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function getGuestCart(): Array<{ variant_id: string; quantity: number; product_id: string; product_name: string; slug: string; color: string | null; size: string | null; unit_price: number }> {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("af_guest_cart") || "[]"); } catch { return []; }
  }

  async function handleAddToCart() {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([variant_id, quantity]) => ({ variant_id, quantity }));
    if (items.length === 0) return;

    for (const { variant_id, quantity } of items) {
      const v = product?.variants?.find(x => x.id === variant_id);
      if (!v) continue;
      if (isOutOfStock(v.stock_quantity)) {
        setCartMsg({ type: "error", text: `${v.color ?? ""}${v.size ? ` / ${v.size}` : ""} is out of stock` });
        return;
      }
      const maxStock = v.stock_quantity as number;
      if (maxStock < 9999 && quantity > maxStock) {
        setCartMsg({ type: "error", text: `Only ${maxStock} left for ${v.color ?? ""}${v.size ? ` / ${v.size}` : ""}` });
        return;
      }
    }

    if (!isAuthenticated) {
      const guestCart = getGuestCart();
      for (const { variant_id, quantity } of items) {
        const v = product?.variants?.find(x => x.id === variant_id);
        if (!v) continue;
        const idx = guestCart.findIndex(i => i.variant_id === variant_id);
        const colorImg = product?.images?.find(
          i => i.alt_text?.toLowerCase() === v.color?.toLowerCase()
        ) ?? product?.images?.find(i => i.is_primary) ?? product?.images?.[0];
        const entry = { variant_id, quantity, product_id: product!.id, product_name: product!.name, slug: product!.slug, color: v.color, size: v.size, unit_price: Number(v.effective_price ?? v.retail_price), image_url: colorImg?.url_thumbnail ?? null };
        if (idx >= 0) guestCart[idx]!.quantity += quantity;
        else guestCart.push(entry);
      }
      localStorage.setItem("af_guest_cart", JSON.stringify(guestCart));
      window.dispatchEvent(new Event("af_guest_cart_updated"));
      setQuantities({});
      setCartMsg({ type: "success", text: `${totalUnits} unit${totalUnits !== 1 ? "s" : ""} added to cart!` });
      setTimeout(() => setCartMsg(null), 4000);
      return;
    }

    if (!product) return;

    setIsSubmitting(true);
    setCartMsg(null);
    try {
      await cartService.addMatrix(product.id, items);
      window.dispatchEvent(new Event("cart_updated"));
      setQuantities({});
      setCartMsg({ type: "success", text: `${totalUnits} units added to cart!` });
      setTimeout(() => setCartMsg(null), 4000);
    } catch (err) {
      setCartMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to add to cart" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDownloadStyleSheet() {
    const styleSheet = product?.assets?.find((a: any) => a.asset_type === "style_sheet");
    if (styleSheet?.url) window.open(styleSheet.url, "_blank");
    else setAssetMsg("No style sheet available for this product.");
  }

  async function handleDownload(imageUrl: string, filename: string) {
    try {
      const response = await fetch(imageUrl, { mode: "cors" });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "image.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // fallback: force download via anchor with download attribute
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = filename || "image.jpg";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  async function handleDownloadAll(imgs: Array<{ url: string; filename: string }>) {
    for (let i = 0; i < imgs.length; i++) {
      await new Promise<void>(resolve => setTimeout(resolve, 150));
      await handleDownload(imgs[i]!.url, imgs[i]!.filename);
    }
  }

  async function handleRowAddToCart(group: { color: string; variants: ProductVariant[] }) {
    const rowItems = group.variants
      .filter(v => (quantities[v.id] ?? 0) > 0)
      .map(v => ({ variant_id: v.id, quantity: quantities[v.id]! }));
    if (rowItems.length === 0) return;
    for (const { variant_id } of rowItems) {
      const v = group.variants.find(x => x.id === variant_id);
      if (v && isOutOfStock(v.stock_quantity)) {
        setCartMsg({ type: "error", text: `${v.size ?? ""} is out of stock` });
        return;
      }
    }
    if (!isAuthenticated) {
      const guestCart = getGuestCart();
      for (const { variant_id, quantity } of rowItems) {
        const v = group.variants.find(x => x.id === variant_id);
        if (!v) continue;
        const colorImg = product?.images?.find(i => i.alt_text?.toLowerCase() === v.color?.toLowerCase())
          ?? product?.images?.find((i: any) => i.is_primary) ?? product?.images?.[0];
        const entry = { variant_id, quantity, product_id: product!.id, product_name: product!.name, slug: product!.slug, color: v.color, size: v.size, unit_price: Number(v.effective_price ?? v.retail_price), image_url: colorImg?.url_thumbnail ?? null };
        const idx = guestCart.findIndex(i => i.variant_id === variant_id);
        if (idx >= 0) guestCart[idx]!.quantity += quantity;
        else guestCart.push(entry);
      }
      localStorage.setItem("af_guest_cart", JSON.stringify(guestCart));
      window.dispatchEvent(new Event("af_guest_cart_updated"));
      const added = rowItems.reduce((s, i) => s + i.quantity, 0);
      setQuantities(prev => { const next = { ...prev }; rowItems.forEach(i => delete next[i.variant_id]); return next; });
      setCartMsg({ type: "success", text: `${added} unit${added !== 1 ? "s" : ""} added to cart!` });
      setTimeout(() => setCartMsg(null), 4000);
      return;
    }
    setIsSubmitting(true);
    setCartMsg(null);
    try {
      await cartService.addMatrix(product!.id, rowItems);
      window.dispatchEvent(new Event("cart_updated"));
      const added = rowItems.reduce((s, i) => s + i.quantity, 0);
      setQuantities(prev => { const next = { ...prev }; rowItems.forEach(i => delete next[i.variant_id]); return next; });
      setCartMsg({ type: "success", text: `${added} unit${added !== 1 ? "s" : ""} added to cart!` });
      setTimeout(() => setCartMsg(null), 4000);
    } catch (err) {
      setCartMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to add to cart" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDownloadImages() {
    window.open(`/api/v1/products/${product?.id}/download-images`, "_blank");
  }

  function handleDownloadFlyer() {
    const flyer = product?.assets?.find((a: any) => a.asset_type === "flyer");
    if (flyer?.url) {
      window.open(flyer.url, "_blank");
    }
  }

  function handleEmailFlyer() {
    router.push(`/products/${slug}/email-flyer`);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Breadcrumb */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E2DE", padding: "12px 24px" }}>
        <div className="pdp-breadcrumb-inner" style={{ maxWidth: "1500px", margin: "0 auto", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#6B6B6B", textDecoration: "none" }}>Home</Link>
          <span>›</span>
          <Link href="/products" style={{ color: "#6B6B6B", textDecoration: "none" }}>Collections</Link>
          {product.categories?.[0] && (
            <>
              <span>›</span>
              <Link href={`/products?category=${product.categories[0].slug}`} style={{ color: "#6B6B6B", textDecoration: "none" }}>
                {product.categories[0].name}
              </Link>
            </>
          )}
          <span>›</span>
          <span style={{ color: "#1A1A1A" }}>{product.name}</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 24px 64px" }}>
        <div className="pdp-main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px", paddingTop: "32px" }}>

          {/* ── LEFT: Image Gallery ─────────────────────────────────────── */}
          <div className="pdp-gallery-col" style={{ position: "sticky", top: "24px", alignSelf: "start" }}>
            {/* Main image */}
            <div className="pdp-main-img" style={{ width: "100%", height: "480px", border: "1px solid #E2E2DE", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", overflow: "hidden" }}>
              {displayImages[activeImageIdx] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc(displayImages[activeImageIdx]!)}
                  alt={displayImages[activeImageIdx]!.alt_text ?? product.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ fontSize: "80px", opacity: 0.1 }}>👕</span>
              )}
            </div>

            {/* Thumbnails */}
            {displayImages.length > 1 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                {displayImages.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImageIdx(i)}
                    className="pdp-thumb"
                    style={{ width: "80px", height: "80px", flexShrink: 0, border: activeImageIdx === i ? "1px solid #1C3557" : "1px solid #E2E2DE", cursor: "pointer", background: "#F8F8F6", padding: 0, outline: activeImageIdx === i ? "1px solid #1C3557" : "none", outlineOffset: "2px", overflow: "hidden" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(img)} alt={img.alt_text ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}

            {/* Gallery links */}
            <div className="pdp-gallery-links" style={{ marginTop: "14px", display: "flex", flexDirection: "row", gap: "20px" }}>
              <a
                href="#"
                onClick={e => { e.preventDefault(); handleEmailFlyer(); }}
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#1C3557", textDecoration: "none", cursor: "pointer" }}
              >
                ↓ Email Flyer
              </a>
              {product.images && product.images.length > 0 && (
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); setShowImageLibrary(true); setExpandedLibraryColor(null); }}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#1C3557", textDecoration: "none", cursor: "pointer" }}
                >
                  View Image Library →
                </a>
              )}
            </div>
            {assetMsg && <p style={{ marginTop: "6px", fontSize: "12px", color: "#6B6B6B" }}>{assetMsg}</p>}
          </div>

          {/* ── RIGHT: Product Info ─────────────────────────────────────── */}
          <div>
            {/* Product code */}
            {((product as any).product_code || (product as any).code) && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#6B6B6B", marginBottom: "8px" }}>
                {(product as any).product_code || (product as any).code}
              </div>
            )}

            {/* Title */}
            <h1 className="pdp-title" style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15, marginBottom: "10px" }}>
              {product.name}
            </h1>

            {/* Meta line */}
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", marginBottom: "20px" }}>
              {[(product as any).fabric, (product as any).weight, uniqueColors.length > 0 ? `${uniqueColors.length} Colors` : null].filter(Boolean).join(" · ")}
            </div>

            {/* Guest state — plain inline text, no card/box */}
            {!isAuthenticated && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", marginBottom: "22px" }}>
                Create a wholesale account to get lower prices.{" "}
                <Link href="/wholesale/register" style={{ color: "#1C3557", fontWeight: 500, textDecoration: "none" }}>Create Account</Link>
                {" · "}
                <Link href="/login" style={{ color: "#1C3557", fontWeight: 500, textDecoration: "none" }}>Log In</Link>
              </p>
            )}

            {/* Highlight text */}
            {(product as any).highlight_text && (
              <div style={{ background: "rgba(28,53,87,.05)", border: "1px solid rgba(28,53,87,.15)", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#1A1A1A", lineHeight: 1.6 }}>
                ✅ {(product as any).highlight_text}
              </div>
            )}

            {/* COLOR label + swatches */}
            {colorGroups.length > 0 && (
              <>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6B6B", fontWeight: 600, marginBottom: "10px" }}>
                  Color
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "28px" }}>
                  {colorGroups.map(group => {
                    const hex = COLOR_MAP[group.color] ?? "#E2E2DE";
                    const isLight = ["#FFFFFF", "#fffff0", "#fef3c7", "#f5f0e8"].includes(hex);
                    const isSel = selectedColor === group.color;
                    return (
                      <button
                        key={group.color}
                        onClick={() => { setSelectedColor(selectedColor === group.color ? null : group.color); setActiveImageIdx(0); }}
                        title={group.color}
                        style={{ width: "24px", height: "24px", borderRadius: "50%", background: hex, border: isLight ? "1px solid #E2E2DE" : "1px solid rgba(0,0,0,.08)", cursor: "pointer", outline: isSel ? "2px solid #1C3557" : "none", outlineOffset: "2px", flexShrink: 0, padding: 0, display: "block" }}
                      />
                    );
                  })}
                </div>

                {/* Bulk order table */}
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 600, color: "#1A1A1A", marginBottom: "8px" }}>
                  Select Sizes &amp; Quantities
                </div>
                <p className="block md:hidden" style={{ fontSize: "11px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif", marginBottom: "8px", textAlign: "center" }}>
                  ← Scroll to see all sizes →
                </p>
                <div className="bulk-table-wrapper" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginLeft: "-16px", marginRight: "-16px", paddingLeft: "16px", paddingRight: "16px" }}>
                  <div style={{ minWidth: `${uniqueSizes.length * 80 + 170}px` }}>

                    {/* Size headers — shown once */}
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${uniqueSizes.length}, 1fr) 80px 90px`, gap: "4px", borderBottom: "1px solid #E2E2DE" }}>
                      {uniqueSizes.map(size => (
                        <div key={size} style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B", fontWeight: 500, padding: "6px 8px" }}>{size}</div>
                      ))}
                      <div style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B", fontWeight: 500, padding: "6px 8px" }}>Total</div>
                      <div />
                    </div>

                    {/* One section per color */}
                    {colorGroups.map((group, groupIdx) => {
                      const hex = COLOR_MAP[group.color] ?? "#E2E2DE";
                      const isLight = ["#FFFFFF", "#fffff0", "#fef3c7", "#f5f0e8"].includes(hex);
                      const rowQty = group.variants.reduce((s, v) => s + (quantities[v.id] ?? 0), 0);
                      const rowTotal = group.variants.reduce((s, v) => s + (quantities[v.id] ?? 0) * Number(v.effective_price ?? v.retail_price ?? 0), 0);
                      const allRowOOS = group.variants.every(v => isOutOfStock(v.stock_quantity));
                      return (
                        <div key={group.color}>
                          {/* Color header row */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 8px", borderTop: groupIdx === 0 ? "none" : "1px solid #E2E2DE", flexWrap: "wrap", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: hex, border: isLight ? "1px solid #E2E2DE" : "1px solid rgba(0,0,0,.08)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 500, color: "#1A1A1A" }}>{group.color}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", whiteSpace: "nowrap" }}>Qty: {rowQty}</span>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", whiteSpace: "nowrap" }}>${rowTotal.toFixed(2)}</span>
                              <button
                                onClick={() => handleRowAddToCart(group)}
                                disabled={rowQty === 0 || allRowOOS}
                                style={{ background: "transparent", color: (rowQty > 0 && !allRowOOS) ? "#1C3557" : "#ccc", border: `1px solid ${(rowQty > 0 && !allRowOOS) ? "#1C3557" : "#E2E2DE"}`, padding: "5px 10px", fontSize: "11px", fontFamily: "'DM Sans', sans-serif", cursor: (rowQty > 0 && !allRowOOS) ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
                              >
                                Add to Cart
                              </button>
                            </div>
                          </div>

                          {/* Size inputs row */}
                          <div style={{ display: "grid", gridTemplateColumns: `repeat(${uniqueSizes.length}, 1fr) 80px 90px`, gap: "4px", marginBottom: "4px" }}>
                            {uniqueSizes.map(size => {
                              const variant = group.variants.find(v => v.size === size);
                              if (!variant) {
                                return (
                                  <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px", textAlign: "center" }}>
                                    <span style={{ display: "block", fontSize: "11px", color: "#ccc", fontFamily: "'DM Sans', sans-serif", marginBottom: "2px" }}>—</span>
                                    <span style={{ display: "block", fontSize: "11px", color: "#ccc", fontFamily: "'DM Sans', sans-serif", marginBottom: "4px" }}>&nbsp;</span>
                                    <div style={{ width: "52px", height: "28px" }} />
                                  </div>
                                );
                              }
                              const qty = quantities[variant.id] ?? 0;
                              const isOOS = isOutOfStock(variant.stock_quantity);
                              const stockNum = variant.stock_quantity as number;
                              const stockLabel = isOOS ? "Out of Stock" : stockNum >= 9999 ? "In Stock" : `${stockNum} in stock`;
                              const price = Number(variant.effective_price ?? variant.retail_price ?? 0);
                              return (
                                <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px", textAlign: "center", background: isOOS ? "#fafafa" : "transparent" }}>
                                  <span style={{ display: "block", fontSize: "11px", color: isOOS ? "#cc0000" : "#6B6B6B", fontWeight: isOOS ? 500 : 400, fontFamily: "'DM Sans', sans-serif", marginBottom: "2px", whiteSpace: "nowrap" }}>{stockLabel}</span>
                                  <span style={{ display: "block", fontSize: "11px", color: isOOS ? "#aaaaaa" : "#6B6B6B", fontFamily: "'DM Sans', sans-serif", marginBottom: "4px", whiteSpace: "nowrap" }}>${price.toFixed(2)}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={variant.stock_quantity ?? undefined}
                                    value={qty === 0 ? "" : qty}
                                    disabled={isOOS}
                                    onChange={e => {
                                      if (isOOS) return;
                                      const raw = parseInt(e.target.value, 10) || 0;
                                      const maxStock = variant.stock_quantity ?? 9999;
                                      const val = Math.min(raw, maxStock);
                                      setQuantities(prev => {
                                        if (val <= 0) { const next = { ...prev }; delete next[variant.id]; return next; }
                                        return { ...prev, [variant.id]: val };
                                      });
                                    }}
                                    style={{ width: "52px", border: `1px solid ${isOOS ? "#e0e0e0" : qty > 0 ? "#1C3557" : "#E2E2DE"}`, padding: "5px 6px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", outline: "none", cursor: isOOS ? "not-allowed" : "text", background: isOOS ? "#f0f0f0" : "#FFFFFF", color: isOOS ? "#aaaaaa" : "#1A1A1A" }}
                                  />
                                </div>
                              );
                            })}
                            <div />
                            <div />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grand total row */}
                <div className="pdp-grand-total" style={{ display: "flex", alignItems: "center", gap: "24px", padding: "16px 0 12px", borderTop: "1px solid #E2E2DE", marginTop: "8px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B" }}>
                    Grand Total Qty: <strong style={{ color: "#1A1A1A" }}>{totalUnits}</strong>
                  </span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B" }}>
                    Grand Total Price: <strong style={{ color: "#1A1A1A" }}>${orderTotal.toFixed(2)}</strong>
                  </span>
                </div>

                {/* Cart message */}
                {cartMsg && (
                  <div style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 600, marginBottom: "12px", background: cartMsg.type === "success" ? "rgba(5,150,105,.08)" : "rgba(232,36,42,.08)", color: cartMsg.type === "success" ? "#059669" : "#E8242A", border: `1px solid ${cartMsg.type === "success" ? "rgba(5,150,105,.2)" : "rgba(232,36,42,.2)"}` }}>
                    {cartMsg.text}
                  </div>
                )}

                {/* Main CTA button */}
                <button
                  onClick={handleAddToCart}
                  disabled={totalUnits === 0 || isSubmitting}
                  style={{ width: "100%", padding: "14px", background: totalUnits > 0 ? "#1C3557" : "#E2E2DE", color: totalUnits > 0 ? "#fff" : "#aaa", border: "none", cursor: totalUnits > 0 ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500, transition: "all .2s", marginTop: "12px" }}
                >
                  {isSubmitting ? "Adding to Cart…" : "Add to Cart — All Selections"}
                </button>
                <p style={{ textAlign: "center", marginTop: "10px", fontSize: "12px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif" }}>
                  No minimum order quantity
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Product Tabs ───────────────────────────────────────────────── */}
        <div style={{ marginTop: "40px", borderTop: "1px solid #E2E2DE" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #E2E2DE", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ padding: "14px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, color: activeTab === tab ? "#1C3557" : "#6B6B6B", background: "none", border: "none", borderBottom: activeTab === tab ? "2px solid #1C3557" : "2px solid transparent", marginBottom: "-1px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "color .15s" }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ padding: "32px 0" }}>
            {activeTab === "Description" && (
              <div style={{ maxWidth: "660px" }}>
                {product.description ? (
                  <div
                    style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", lineHeight: 1.75 }}
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                ) : (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", lineHeight: 1.75 }}>
                    No description available for this product.
                  </p>
                )}
              </div>
            )}

            {activeTab === "Specifications" && (
              <div style={{ maxWidth: "600px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <tbody>
                    {[
                      { label: "Colors Available", value: uniqueColors.join(", ") || "—" },
                      { label: "Sizes Available", value: uniqueSizes.join(", ") || "—" },
                      { label: "Variants", value: `${product.variants?.length ?? 0} options` },
                      ...(((product as any).fabric) ? [{ label: "Fabric", value: (product as any).fabric }] : []),
                      ...(() => {
                        const ws = [...new Set(
                          (product.variants ?? [])
                            .filter(v => v.weight_grams != null && v.weight_grams > 0)
                            .map(v => `${v.size}: ${v.weight_grams}g`)
                        )];
                        return ws.length ? [{ label: "Weight per Size", value: ws.join(", ") }] : [];
                      })(),
                      ...(((product as any).product_code) ? [{ label: "Product Code", value: (product as any).product_code }] : []),
                    ].map(row => (
                      <tr key={row.label} style={{ borderBottom: "1px solid #F4F3EF" }}>
                        <td style={{ padding: "12px 0", color: "#7A7880", fontWeight: 600, width: "40%" }}>{row.label}</td>
                        <td style={{ padding: "12px 0", color: "#2A2830" }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(product as any).care_instructions && (
                  <div style={{ marginTop: "20px", padding: "16px", background: "#F4F3EF", borderRadius: "8px", border: "1px solid #E2E0DA" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#7A7880", marginBottom: "8px" }}>Care Instructions</div>
                    <p style={{ fontSize: "14px", color: "#2A2830", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{(product as any).care_instructions}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "Size Chart" && (
              <div style={{ overflowX: "auto" }}>
                {(() => {
                  const rows: any[] = ((product as any).size_chart_data as any[]) ?? [];
                  if (rows.length === 0) {
                    return (
                      <div style={{ padding: "32px", textAlign: "center", background: "#F4F3EF", borderRadius: "10px", border: "1px solid #E2E0DA", color: "#7A7880", fontSize: "14px" }}>
                        Size chart coming soon.
                      </div>
                    );
                  }
                  return (
                    <table style={{ borderCollapse: "collapse", fontSize: "13px", minWidth: "500px" }}>
                      <thead>
                        <tr style={{ background: "#1B3A5C" }}>
                          {["Size", "Chest (in)", "Length (in)", "Sleeve (in)"].map(h => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#fff", fontFamily: "var(--font-bebas)", letterSpacing: ".06em", fontSize: "13px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row: any, i: number) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#F4F3EF" : "#fff", borderBottom: "1px solid #E2E0DA" }}>
                            <td style={{ padding: "10px 16px", color: "#2A2830", fontWeight: 700 }}>{row.size ?? "—"}</td>
                            <td style={{ padding: "10px 16px", color: "#2A2830" }}>{row.chest ?? "—"}</td>
                            <td style={{ padding: "10px 16px", color: "#2A2830" }}>{row.length ?? "—"}</td>
                            <td style={{ padding: "10px 16px", color: "#2A2830" }}>{row.sleeve ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}

            {activeTab === "Reviews" && (
              <ReviewsTab productId={product.id} isAuthenticated={isAuthenticated} />
            )}
          </div>
        </div>
      </div>

      <style>{`
        /* ── PDP table: always scrollable, never overflows ── */
        .bulk-table-wrapper {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }
        .bulk-table-wrapper table {
          min-width: 650px !important;
        }

        @media (max-width: 900px) {
          .pdp-main-grid {
            display: block !important;
          }
          .pdp-main-grid > div {
            width: 100% !important;
            max-width: 100% !important;
          }
          .pdp-main-img {
            height: 320px !important;
          }
          .pdp-thumb {
            width: 60px !important;
            height: 60px !important;
          }
          .pdp-title {
            font-size: 28px !important;
          }
          .pdp-gallery-links {
            flex-direction: row !important;
            flex-wrap: wrap !important;
            gap: 16px !important;
          }
          .pdp-grand-total {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .pdp-breadcrumb-inner {
            font-size: 11px !important;
          }
          .bulk-table-wrapper {
            margin-left: -16px !important;
            margin-right: -16px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }
        @media (max-width: 600px) {
          .pdp-title {
            font-size: 24px !important;
          }
          .pdp-main-img {
            height: 260px !important;
          }
          .pdp-thumb {
            width: 50px !important;
            height: 50px !important;
          }
        }
      `}</style>

      {/* ── Image Library Modal — grouped by color ────────────────────────── */}
      {showImageLibrary && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={() => setShowImageLibrary(false)}
        >
          <div
            style={{ background: "#fff", maxWidth: "960px", width: "100%", maxHeight: "90vh", overflow: "auto", padding: "28px" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "18px", fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px" }}>
                  Image Library — {product.name}
                </h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", margin: 0 }}>
                  All colorway images available for download.
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#1C3557", fontStyle: "italic", margin: "4px 0 0" }}>
                  Color may vary due to digital picture.
                </p>
              </div>
              <button
                onClick={() => setShowImageLibrary(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#6B6B6B", lineHeight: 1, padding: "4px" }}
              >✕</button>
            </div>

            {/* Color cards grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
              {imageGroups.map((group, gi) => {
                const groupKey = group.color ?? `__unassigned_${gi}`;
                const isExpanded = expandedLibraryColor === groupKey;
                const firstImg = group.images[0];
                return (
                  <div key={groupKey} style={{ border: "1px solid #E2E2DE", padding: "8px" }}>
                    {/* Thumbnail — click to expand */}
                    <div
                      onClick={() => setExpandedLibraryColor(isExpanded ? null : groupKey)}
                      style={{ cursor: "pointer", marginBottom: "6px" }}
                    >
                      {firstImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgSrc(firstImg)} alt={firstImg.alt_text ?? group.color ?? ""} style={{ width: "100%", height: "120px", objectFit: "contain", display: "block" }} />
                      ) : (
                        <div style={{ height: "120px", background: "#F8F8F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: "32px", opacity: 0.2 }}>👕</span>
                        </div>
                      )}
                    </div>
                    {group.color && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B", marginBottom: "2px" }}>{group.color}</div>
                    )}
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "#6B6B6B", marginBottom: "6px" }}>
                      {group.images.length} image{group.images.length !== 1 ? "s" : ""}
                    </div>
                    <button
                      onClick={() => handleDownloadAll(
                        group.images.map((img, idx) => ({
                          url: imgSrc(img),
                          filename: `${product.slug}-${group.color ?? "image"}-${idx + 1}.jpg`,
                        }))
                      )}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#1C3557", background: "none", border: "none", cursor: "pointer", padding: 0, display: "block" }}
                    >
                      Download All
                    </button>

                    {/* Expanded: individual images */}
                    {isExpanded && (
                      <div style={{ marginTop: "8px", borderTop: "1px solid #E2E2DE", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {group.images.map((img, idx) => (
                          <div key={img.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbSrc(img)} alt={img.alt_text ?? ""} style={{ width: "48px", height: "48px", objectFit: "cover", flexShrink: 0, border: "1px solid #E2E2DE" }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "10px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {img.alt_text ?? `Image ${idx + 1}`}
                              </div>
                              <button
                                onClick={() => handleDownload(imgSrc(img), `${product.slug}-${group.color ?? "image"}-${idx + 1}.jpg`)}
                                style={{ fontSize: "10px", color: "#1C3557", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
