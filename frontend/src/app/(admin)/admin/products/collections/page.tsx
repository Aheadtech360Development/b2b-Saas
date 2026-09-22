// frontend/src/app/(admin)/admin/products/collections/page.tsx
"use client";

export const dynamic = "force-dynamic";

/**
 * Collections — a group of products, picked by hand or answered by rules.
 *
 * An automatic collection stores a question rather than a list, so the builder
 * shows the answer *before* it is saved: change a condition and the preview
 * re-runs. That is the whole reason this screen exists rather than a text box
 * full of rules nobody can check.
 *
 * Categories — the filters the storefront browses by — kept their own screen
 * under Catalogue › Categories. This used to edit those while calling them
 * collections, which is why the two were confusing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface Rule { field: string; operator: string; value: string | null }

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  match_type: "manual" | "automatic";
  rules_match: "all" | "any";
  rules: Rule[];
  rules_explained: string[];
  sort_by: string;
  is_active: boolean;
  product_count: number | null;
  seo_title: string | null;
  seo_description: string | null;
}

interface FieldOption {
  key: string;
  label: string;
  kind: string;
  choices: string[];
  operators: { key: string; label: string }[];
}

interface ProductRow {
  id: string; name: string; slug: string; status: string;
  product_type: string | null; vendor: string | null; tags: string[];
}

const SORTS: { key: string; label: string }[] = [
  { key: "manual", label: "The order I arrange them" },
  { key: "best_selling", label: "Best selling" },
  { key: "title_asc", label: "Name, A–Z" },
  { key: "title_desc", label: "Name, Z–A" },
  { key: "price_asc", label: "Price, low to high" },
  { key: "price_desc", label: "Price, high to low" },
  { key: "created_desc", label: "Newest first" },
  { key: "created_asc", label: "Oldest first" },
];

const EMPTY = {
  name: "", slug: "", description: "", image_url: "",
  match_type: "manual" as "manual" | "automatic",
  rules_match: "all" as "all" | "any",
  rules: [] as Rule[],
  sort_by: "manual", is_active: true,
  seo_title: "", seo_description: "",
};

// ── Shared styling, matching the rest of Catalogue ───────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: "12.5px", fontWeight: 600, color: "#4A4850", marginBottom: "7px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid #E2E2E4", borderRadius: "10px",
  background: "#FCFCFC", fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none",
  boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  background: "#1A1A1A", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "10px",
  fontWeight: 700, cursor: "pointer", fontSize: "13px", fontFamily: "var(--font-jakarta)",
};
const rowBtn: React.CSSProperties = {
  background: "#fff", border: "1px solid #E6E6E6", borderRadius: "9px", padding: "7px 12px",
  fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-jakarta)", color: "#1A1A1A",
};
const smallInput: React.CSSProperties = {
  padding: "9px 11px", border: "1px solid #E2E2E4", borderRadius: "9px", background: "#fff",
  fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const pill = (on: boolean): React.CSSProperties => ({
  padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
  background: on ? "rgba(5,150,105,.1)" : "rgba(156,163,175,.16)",
  color: on ? "#059669" : "#6B7280",
});

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // What the current conditions would hold. Re-run as they change, so the
  // admin never has to save to find out.
  const [preview, setPreview] = useState<{ total: number; products: ProductRow[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Hand-picked members of the collection being edited.
  const [members, setMembers] = useState<ProductRow[]>([]);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<Collection[]>("/api/v1/admin/collections");
      setCollections(res ?? []);
    } catch {
      setCollections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiClient.get<{ fields: FieldOption[] }>("/api/v1/admin/collections/rule-options")
      .then(r => setFields(r.fields ?? []))
      .catch(() => setFields([]));
  }, []);

  // ── Preview, debounced so typing a value does not query on every keystroke ──
  useEffect(() => {
    if (!showModal || form.match_type !== "automatic") { setPreview(null); return; }
    const ready = form.rules.filter(r => r.field && r.operator);
    if (!ready.length) { setPreview({ total: 0, products: [] }); return; }

    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      apiClient.post<{ total: number; products: ProductRow[] }>(
        "/api/v1/admin/collections/preview",
        { match_type: "automatic", rules_match: form.rules_match, rules: ready },
      )
        .then(r => { if (!cancelled) { setPreview(r); setError(null); } })
        .catch(e => {
          if (cancelled) return;
          const err = e as { detail?: string; message?: string };
          setPreview(null);
          setError(err?.detail || err?.message || null);
        })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showModal, form.match_type, form.rules, form.rules_match]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY });
    setMembers([]);
    setError(null);
    setShowModal(true);
  }

  async function openEdit(c: Collection) {
    setEditingId(c.id);
    setForm({
      name: c.name, slug: c.slug, description: c.description ?? "",
      image_url: c.image_url ?? "", match_type: c.match_type,
      rules_match: c.rules_match, rules: c.rules ?? [], sort_by: c.sort_by,
      is_active: c.is_active, seo_title: c.seo_title ?? "",
      seo_description: c.seo_description ?? "",
    });
    setError(null);
    setShowModal(true);
    if (c.match_type === "manual") await loadMembers(c.id);
    else setMembers([]);
  }

  async function loadMembers(id: string) {
    try {
      const r = await apiClient.get<{ items: ProductRow[] }>(
        `/api/v1/admin/collections/${id}/products?page_size=200`);
      setMembers(r.items ?? []);
    } catch { setMembers([]); }
  }

  function close() {
    setShowModal(false);
    setEditingId(null);
    setForm({ ...EMPTY });
    setMembers([]);
    setPreview(null);
    setError(null);
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.postForm<{ url: string }>("/api/v1/admin/products/upload-image", fd);
      setForm(f => ({ ...f, image_url: res.url }));
    } catch {
      setError("That image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug || generateSlug(form.name),
        description: form.description || null,
        image_url: form.image_url.trim() || null,
        match_type: form.match_type,
        rules_match: form.rules_match,
        rules: form.rules.filter(r => r.field && r.operator),
        sort_by: form.sort_by,
        is_active: form.is_active,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
      };
      if (editingId) await apiClient.patch(`/api/v1/admin/collections/${editingId}`, payload);
      else await apiClient.post("/api/v1/admin/collections", payload);
      close();
      await load();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail || err?.message || "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Collection) {
    if (!confirm(`Delete "${c.name}"? The products in it are not deleted.`)) return;
    try {
      await apiClient.delete(`/api/v1/admin/collections/${c.id}`);
      await load();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      alert(err?.detail || err?.message || "That could not be deleted.");
    }
  }

  // ── Condition rows ─────────────────────────────────────────────────────────
  const fieldFor = (key: string) => fields.find(f => f.key === key);

  function addRule() {
    const first = fields[0];
    setForm(f => ({
      ...f,
      rules: [...f.rules, {
        field: first?.key ?? "title",
        operator: first?.operators[0]?.key ?? "equals",
        value: "",
      }],
    }));
  }

  function patchRule(i: number, patch: Partial<Rule>) {
    setForm(f => ({
      ...f,
      rules: f.rules.map((r, k) => {
        if (k !== i) return r;
        const next = { ...r, ...patch };
        // Changing the field can strand an operator that does not apply to it.
        if (patch.field) {
          const meta = fieldFor(patch.field);
          if (meta && !meta.operators.some(o => o.key === next.operator)) {
            next.operator = meta.operators[0]?.key ?? "equals";
          }
          next.value = "";
        }
        return next;
      }),
    }));
  }

  const removeRule = (i: number) =>
    setForm(f => ({ ...f, rules: f.rules.filter((_, k) => k !== i) }));

  const isAuto = form.match_type === "automatic";
  const valueless = (op: string) => op === "is_set" || op === "is_not_set";

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#9A98A0", letterSpacing: ".04em", marginBottom: "6px" }}>Catalogue</div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>Collections</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px" }}>
            Group products by hand, or set conditions and let the collection fill itself · {collections.length} collection{collections.length === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Create Collection</button>
      </div>

      {/* List */}
      {isLoading && collections.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", padding: "22px" }}>
          {[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}
        </div>
      ) : collections.length === 0 ? (
        <div style={{ background: "#fff", border: "1px dashed #DADADA", borderRadius: "14px", padding: "56px 24px", textAlign: "center" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "24px" }}>🗂️</div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px" }}>No collections yet</h3>
          <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "18px", lineHeight: 1.6 }}>
            Pick products yourself, or write conditions — &ldquo;tagged summer and under $30&rdquo; — and the<br />
            collection keeps itself up to date as products change.
          </p>
          <button onClick={openCreate} style={primaryBtn}>+ Create your first collection</button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
          {collections.map((c, i) => (
            <div
              key={c.id}
              onClick={() => openEdit(c)}
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 18px", borderTop: i ? "1px solid #F4F4F4" : "none", cursor: "pointer", flexWrap: "wrap", transition: "background .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FAFAFA"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ width: "64px", height: "64px", borderRadius: "12px", overflow: "hidden", background: "#F4F2EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "24px", opacity: 0.35 }}>{c.match_type === "automatic" ? "⚡" : "🗂️"}</span>
                )}
              </div>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#1A1A1A" }}>{c.name}</span>
                  <span style={pill(c.is_active)}>{c.is_active ? "Active" : "Hidden"}</span>
                  {c.match_type === "automatic" && (
                    <span style={{ ...pill(true), background: "rgba(109,40,217,.1)", color: "#6D28D9" }}>Automatic</span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#8A8890", marginTop: "3px" }}>
                  {c.product_count ?? 0} product{(c.product_count ?? 0) === 1 ? "" : "s"} · /{c.slug}
                </div>
                {c.match_type === "automatic" && c.rules_explained.length > 0 && (
                  <div style={{ fontSize: "12px", color: "#A4A2A8", marginTop: "4px" }}>
                    {c.rules_explained.join(c.rules_match === "all" ? "  ·  and  ·  " : "  ·  or  ·  ")}
                  </div>
                )}
                {c.match_type === "manual" && c.description && (
                  <div style={{ fontSize: "12px", color: "#A4A2A8", marginTop: "4px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                    {c.description}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                <button onClick={() => openEdit(c)} style={rowBtn}>Edit</button>
                <button onClick={() => remove(c)} style={{ ...rowBtn, color: "#E8242A", borderColor: "#F6D0D1" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={close}
        >
          <div
            style={{ background: "#fff", borderRadius: "16px", width: "760px", maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: "26px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
              <h2 style={{ fontSize: "19px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.01em", margin: 0 }}>
                {editingId ? "Edit collection" : "Create collection"}
              </h2>
              <button onClick={close} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Collection name <span style={{ color: "#E8242A" }}>*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: editingId ? f.slug : generateSlug(e.target.value) }))}
                placeholder="e.g. Summer Sale, Best Sellers, Under $30"
                style={{ ...inputStyle, fontSize: "15px" }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Link (URL)</label>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid #E2E2E4", borderRadius: "10px", overflow: "hidden" }}>
                <span style={{ padding: "10px 12px", background: "#F6F6F7", fontSize: "13px", color: "#aaa", borderRight: "1px solid #E2E2E4", whiteSpace: "nowrap", flexShrink: 0 }}>
                  /collections/
                </span>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                  style={{ flex: 1, padding: "10px 12px", border: "none", fontSize: "13px", fontFamily: "monospace", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Shown at the top of the collection page (optional)"
                style={{ ...inputStyle, resize: "vertical" as const }}
              />
            </div>

            {/* How products get in */}
            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>How products get into this collection</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {([
                  ["manual", "I choose them", "Pick products yourself and arrange the order."],
                  ["automatic", "Conditions decide", "Set rules once. Products join and leave as they change."],
                ] as const).map(([key, title, blurb]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      match_type: key,
                      sort_by: key === "automatic" && f.sort_by === "manual" ? "created_desc" : f.sort_by,
                    }))}
                    style={{
                      textAlign: "left", padding: "13px 15px", borderRadius: "11px", cursor: "pointer",
                      border: form.match_type === key ? "1.5px solid #1A1A1A" : "1px solid #E2E2E4",
                      background: form.match_type === key ? "#FAFAFA" : "#fff",
                      fontFamily: "var(--font-jakarta)",
                    }}
                  >
                    <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#1A1A1A" }}>{title}</div>
                    <div style={{ fontSize: "12px", color: "#8A8890", marginTop: "3px", lineHeight: 1.5 }}>{blurb}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Conditions */}
            {isAuto && (
              <div style={{ marginBottom: "18px", background: "#FBFBFC", border: "1px solid #ECECEC", borderRadius: "12px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>Products must match</span>
                  <select
                    value={form.rules_match}
                    onChange={e => setForm(f => ({ ...f, rules_match: e.target.value as "all" | "any" }))}
                    style={{ ...smallInput, width: "auto" }}
                  >
                    <option value="all">all conditions</option>
                    <option value="any">any condition</option>
                  </select>
                </div>

                {form.rules.length === 0 && (
                  <p style={{ fontSize: "12.5px", color: "#8A8890", margin: "0 0 12px", lineHeight: 1.6 }}>
                    No conditions yet, so this collection is empty. Add one — a tag, a price, a vendor —
                    and you will see exactly what it would hold before you save.
                  </p>
                )}

                {form.rules.map((rule, i) => {
                  const meta = fieldFor(rule.field);
                  return (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                      <select value={rule.field} onChange={e => patchRule(i, { field: e.target.value })}
                        style={{ ...smallInput, flex: "1 1 160px" }}>
                        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <select value={rule.operator} onChange={e => patchRule(i, { operator: e.target.value })}
                        style={{ ...smallInput, flex: "1 1 140px" }}>
                        {(meta?.operators ?? []).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                      {valueless(rule.operator) ? (
                        <span style={{ flex: "1 1 140px", fontSize: "12px", color: "#A4A2A8" }}>—</span>
                      ) : meta?.choices?.length ? (
                        <select value={rule.value ?? ""} onChange={e => patchRule(i, { value: e.target.value })}
                          style={{ ...smallInput, flex: "1 1 140px" }}>
                          <option value="">choose…</option>
                          {meta.choices.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input
                          value={rule.value ?? ""}
                          onChange={e => patchRule(i, { value: e.target.value })}
                          placeholder={meta?.kind === "money" || meta?.kind === "number" || meta?.kind === "stock" ? "e.g. 30" : "value"}
                          style={{ ...smallInput, flex: "1 1 140px" }}
                        />
                      )}
                      <button type="button" onClick={() => removeRule(i)}
                        style={{ ...rowBtn, color: "#E8242A", borderColor: "#F6D0D1", padding: "7px 10px" }}>✕</button>
                    </div>
                  );
                })}

                <button type="button" onClick={addRule} style={{ ...rowBtn, marginTop: "4px" }}>+ Add condition</button>

                {/* The answer, before saving */}
                <div style={{ marginTop: "14px", borderTop: "1px solid #ECECEC", paddingTop: "13px" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#1A1A1A", marginBottom: "8px" }}>
                    {previewing ? "Checking…"
                      : preview ? `${preview.total} product${preview.total === 1 ? "" : "s"} match right now`
                      : "Add a condition to see what matches"}
                  </div>
                  {preview && preview.products.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {preview.products.slice(0, 12).map(p => (
                        <span key={p.id} style={{ fontSize: "11.5px", background: "#fff", border: "1px solid #E6E6E6", borderRadius: "20px", padding: "4px 10px", color: "#4A4850" }}>
                          {p.name}
                        </span>
                      ))}
                      {preview.total > 12 && (
                        <span style={{ fontSize: "11.5px", color: "#A4A2A8", padding: "4px 4px" }}>
                          and {preview.total - 12} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hand-picked products */}
            {!isAuto && editingId && (
              <div style={{ marginBottom: "18px", background: "#FBFBFC", border: "1px solid #ECECEC", borderRadius: "12px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>
                    Products ({members.length})
                  </span>
                  <button type="button" onClick={() => setPicker(true)} style={rowBtn}>+ Add products</button>
                </div>
                {members.length === 0 ? (
                  <p style={{ fontSize: "12.5px", color: "#8A8890", margin: 0 }}>Nothing in this collection yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
                    {members.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "#fff", border: "1px solid #EFEFEF", borderRadius: "9px", padding: "8px 11px" }}>
                        <span style={{ fontSize: "12.5px", color: "#2A2830", fontWeight: 600 }}>{p.name}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            // DELETE with a body: the client takes RequestInit, so the payload
                            // goes in as a serialised body rather than a bare object.
                            await apiClient.delete(
                              `/api/v1/admin/collections/${editingId}/products`,
                              { body: JSON.stringify({ product_ids: [p.id] }),
                                headers: { "Content-Type": "application/json" } },
                            );
                            await loadMembers(editingId);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#C6C4CA", fontSize: "14px" }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isAuto && !editingId && (
              <div style={{ marginBottom: "18px", background: "#F6F6F7", border: "1px solid #ECECEC", borderRadius: "12px", padding: "14px 16px", fontSize: "12.5px", color: "#7A7880", lineHeight: 1.6 }}>
                Save the collection first, then you can add products to it.
              </div>
            )}

            {/* Image, order, visibility */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "18px" }}>
              <div>
                <label style={labelStyle}>Image</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "54px", height: "54px", borderRadius: "11px", background: "#F4F2EE", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {form.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : <span style={{ opacity: .35 }}>🗂️</span>}
                  </div>
                  <input
                    ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={rowBtn} disabled={uploading}>
                    {uploading ? "Uploading…" : form.image_url ? "Replace" : "Upload"}
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Order products by</label>
                <select
                  value={form.sort_by}
                  onChange={e => setForm(f => ({ ...f, sort_by: e.target.value }))}
                  style={{ ...inputStyle, padding: "10px 12px" }}
                >
                  {SORTS.filter(s => isAuto ? s.key !== "manual" : true).map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "20px", cursor: "pointer" }}>
              <input
                type="checkbox" checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                style={{ width: "16px", height: "16px" }}
              />
              <span style={{ fontSize: "13px", color: "#2A2830", fontWeight: 600 }}>Show this collection in the store</span>
            </label>

            {error && (
              <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #F6D0D1", borderRadius: "10px", padding: "11px 14px", fontSize: "12.5px", color: "#B91C1C", marginBottom: "16px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={close} style={rowBtn}>Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                style={{ ...primaryBtn, opacity: saving || !form.name.trim() ? .5 : 1 }}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create collection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && editingId && (
        <ProductPicker
          exclude={members.map(m => m.id)}
          onClose={() => setPicker(false)}
          onAdd={async ids => {
            await apiClient.post(`/api/v1/admin/collections/${editingId}/products`, { product_ids: ids });
            await loadMembers(editingId);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

// ── Picking products by hand ─────────────────────────────────────────────────

function ProductPicker({ exclude, onAdd, onClose }: {
  exclude: string[];
  onAdd: (ids: string[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient.get<ProductRow[]>(`/api/v1/admin/products?limit=50${q ? `&search=${encodeURIComponent(q)}` : ""}`)
        .then(r => { if (!cancelled) setRows((r ?? []).filter(p => !exclude.includes(p.id))); })
        .catch(() => { if (!cancelled) setRows([]); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, exclude]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: "16px", width: "560px", maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", fontFamily: "var(--font-jakarta)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#1A1A1A", margin: 0 }}>Add products</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search products…"
          style={{ ...inputStyle, marginBottom: "14px" }}
          autoFocus
        />
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #EFEFEF", borderRadius: "10px" }}>
          {rows.length === 0 ? (
            <p style={{ fontSize: "12.5px", color: "#8A8890", padding: "18px", margin: 0, textAlign: "center" }}>
              Nothing to add.
            </p>
          ) : rows.map((p, i) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 13px", borderTop: i ? "1px solid #F4F4F4" : "none", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={chosen.has(p.id)}
                onChange={e => setChosen(prev => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(p.id); else next.delete(p.id);
                  return next;
                })}
                style={{ width: "15px", height: "15px" }}
              />
              <span style={{ fontSize: "13px", color: "#2A2830", fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: "11.5px", color: "#A4A2A8", marginLeft: "auto" }}>{p.status}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
          <button onClick={onClose} style={rowBtn}>Cancel</button>
          <button
            onClick={async () => { setBusy(true); await onAdd([...chosen]); setBusy(false); }}
            disabled={busy || chosen.size === 0}
            style={{ ...primaryBtn, opacity: busy || chosen.size === 0 ? .5 : 1 }}
          >
            {busy ? "Adding…" : `Add ${chosen.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
