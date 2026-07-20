"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pagesService, type StorefrontPageRecord } from "@/services/pages.service";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { PAGE_TEMPLATES, type PageTemplate } from "@/lib/pageTemplates";

/** Mini stacked-blocks thumbnail representing a template's section layout. */
function TemplatePreview({ blocks }: { blocks: PageTemplate["preview"] }) {
  const style: Record<string, React.CSSProperties> = {
    hero: { height: "22px", background: "linear-gradient(90deg,#1C3557,#3E5C82)" },
    image_text: { height: "16px", background: "#D9E2EF" },
    rich_text: { height: "12px", background: "#ECEBE5" },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px", background: "#F8F8F6", borderRadius: "8px", border: "1px solid #EEE" }}>
      {blocks.map((b, i) => <div key={i} style={{ borderRadius: "3px", ...style[b] }} />)}
    </div>
  );
}

export default function PagesListPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role);
  const [pages, setPages] = useState<StorefrontPageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creatingTpl, setCreatingTpl] = useState<string | null>(null);

  function load() {
    setLoading(true);
    pagesService.list()
      .then(setPages)
      .catch(() => setError("Failed to load pages."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true); setError(null);
    try {
      const page = await pagesService.create(title);
      router.push(`/admin/storefront/pages/${page.id}`);
    } catch {
      setError("Could not create page. That name may be reserved.");
      setCreating(false);
    }
  }

  async function createFromTemplate(t: PageTemplate) {
    setCreatingTpl(t.id); setError(null);
    try {
      const page = await pagesService.create(t.suggestedTitle, undefined, t.sections);
      router.push(`/admin/storefront/pages/${page.id}`);
    } catch {
      setError("Could not create page from template.");
      setCreatingTpl(null);
    }
  }

  async function handleDelete(p: StorefrontPageRecord) {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    try {
      await pagesService.remove(p.id);
      setPages((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setError("Could not delete page.");
    }
  }

  async function togglePublish(p: StorefrontPageRecord) {
    try {
      const updated = await pagesService.update(p.id, { is_published: !p.is_published });
      setPages((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      setError("Could not update page.");
    }
  }

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px" };
  const input: React.CSSProperties = { border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box" };
  const btnPrimary: React.CSSProperties = { background: "#1C3557", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "920px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>Pages</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Build storefront pages — About, Contact, or any custom page. They share your store&apos;s navbar &amp; footer.</p>
        </div>
        {!readOnly && (
          <button onClick={() => setShowNew(true)} style={btnPrimary}>+ New Page</button>
        )}
      </div>

      {readOnly && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>👁</span> <strong>View-only access</strong> — your role can browse pages but not change them.
        </div>
      )}
      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {showNew && !readOnly && (
        <div style={{ ...card, padding: "18px", marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" }}>New page name</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input autoFocus style={{ ...input, flex: 1, minWidth: "220px" }} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} placeholder="e.g. Shipping &amp; Returns" />
            <button onClick={handleCreate} disabled={creating || !newTitle.trim()} style={{ ...btnPrimary, opacity: creating || !newTitle.trim() ? 0.6 : 1 }}>{creating ? "Creating…" : "Create & Edit"}</button>
            <button onClick={() => { setShowNew(false); setNewTitle(""); }} style={{ background: "#fff", border: "1px solid #E2E0DA", color: "#555", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Template gallery */}
      {!readOnly && (
        <div style={{ marginBottom: "26px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "12px" }}>Start from a template</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            {PAGE_TEMPLATES.map((t) => (
              <div key={t.id} style={{ ...card, padding: "16px", display: "flex", flexDirection: "column" }}>
                <TemplatePreview blocks={t.preview} />
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#2A2830", marginTop: "12px" }}>{t.name}</div>
                <p style={{ fontSize: "12.5px", color: "#7A7880", marginTop: "4px", lineHeight: 1.5, flex: 1 }}>{t.description}</p>
                <button
                  onClick={() => createFromTemplate(t)}
                  disabled={creatingTpl !== null}
                  style={{ ...btnPrimary, marginTop: "12px", width: "100%", opacity: creatingTpl !== null ? 0.6 : 1, cursor: creatingTpl !== null ? "not-allowed" : "pointer" }}
                >
                  {creatingTpl === t.id ? "Creating…" : "Customize this"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: "13px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "12px" }}>Your pages</div>
      {loading ? (
        <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading pages…</div>
      ) : pages.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: "15px", color: "#7A7880", marginBottom: "6px" }}>No pages yet.</p>
          <p style={{ fontSize: "13px", color: "#aaa" }}>Create your first page to add content beyond the homepage.</p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {pages.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 18px", borderTop: i === 0 ? "none" : "1px solid #F2F1EC" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#2A2830" }}>{p.title}</span>
                  {!p.is_published && <span style={{ fontSize: "10px", fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>Draft</span>}
                  {p.is_published && !p.show_in_nav && <span style={{ fontSize: "10px", fontWeight: 700, color: "#555", background: "#F0EFEA", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>Hidden from nav</span>}
                </div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "3px" }}>/{p.slug} · {p.sections.length} section{p.sections.length === 1 ? "" : "s"}</div>
              </div>
              {!readOnly && (
                <button onClick={() => togglePublish(p)} title={p.is_published ? "Unpublish" : "Publish"} style={{ background: "#fff", border: "1px solid #E2E0DA", color: p.is_published ? "#15803D" : "#92400E", padding: "7px 12px", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                  {p.is_published ? "Published" : "Draft"}
                </button>
              )}
              <button onClick={() => router.push(`/admin/storefront/pages/${p.id}`)} style={{ background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "7px 16px", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                {readOnly ? "View" : "Edit"}
              </button>
              {!readOnly && (
                <button onClick={() => handleDelete(p)} title="Delete" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer", padding: "4px 6px" }}>🗑</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
