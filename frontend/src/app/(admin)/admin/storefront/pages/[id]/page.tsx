"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { pagesService, type StorefrontPageRecord } from "@/services/pages.service";
import { productsService } from "@/services/products.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { SectionsEditor, type EditorProduct } from "@/components/admin/SectionsEditor";
import type { PageSection } from "@/components/storefront/SectionRenderer";
import type { Category } from "@/types/product.types";

const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { width: "100%", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "20px", marginBottom: "18px" };
const btnPrimary: React.CSSProperties = { background: "#1C3557", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };

export default function PageEditor() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role);

  const [page, setPage] = useState<StorefrontPageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<EditorProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pages, setPages] = useState<StorefrontPageRecord[]>([]);

  useEffect(() => {
    pagesService.get(id)
      .then(setPage)
      .catch(() => setError("Could not load this page."))
      .finally(() => setLoading(false));
    apiClient.get<EditorProduct[]>("/api/v1/admin/products?page_size=200").then((l) => setProducts(l || [])).catch(() => {});
    productsService.getCategories().then((c) => setCategories(c || [])).catch(() => {});
    pagesService.list().then((p) => setPages(p.filter((x) => x.id !== id))).catch(() => {});
  }, [id]);

  function setField<K extends keyof StorefrontPageRecord>(key: K, value: StorefrontPageRecord[K]) {
    setPage((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  async function handleSave() {
    if (!page) return;
    setSaving(true); setError(null);
    try {
      const updated = await pagesService.update(page.id, {
        title: page.title,
        slug: page.slug,
        sections: page.sections,
        is_published: page.is_published,
        show_in_nav: page.show_in_nav,
      });
      setPage(updated); setSaved(true);
    } catch { setError("Failed to save. That page name may be reserved."); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading page…</div>;
  if (!page) return <div style={{ padding: "40px", color: "#B91C1C", fontSize: "14px" }}>{error ?? "Page not found."}</div>;

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "920px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <button onClick={() => router.push("/admin/storefront/pages")} style={{ background: "none", border: "none", color: "#1C3557", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: "6px" }}>← All Pages</button>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "30px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>{page.title || "Untitled"}</h1>
          <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "4px" }}>/{page.slug}</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => window.open(window.location.origin + "/" + page.slug, "_blank")} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Preview ↗</button>
          {!readOnly && <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save Page"}</button>}
        </div>
      </div>

      {readOnly && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          <strong>👁 View-only access</strong> — your role can browse this page but not edit it.
        </div>
      )}
      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}
      {saved && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>✓ Saved! Open Preview to see your page.</div>}

      <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
        {/* Page settings */}
        <div style={card}>
          <div style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "18px", letterSpacing: ".04em", color: "#2A2830", marginBottom: "16px" }}>PAGE SETTINGS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div><label style={label}>Page Title</label><input style={input} value={page.title} onChange={(e) => setField("title", e.target.value)} placeholder="About Us" /></div>
            <div><label style={label}>URL Slug</label><input style={input} value={page.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="about-us" /></div>
          </div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#555", cursor: "pointer" }}>
              <input type="checkbox" checked={page.is_published} onChange={(e) => setField("is_published", e.target.checked)} /> Published (visible to customers)
            </label>
            <span style={{ fontSize: "12px", color: "#7A7880" }}>To show this page in your nav, add it to a menu under <strong>Menus</strong>.</span>
          </div>
        </div>

        {/* Sections builder (shared) */}
        <SectionsEditor
          sections={page.sections}
          onChange={(s: PageSection[]) => setField("sections", s)}
          products={products}
          categories={categories}
          pages={pages}
        />

        {!readOnly && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "40px" }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, padding: "12px 28px", fontSize: "14px", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save Page"}</button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
