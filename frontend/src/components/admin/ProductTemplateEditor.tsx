"use client";

/**
 * ProductTemplateEditor — one product template: the product-information
 * blocks (standard ones movable, custom ones added between them), the
 * page-builder sections under the product, the products that use it, and a
 * live preview. Save keeps a draft; Publish is what shoppers get.
 */
import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { productsService } from "@/services/products.service";
import { pagesService, type StorefrontPageRecord } from "@/services/pages.service";
import {
  productTemplatesService as api,
  type AssignedProduct, type ProductTemplateRecord, type TemplateStatus,
} from "@/services/productTemplates.service";
import { useAuthStore } from "@/stores/auth.store";
import { canWrite } from "@/lib/permissions";
import { SectionsEditor, CodeFields, type EditorProduct } from "@/components/admin/SectionsEditor";
import {
  CUSTOM_BLOCKS, STANDARD_BLOCKS, CustomBlockView, blockVisible, isStandard, withStandardBlocks,
  type CustomBlockType, type TemplateBlock, type TemplateLayout,
} from "@/components/storefront/ProductTemplateBlocks";
import { TOKEN_HELP, productTokenContext } from "@/lib/templateTokens";
import type { Category, ProductDetail } from "@/types/product.types";

const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { width: "100%", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px", padding: "20px", marginBottom: "18px" };
const cardTitle: React.CSSProperties = { fontFamily: "var(--font-bebas), sans-serif", fontSize: "18px", letterSpacing: "-0.01em", color: "#2A2830" };
const btnPrimary: React.CSSProperties = { background: "#1A1A1A", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const btnOutline: React.CSSProperties = { background: "#fff", border: "1px solid #1A1A1A", color: "#1A1A1A", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "#F6F6F7", border: "1px solid #C9D6E8", color: "#1A1A1A", padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const iconBtn = (disabled?: boolean): React.CSSProperties => ({ background: "#fff", border: "1px solid #E3E3E3", borderRadius: "6px", padding: "4px 10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 });

export const STATUS_CHIP: Record<TemplateStatus, { text: string; color: string; bg: string }> = {
  draft: { text: "Not published", color: "#92400E", bg: "#FEF3C7" },
  changes: { text: "Unpublished changes", color: "#1E40AF", bg: "#DBEAFE" },
  published: { text: "Published", color: "#15803D", bg: "#DCFCE7" },
};

function ColorInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input type="color" value={value || "#1C3557"} onChange={(e) => onChange(e.target.value)} style={{ width: "44px", height: "38px", border: "1px solid #E3E3E3", borderRadius: "8px", cursor: "pointer", background: "#fff" }} />
      <input style={{ ...input, maxWidth: "120px" }} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="#1C3557" />
    </div>
  );
}

const genId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14));

function newBlock(type: CustomBlockType): TemplateBlock {
  if (type === "announcement") return { id: genId(), type, enabled: true, text: "Free shipping on orders over $99", icon: "🚚", bg_color: "#1C3557", text_color: "#FFFFFF", align: "center" };
  if (type === "text") return { id: genId(), type, enabled: true, heading: "Our guarantee", body: "Not right? Return it within 30 days.", style: "callout", icon: "✅" };
  return { id: genId(), type, enabled: true, html: "", css: "", js: "" };
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiClientError && e.message ? e.message : fallback;
}

// ── Block editor row ──────────────────────────────────────────────────────────
function BlockRow({ block, index, count, open, onToggle, onChange, onMove, onRemove, metafieldKeys }: {
  block: TemplateBlock; index: number; count: number; open: boolean;
  onToggle: () => void; onChange: (patch: Partial<TemplateBlock>) => void;
  onMove: (dir: -1 | 1) => void; onRemove: () => void; metafieldKeys: string[];
}) {
  const std = isStandard(block.type);
  const meta = std ? { label: STANDARD_BLOCKS[block.type as keyof typeof STANDARD_BLOCKS], icon: "▦" } : CUSTOM_BLOCKS[block.type as CustomBlockType];
  const editable = !std || block.type === "price";
  const shown = block.enabled !== false;
  return (
    <div style={{ border: std ? "1px solid #D9E2EF" : "1px solid #E3E3E3", background: std ? "#F5F8FC" : "#fff", borderRadius: "10px", marginBottom: "8px", opacity: shown ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", flexWrap: "wrap" }}>
        <button onClick={editable ? onToggle : undefined} style={{ flex: 1, minWidth: "160px", textAlign: "left", background: "none", border: "none", cursor: editable ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", width: "22px", textAlign: "center", color: "#7A7880" }}>{meta.icon}</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#2A2830" }}>{meta.label}</span>
          {std && <span style={{ fontSize: "10px", fontWeight: 700, color: "#3E5C82", background: "#E4ECF7", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>Standard</span>}
          {block.show_if_metafield && <span style={{ fontSize: "11px", color: "#7A7880" }}>· only if <code>{block.show_if_metafield}</code> is set</span>}
          {editable && <span style={{ fontSize: "11px", color: "#9A98A0", marginLeft: "auto" }}>{open ? "▲" : "▼"}</span>}
        </button>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {!std && (
            <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#555", cursor: "pointer", marginRight: "4px" }}>
              <input type="checkbox" checked={shown} onChange={(e) => onChange({ enabled: e.target.checked })} /> Shown
            </label>
          )}
          <button onClick={() => onMove(-1)} disabled={index === 0} style={iconBtn(index === 0)} aria-label="Move up">↑</button>
          <button onClick={() => onMove(1)} disabled={index === count - 1} style={iconBtn(index === count - 1)} aria-label="Move down">↓</button>
          {std
            ? <span title="Standard blocks can be moved but not removed" style={{ ...iconBtn(true), opacity: 0.5 }}>🔒</span>
            : <button onClick={onRemove} title="Remove block" style={{ ...iconBtn(), border: "1px solid #F1C4C4", color: "#B91C1C" }}>🗑</button>}
        </div>
      </div>

      {open && editable && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid #EEE" }}>
          {block.type === "price" && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#444", marginTop: "12px", cursor: "pointer" }}>
              <input type="checkbox" checked={block.show_from_price !== false} onChange={(e) => onChange({ show_from_price: e.target.checked })} />
              Show the product&apos;s starting price (&ldquo;From $12.50&rdquo;) above the variants
            </label>
          )}

          {block.type === "announcement" && (
            <div style={{ marginTop: "12px" }}>
              <label style={label}>Text</label>
              <input style={input} value={block.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Ships in {{ product.metafields.ship_days }} days" />
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 130px", gap: "10px", marginTop: "12px" }} className="pt-grid-4">
                <div><label style={label}>Icon</label><input style={{ ...input, textAlign: "center" }} value={block.icon ?? ""} onChange={(e) => onChange({ icon: e.target.value })} placeholder="🚚" /></div>
                <div><label style={label}>Background</label><ColorInput value={block.bg_color} onChange={(v) => onChange({ bg_color: v })} /></div>
                <div><label style={label}>Text colour</label><ColorInput value={block.text_color} onChange={(v) => onChange({ text_color: v })} /></div>
                <div><label style={label}>Align</label>
                  <select style={input} value={block.align ?? "center"} onChange={(e) => onChange({ align: e.target.value as "left" | "center" })}>
                    <option value="center">Center</option><option value="left">Left</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {block.type === "text" && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 150px", gap: "10px", marginBottom: "10px" }} className="pt-grid-3">
                <div><label style={label}>Icon</label><input style={{ ...input, textAlign: "center" }} value={block.icon ?? ""} onChange={(e) => onChange({ icon: e.target.value })} placeholder="✅" /></div>
                <div><label style={label}>Heading</label><input style={input} value={block.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value })} placeholder="Our guarantee" /></div>
                <div><label style={label}>Style</label>
                  <select style={input} value={block.style ?? "plain"} onChange={(e) => onChange({ style: e.target.value as TemplateBlock["style"] })}>
                    <option value="plain">Plain</option><option value="callout">Boxed</option><option value="muted">Small print</option>
                  </select>
                </div>
              </div>
              <label style={label}>Text</label>
              <textarea style={{ ...input, minHeight: "80px", resize: "vertical", fontFamily: "inherit" }} value={block.body ?? ""} onChange={(e) => onChange({ body: e.target.value })} placeholder="Not right? Return it within 30 days." />
            </div>
          )}

          {block.type === "custom_code" && (
            <div style={{ marginTop: "12px" }}>
              <CodeFields html={block.html} css={block.css} js={block.js} tokensHint onChange={(patch) => onChange(patch)} />
            </div>
          )}

          {!std && (
            <div style={{ marginTop: "14px", maxWidth: "380px" }}>
              <label style={label}>Show this block</label>
              <input
                style={input}
                list={`mf-keys-${block.id}`}
                value={block.show_if_metafield ?? ""}
                onChange={(e) => onChange({ show_if_metafield: e.target.value.trim().toLowerCase() || undefined })}
                placeholder="On every product"
              />
              <datalist id={`mf-keys-${block.id}`}>{metafieldKeys.map((k) => <option key={k} value={k} />)}</datalist>
              <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "6px" }}>Type a metafield key to show it only on products that have that metafield filled in. Leave empty to show it everywhere.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assign-products picker ────────────────────────────────────────────────────
function AssignModal({ templateId, templateName, onClose, onDone }: {
  templateId: string; templateName: string; onClose: () => void; onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProductDetail[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      apiClient.get<ProductDetail[]>(`/api/v1/admin/products?page_size=100${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => setRows(Array.isArray(r) ? r : []))
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    if (!picked.size) return;
    setBusy(true); setErr(null);
    try { await api.assign(templateId, Array.from(picked)); onDone(); }
    catch (e) { setErr(errorText(e, "Could not assign those products.")); }
    finally { setBusy(false); }
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(20,20,24,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "min(620px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #EEE" }}>
          <div style={cardTitle}>Assign products to “{templateName}”</div>
          <input autoFocus style={{ ...input, marginTop: "12px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {rows.length === 0 && <div style={{ padding: "30px", textAlign: "center", color: "#999", fontSize: "13px" }}>No products found.</div>}
          {rows.map((p) => {
            const already = p.template_id === templateId;
            const on = picked.has(p.id);
            return (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 20px", borderTop: "1px solid #F2F1EC", cursor: already ? "default" : "pointer", opacity: already ? 0.55 : 1 }}>
                <input type="checkbox" disabled={already} checked={already || on} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                <span style={{ flex: 1, fontSize: "14px", color: "#2A2830", fontWeight: 600 }}>{p.name}</span>
                <span style={{ fontSize: "11.5px", color: "#9A98A0" }}>{already ? "Already uses this" : p.template_id ? "Uses another template" : "Default template"}</span>
              </label>
            );
          })}
        </div>
        {err && <div style={{ margin: "0 20px 10px", color: "#B91C1C", fontSize: "13px" }}>{err}</div>}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #EEE", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12.5px", color: "#7A7880" }}>{picked.size} selected</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose} style={btnOutline}>Cancel</button>
            <button onClick={save} disabled={busy || !picked.size} style={{ ...btnPrimary, opacity: busy || !picked.size ? 0.6 : 1 }}>{busy ? "Assigning…" : "Assign"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live preview (schematic of the product page) ──────────────────────────────
function LivePreview({ layout, product }: { layout: TemplateLayout; product: ProductDetail | null }) {
  const ctx = productTokenContext(product as any);
  const blocks = withStandardBlocks(layout.blocks);
  const placeholder = (text: string, h = 38): React.ReactNode => (
    <div style={{ height: `${h}px`, background: "#EFEFEC", borderRadius: "6px", marginBottom: "14px", display: "flex", alignItems: "center", padding: "0 12px", fontSize: "12px", color: "#8A8A8A" }}>{text}</div>
  );
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ height: "150px", background: "#F4F3EF", borderRadius: "8px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#BBB", fontSize: "12px" }}>Product images</div>
      {blocks.map((b) => {
        if (b.type === "title") return (
          <div key={b.id} style={{ marginBottom: "14px" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.2 }}>{product?.name ?? "Product title"}</div>
            <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px" }}>{[ctx.product.fabric, ctx.product.weight].filter(Boolean).join(" · ") || "Fabric · Weight · Colours"}</div>
          </div>
        );
        if (b.type === "price") return (
          <div key={b.id} style={{ marginBottom: "14px" }}>
            {b.show_from_price !== false && <div style={{ fontSize: "18px", fontWeight: 600, color: "#1A1A1A" }}>{ctx.product.price || "$0.00"}</div>}
            <div style={{ fontSize: "11.5px", color: "#8A8A8A", marginTop: "2px" }}>Wholesale sign-in prompt (guests)</div>
          </div>
        );
        if (b.type === "highlight") return product?.highlight_text
          ? <div key={b.id} style={{ background: "rgba(28,53,87,.05)", border: "1px solid rgba(28,53,87,.15)", padding: "10px 12px", marginBottom: "14px", fontSize: "12px" }}>✅ {product.highlight_text}</div>
          : <div key={b.id}>{placeholder("Highlight box (empty on this product)", 30)}</div>;
        if (b.type === "buy") return <div key={b.id}>{placeholder("Variants, quantities & Add to cart", 90)}</div>;
        if (!blockVisible(b, ctx)) return (
          <div key={b.id} style={{ border: "1px dashed #D6D3CC", borderRadius: "6px", padding: "6px 10px", marginBottom: "14px", fontSize: "11.5px", color: "#9A98A0" }}>
            Hidden on this product — {b.enabled === false ? "switched off" : `no “${b.show_if_metafield}” metafield`}
          </div>
        );
        return <CustomBlockView key={b.id} block={b} ctx={ctx} />;
      })}
      {layout.sections.filter((s) => s.enabled !== false).length > 0 && (
        <div style={{ marginTop: "18px", borderTop: "1px solid #EEE", paddingTop: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>Below the product</div>
          {layout.sections.filter((s) => s.enabled !== false).map((s, i) => (
            <div key={s.id ?? i} style={{ background: "#F6F6F4", border: "1px solid #ECEBE6", borderRadius: "6px", padding: "8px 10px", marginBottom: "6px", fontSize: "12px", color: "#555" }}>
              {s.type === "custom_code" ? "</> " : ""}{s.heading || s.type.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: "18px" }}>{placeholder("Description · Specifications · Size chart · Reviews", 30)}</div>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────
export default function ProductTemplateEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuthStore();
  const writable = canWrite(user?.role, "storefront", user?.scopes, user?.read_only);

  const [tpl, setTpl] = useState<ProductTemplateRecord | null>(null);
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<TemplateLayout>({ blocks: [], sections: [] });
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [insertAfter, setInsertAfter] = useState<string>("title");
  const [assigned, setAssigned] = useState<AssignedProduct[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [metaKeys, setMetaKeys] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [previewSlug, setPreviewSlug] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [pages, setPages] = useState<StorefrontPageRecord[]>([]);
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard" | "default">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function adopt(t: ProductTemplateRecord) {
    setTpl(t);
    setName(t.name);
    setLayout({ blocks: withStandardBlocks(t.draft.blocks), sections: t.draft.sections ?? [] });
  }
  function loadAssigned() {
    api.products(id).then(setAssigned).catch(() => setAssigned([]));
  }

  useEffect(() => {
    api.get(id).then(adopt).catch((e) => setLoadError(errorText(e, "Could not load this template.")));
    loadAssigned();
    api.meta().then((m) => setMetaKeys(m.metafield_keys ?? [])).catch(() => {});
    apiClient.get<ProductDetail[]>("/api/v1/admin/products?page_size=200").then((l) => setProducts(Array.isArray(l) ? l : [])).catch(() => {});
    productsService.getCategories().then((c) => setCategories(c || [])).catch(() => {});
    pagesService.list().then(setPages).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Preview with a product that uses this template when there is one.
  useEffect(() => {
    if (previewSlug) return;
    const first = assigned[0]?.slug ?? products[0]?.slug;
    if (first) setPreviewSlug(first);
  }, [assigned, products, previewSlug]);

  const previewProduct = useMemo(() => products.find((p) => p.slug === previewSlug) ?? null, [products, previewSlug]);
  const editorProducts: EditorProduct[] = useMemo(() => products.map((p) => ({ id: p.id, name: p.name, slug: p.slug })), [products]);

  const dirty = !!tpl && (name !== tpl.name || JSON.stringify(layout) !== JSON.stringify({ blocks: withStandardBlocks(tpl.draft.blocks), sections: tpl.draft.sections ?? [] }));
  const status: TemplateStatus = tpl?.status ?? "draft";

  // ── block operations ──
  const setBlocks = (blocks: TemplateBlock[]) => setLayout((l) => ({ ...l, blocks }));
  const patchBlock = (bid: string, patch: Partial<TemplateBlock>) => setBlocks(layout.blocks.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= layout.blocks.length) return;
    const arr = [...layout.blocks];
    const a = arr[i], b = arr[j];
    if (!a || !b) return;
    arr[i] = b; arr[j] = a;
    setBlocks(arr);
  };
  const removeBlock = (bid: string) => setBlocks(layout.blocks.filter((b) => b.id !== bid));
  function addBlock(type: CustomBlockType) {
    const nb = newBlock(type);
    const arr = [...layout.blocks];
    const at = insertAfter === "__end" ? arr.length : arr.findIndex((b) => b.id === insertAfter) + 1;
    arr.splice(at <= 0 ? arr.length : at, 0, nb);
    setBlocks(arr);
    setOpenBlock(nb.id);
  }

  async function save(): Promise<ProductTemplateRecord | null> {
    setBusy("save"); setMsg(null);
    try {
      const t = await api.save(id, { name: name.trim() || "Untitled template", draft: layout });
      adopt(t);
      setMsg({ ok: true, text: t.status === "draft" ? "Saved. Publish when you're ready for shoppers to see it." : "Saved. Shoppers still see the published version until you publish." });
      return t;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, "Could not save the template.") });
      return null;
    } finally { setBusy(null); }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish"); setMsg(null);
    try {
      const t = await api.publish(id);
      adopt(t);
      setMsg({ ok: true, text: `Published — ${t.product_count || "no"} product${t.product_count === 1 ? "" : "s"}${t.is_default ? " plus every product without a template" : ""} now show${t.product_count === 1 && !t.is_default ? "s" : ""} this layout.` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, "Could not publish.") });
    } finally { setBusy(null); }
  }

  async function discard() {
    if (!confirm("Throw away the changes that aren't published yet?")) return;
    setBusy("discard"); setMsg(null);
    try { adopt(await api.discard(id)); setMsg({ ok: true, text: "Back to the published version." }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, "Could not discard changes.") }); }
    finally { setBusy(null); }
  }

  async function toggleDefault() {
    if (!tpl) return;
    setBusy("default"); setMsg(null);
    try { adopt(await api.setDefault(id, !tpl.is_default)); }
    catch (e) { setMsg({ ok: false, text: errorText(e, "Could not change the default template.") }); }
    finally { setBusy(null); }
  }

  async function openPreview() {
    if (!previewSlug) { setMsg({ ok: false, text: "Add a product to your store first — the preview shows this template on a real product." }); return; }
    if (dirty && writable && !(await save())) return;
    window.open(`${window.location.origin}/products/${previewSlug}?preview_template=${id}`, "_blank");
  }

  async function removeAssigned(p: AssignedProduct) {
    try { await api.unassign(id, [p.id]); loadAssigned(); api.get(id).then((t) => setTpl((cur) => (cur ? { ...cur, product_count: t.product_count } : t))).catch(() => {}); }
    catch (e) { setMsg({ ok: false, text: errorText(e, "Could not remove that product.") }); }
  }

  function copyToken(tok: string) {
    try { void navigator.clipboard?.writeText(tok); } catch { /* fine — it's shown anyway */ }
    setCopied(tok);
    setTimeout(() => setCopied((c) => (c === tok ? null : c)), 1400);
  }

  if (loadError) return <div style={{ padding: "40px", color: "#B91C1C", fontSize: "14px" }}>{loadError} <button onClick={onBack} style={{ ...btnGhost, marginLeft: "10px" }}>Back</button></div>;
  if (!tpl) return <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading template…</div>;

  const chip = STATUS_CHIP[status];

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "1280px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <button onClick={() => { if (!dirty || confirm("You have unsaved changes. Leave anyway?")) onBack(); }} style={{ background: "none", border: "none", color: "#1A1A1A", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: "6px" }}>← All product templates</button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <input
              value={name} onChange={(e) => setName(e.target.value)} disabled={!writable} aria-label="Template name"
              style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "30px", color: "#2A2830", letterSpacing: "-0.01em", lineHeight: 1, border: "1px solid transparent", borderRadius: "8px", padding: "2px 6px", marginLeft: "-6px", background: "transparent", minWidth: 0, maxWidth: "100%", outline: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#E3E3E3")} onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
            />
            <span style={{ fontSize: "10.5px", fontWeight: 700, color: chip.color, background: chip.bg, padding: "3px 9px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>{chip.text}</span>
            {tpl.is_default && <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#555", background: "#F0EFEA", padding: "3px 9px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>Default</span>}
            {dirty && <span style={{ fontSize: "12px", color: "#B45309" }}>● Unsaved</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={openPreview} style={btnOutline}>Preview ↗</button>
          {writable && status === "changes" && !dirty && <button onClick={discard} disabled={busy !== null} style={{ ...btnOutline, borderColor: "#E3E3E3", color: "#555" }}>{busy === "discard" ? "Discarding…" : "Discard changes"}</button>}
          {writable && <button onClick={save} disabled={busy !== null || !dirty} style={{ ...btnOutline, opacity: busy !== null || !dirty ? 0.5 : 1 }}>{busy === "save" ? "Saving…" : "Save"}</button>}
          {writable && <button onClick={publish} disabled={busy !== null || (status === "published" && !dirty)} style={{ ...btnPrimary, opacity: busy !== null || (status === "published" && !dirty) ? 0.5 : 1 }}>{busy === "publish" ? "Publishing…" : "Publish"}</button>}
        </div>
      </div>

      {!writable && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          <strong>👁 View-only access</strong> — your role can look at templates but not change them.
        </div>
      )}
      {msg && <div style={{ background: msg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${msg.ok ? "#BBF7D0" : "#FECACA"}`, color: msg.ok ? "#15803D" : "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{msg.ok ? "✓ " : ""}{msg.text}</div>}

      <div className="pt-editor-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: "18px", alignItems: "start" }}>
        {/* ── Left: the editor ── */}
        <fieldset disabled={!writable} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <div style={card}>
            <div style={{ ...cardTitle, marginBottom: "4px" }}>PRODUCT INFORMATION</div>
            <p style={{ fontSize: "12.5px", color: "#7A7880", marginBottom: "14px", lineHeight: 1.5 }}>
              Top to bottom, the right-hand column of the product page. The <strong>standard</strong> blocks are the product&apos;s own title, price, highlight and buying controls — move them, but they can&apos;t be removed. Add your own blocks between them.
            </p>

            {layout.blocks.map((b, i) => (
              <BlockRow
                key={b.id} block={b} index={i} count={layout.blocks.length}
                open={openBlock === b.id} onToggle={() => setOpenBlock(openBlock === b.id ? null : b.id)}
                onChange={(patch) => patchBlock(b.id, patch)} onMove={(dir) => moveBlock(i, dir)}
                onRemove={() => removeBlock(b.id)} metafieldKeys={metaKeys}
              />
            ))}

            {writable && (
              <div style={{ border: "1px dashed #D6D3CC", borderRadius: "10px", padding: "14px", marginTop: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#555" }}>Add a block</span>
                  <select value={insertAfter} onChange={(e) => setInsertAfter(e.target.value)} style={{ ...input, width: "auto", padding: "7px 10px", fontSize: "13px" }} aria-label="Where to add it">
                    {layout.blocks.map((b) => (
                      <option key={b.id} value={b.id}>after {isStandard(b.type) ? STANDARD_BLOCKS[b.type as keyof typeof STANDARD_BLOCKS] : `${CUSTOM_BLOCKS[b.type as CustomBlockType].label}${b.type === "text" && b.heading ? ` “${b.heading}”` : ""}`}</option>
                    ))}
                    <option value="__end">at the end</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(Object.keys(CUSTOM_BLOCKS) as CustomBlockType[]).map((t) => (
                    <button key={t} onClick={() => addBlock(t)} title={CUSTOM_BLOCKS[t].hint} style={{ ...btnGhost, padding: "9px 14px", fontSize: "13px" }}>{CUSTOM_BLOCKS[t].icon} {CUSTOM_BLOCKS[t].label}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: "16px", background: "#F8F8F6", border: "1px solid #EEE", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", marginBottom: "8px" }}>Product data you can use in any text or code <span style={{ fontWeight: 400, color: "#9A98A0" }}>(click to copy)</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {[...TOKEN_HELP, ...metaKeys.map((k) => ({ token: `{{ product.metafields.${k} }}`, label: k }))].map((t) => (
                  <button key={t.token} type="button" onClick={() => copyToken(t.token)} title={t.label}
                    style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "11.5px", background: copied === t.token ? "#DCFCE7" : "#fff", border: "1px solid #E3E3E3", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", color: "#2A2830" }}>
                    {copied === t.token ? "Copied" : t.token}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "8px" }}>
                Metafields are set per product under <strong>Products → edit → Metafields</strong>, e.g. <code>ship_days</code> = <code>3</code>.
              </p>
            </div>
          </div>

          <div style={{ ...card, paddingBottom: "4px" }}>
            <div style={{ ...cardTitle, marginBottom: "4px" }}>SECTIONS BELOW THE PRODUCT</div>
            <p style={{ fontSize: "12.5px", color: "#7A7880", marginBottom: "14px" }}>Full-width sections between the product and its description tabs — the same sections as the page builder, including custom code.</p>
          </div>
          <SectionsEditor
            sections={layout.sections}
            onChange={(sections) => setLayout((l) => ({ ...l, sections }))}
            products={editorProducts}
            categories={categories}
            pages={pages}
            tokensHint
          />
        </fieldset>

        {/* ── Right: preview + assignment ── */}
        <div className="pt-side" style={{ position: "sticky", top: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ ...card, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
              <div style={cardTitle}>LIVE PREVIEW</div>
              <span style={{ fontSize: "11px", color: "#9A98A0" }}>updates as you type</span>
            </div>
            <select value={previewSlug} onChange={(e) => setPreviewSlug(e.target.value)} style={{ ...input, padding: "8px 10px", fontSize: "13px", marginBottom: "14px" }} aria-label="Preview with product">
              {products.length === 0 && <option value="">No products yet</option>}
              {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
            </select>
            <div style={{ border: "1px solid #EEE", borderRadius: "10px", padding: "14px", maxHeight: "62vh", overflowY: "auto", background: "#FCFCFB" }}>
              <LivePreview layout={layout} product={previewProduct} />
            </div>
            <button onClick={openPreview} style={{ ...btnGhost, width: "100%", marginTop: "12px" }}>Open full preview on the store ↗</button>
          </div>

          <div style={{ ...card, marginBottom: 0 }}>
            <div style={{ ...cardTitle, marginBottom: "6px" }}>PRODUCTS</div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: "#444", marginBottom: "12px", cursor: writable ? "pointer" : "default" }}>
              <input type="checkbox" checked={tpl.is_default} disabled={!writable || busy !== null} onChange={toggleDefault} style={{ marginTop: "2px" }} />
              <span>Default template — used by every product that doesn&apos;t have one of its own</span>
            </label>
            <div style={{ fontSize: "12.5px", color: "#7A7880", marginBottom: "8px" }}>{assigned.length} product{assigned.length === 1 ? "" : "s"} use this template directly</div>
            <div style={{ maxHeight: "220px", overflowY: "auto" }}>
              {assigned.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", borderTop: "1px solid #F2F1EC" }}>
                  <span style={{ flex: 1, fontSize: "13px", color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  {writable && <button onClick={() => removeAssigned(p)} title="Back to the default template" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "16px", cursor: "pointer" }}>×</button>}
                </div>
              ))}
            </div>
            {writable && <button onClick={() => setShowAssign(true)} style={{ ...btnGhost, width: "100%", marginTop: "10px" }}>+ Assign products</button>}
            {status === "draft" && <p style={{ fontSize: "11.5px", color: "#92400E", marginTop: "10px" }}>Not published yet — its products show the default template (or the standard page) until you publish.</p>}
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignModal
          templateId={id} templateName={tpl.name}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); loadAssigned(); api.get(id).then((t) => setTpl((cur) => (cur ? { ...cur, product_count: t.product_count } : t))).catch(() => {}); }}
        />
      )}

      <style>{`
        @media (max-width: 1080px) { .pt-editor-grid { grid-template-columns: 1fr !important; } .pt-side { position: static !important; } }
        @media (max-width: 640px) { .pt-grid-4, .pt-grid-3 { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
