"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

const PAGE_NAMES: Record<string, string> = {
  home: "Home",
  about: "About Us",
  contact: "Contact Us",
  "private-label": "Private Label",
  "print-guide": "Print Guide",
  "privacy-policy": "Privacy Policy",
  "style-sheets": "Style Sheets",
  "product-specs": "Product Specs",
  blog: "Blog",
};

const labelSt: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const cardSt: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "24px", marginBottom: "16px",
};

export default function AdminPageSeoEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const ogFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    meta_title: "",
    meta_description: "",
    keywords: "",
    og_image_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingOg, setUploadingOg] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    apiClient.get<typeof form & { page_slug: string; keywords: string | null }>(`/api/v1/admin/pages-seo/${slug}`)
      .then(data => {
        setForm({
          meta_title: data.meta_title || "",
          meta_description: data.meta_description || "",
          keywords: data.keywords || "",
          og_image_url: data.og_image_url || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  function addTag(tag: string) {
    const t = tag.trim(); if (!t) return;
    const existing = form.keywords ? form.keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    if (!existing.includes(t)) {
      setForm(f => ({ ...f, keywords: [...existing, t].join(", ") }));
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    const tags = form.keywords.split(",").map(k => k.trim()).filter(k => k && k !== tag);
    setForm(f => ({ ...f, keywords: tags.join(", ") }));
  }

  async function handleOgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingOg(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd);
      setForm(f => ({ ...f, og_image_url: res.url }));
    } catch { /* ignore */ }
    finally { setUploadingOg(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/admin/pages-seo/${slug}`, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const pageName = PAGE_NAMES[slug] || slug;
  const tags = form.keywords ? form.keywords.split(",").map(k => k.trim()).filter(Boolean) : [];

  if (loading) return <div style={{ padding: "32px", color: "#7A7880", fontSize: "14px" }}>Loading…</div>;

  return (
    <div style={{ padding: "32px", maxWidth: "760px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <button onClick={() => router.push("/admin/pages")}
            style={{ background: "none", border: "none", color: "#7A7880", fontSize: "13px", cursor: "pointer", padding: 0, marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
            ← Pages SEO
          </button>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", letterSpacing: ".06em", color: "#2A2830" }}>
            {pageName} — SEO
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: saving ? "#ccc" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "14px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {/* Meta Title */}
      <div style={cardSt}>
        <label style={labelSt}>Meta Title</label>
        <input
          value={form.meta_title}
          onChange={e => setForm(f => ({ ...f, meta_title: e.target.value.slice(0, 60) }))}
          placeholder="Page title for Google (e.g. AF Apparels — Wholesale Blank Apparel)"
          style={inputSt}
          maxLength={60}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
          <span style={{ fontSize: "11px", color: "#7A7880" }}>Shown in browser tab and Google results</span>
          <span style={{ fontSize: "11px", color: form.meta_title.length > 50 ? "#E8242A" : "#7A7880" }}>
            {form.meta_title.length}/60
          </span>
        </div>
      </div>

      {/* Meta Description */}
      <div style={cardSt}>
        <label style={labelSt}>Meta Description</label>
        <textarea
          value={form.meta_description}
          onChange={e => setForm(f => ({ ...f, meta_description: e.target.value.slice(0, 160) }))}
          placeholder="Brief page description for Google search results…"
          rows={3}
          maxLength={160}
          style={{ ...inputSt, resize: "vertical" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
          <span style={{ fontSize: "11px", color: "#7A7880" }}>Shown in Google search snippets</span>
          <span style={{ fontSize: "11px", color: form.meta_description.length > 140 ? "#E8242A" : "#7A7880" }}>
            {form.meta_description.length}/160
          </span>
        </div>
      </div>

      {/* Keywords */}
      <div style={cardSt}>
        <label style={labelSt}>Keywords</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {tags.map(tag => (
            <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(26,92,255,.08)", color: "#1A5CFF", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
              {tag}
              <button type="button" onClick={() => removeTag(tag)} style={{ background: "none", border: "none", color: "#1A5CFF", cursor: "pointer", padding: 0, fontSize: "13px", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
            placeholder="Type keyword and press Enter"
            style={{ ...inputSt, flex: 1 }}
          />
          <button type="button" onClick={() => addTag(tagInput)}
            style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            Add
          </button>
        </div>
      </div>

      {/* OG Image */}
      <div style={cardSt}>
        <label style={labelSt}>OG Image / Social Share Image</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={form.og_image_url}
            onChange={e => setForm(f => ({ ...f, og_image_url: e.target.value }))}
            placeholder="Image URL (or upload below)"
            style={{ ...inputSt, flex: 1 }}
          />
          <button type="button" onClick={() => ogFileRef.current?.click()}
            style={{ background: "#F4F3EF", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: "#2A2830" }}>
            {uploadingOg ? "Uploading…" : "Upload"}
          </button>
          <input ref={ogFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleOgUpload} />
        </div>
        {form.og_image_url && (
          <div style={{ marginTop: "10px" }}>
            <img src={form.og_image_url} alt="OG preview" style={{ maxHeight: "120px", borderRadius: "6px", border: "1px solid #E2E0DA" }} />
          </div>
        )}
        <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "6px" }}>Shown when page is shared on social media (Facebook, Twitter, LinkedIn). Recommended: 1200×630px.</p>
      </div>
    </div>
  );
}
