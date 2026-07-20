"use client";

import { useEffect, useState } from "react";
import { storefrontService } from "@/services/storefront.service";
import { productsService } from "@/services/products.service";
import { pagesService, type StorefrontPageRecord } from "@/services/pages.service";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { SectionsEditor } from "@/components/admin/SectionsEditor";
import type { Category } from "@/types/product.types";

interface AdminProduct { id: string; name: string; slug?: string; product_code?: string | null; primary_image?: { url_thumbnail?: string } | null; images?: { url_thumbnail?: string }[] }

import { DEFAULT_BRANDING, type Branding, type SectionKey } from "@/components/providers/BrandingProvider";
import { MenuLinkField } from "@/components/admin/MenuLinkField";
import { menusService, type NavMenu } from "@/services/menus.service";
import { STORE_THEMES, type StoreTheme } from "@/lib/storeThemes";
import { ThemePreview } from "@/components/admin/ThemePreview";
import { FONT_PAIRINGS, FONT_OPTIONS, fontPairingId } from "@/lib/fontPresets";
import Link from "next/link";

const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Hero Banner",
  featured_categories: "Featured Categories",
  featured_products: "Featured Products",
};

interface PickOption { id: string; label: string; sub?: string; image?: string | null; }

/** Modal to search + multi-select items (products or categories). */
function PickerModal({ title, options, selected, onClose, onSave }: {
  title: string; options: PickOption[]; selected: string[];
  onClose: () => void; onSave: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>(selected);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  function toggle(id: string) { setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  const inp: React.CSSProperties = { width: "100%", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 1000, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "560px", padding: "24px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#2A2830" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#999" }}>×</button>
        </div>
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, marginBottom: "12px" }} />
        <div style={{ overflowY: "auto", flex: 1, border: "1px solid #EEE", borderRadius: "8px" }}>
          {filtered.length === 0 && <div style={{ padding: "24px", textAlign: "center", color: "#999", fontSize: "13px" }}>Nothing found.</div>}
          {filtered.map((o) => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderBottom: "1px solid #F2F1EC", cursor: "pointer", background: sel.includes(o.id) ? "#F0F4FA" : "#fff" }}>
              <input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.image !== undefined && (
                <div style={{ width: "38px", height: "38px", borderRadius: "6px", background: "#F4F3EF", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {o.image ? <img src={o.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "9px", color: "#bbb" }}>—</span>}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</div>
                {o.sub && <div style={{ fontSize: "12px", color: "#999" }}>{o.sub}</div>}
              </div>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>{sel.length} selected</span>
          <button onClick={() => onSave(sel)} style={{ background: "#1C3557", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function StorefrontSettingsPage() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role);
  const [form, setForm] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaPickerFor, setMediaPickerFor] = useState<"logo" | "hero" | null>(null);
  const [allProducts, setAllProducts] = useState<AdminProduct[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [pages, setPages] = useState<StorefrontPageRecord[]>([]);
  const [menus, setMenus] = useState<NavMenu[]>([]);
  const [picker, setPicker] = useState<"products" | "categories" | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);

  async function activateTheme(theme: StoreTheme) {
    if (!confirm(`Apply the "${theme.name}" theme?\n\nThis sets its colors, homepage design and menus, and creates standard pages (About, Contact, policies). Pages you already have will NOT be overwritten. You can customize everything afterwards.`)) return;
    setActivating(theme.id); setError(null); setThemeMsg(null);
    try {
      // 1. Upsert the theme's menus (by name) so nav linking is set up.
      const existingMenus = await menusService.list();
      const upsertMenu = async (def: StoreTheme["headerMenu"]) => {
        const found = existingMenus.find((m) => m.name.toLowerCase() === def.name.toLowerCase());
        if (found) return menusService.update(found.id, { items: def.items });
        const created = await menusService.create(def.name);
        return menusService.update(created.id, { items: def.items });
      };
      const header = await upsertMenu(theme.headerMenu);
      const footer = await upsertMenu(theme.footerMenu);
      // 2. Create missing standard pages (never overwrite existing ones).
      const existingPages = await pagesService.list();
      const have = new Set(existingPages.map((p) => p.slug));
      for (const pg of theme.pages) {
        if (!have.has(pg.slug)) await pagesService.create(pg.title, pg.slug, pg.sections);
      }
      // 3. Apply branding (colors, fonts, hero, homepage sections) + link the menus + mark live.
      const updated = await storefrontService.update({ ...theme.branding, header_menu_id: header.id, footer_menu_id: footer.id, active_theme: theme.id });
      setForm({ ...DEFAULT_BRANDING, ...updated });
      menusService.list().then((m) => setMenus(m || [])).catch(() => {});
      pagesService.list().then((p) => setPages(p || [])).catch(() => {});
      setThemeMsg(`✓ "${theme.name}" theme applied! Everything below is now editable — customize colors, sections, menus & pages. Open Preview Store to see it.`);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Could not apply the theme. Please try again.");
    } finally {
      setActivating(null);
    }
  }

  useEffect(() => {
    storefrontService.get()
      .then((b) => setForm({ ...DEFAULT_BRANDING, ...b }))
      .catch(() => setError("Failed to load storefront settings"))
      .finally(() => setLoading(false));
    // Admin endpoint returns ALL products (incl. out-of-stock/drafts) so any can be featured.
    apiClient.get<AdminProduct[]>("/api/v1/admin/products?page_size=200").then((list) => setAllProducts(list || [])).catch(() => {});
    productsService.getCategories().then((c) => setAllCategories(c || [])).catch(() => {});
    pagesService.list().then((p) => setPages(p || [])).catch(() => {});
    menusService.list().then((m) => setMenus(m || [])).catch(() => {});
  }, []);

  function set<K extends keyof Branding>(key: K, value: Branding[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  // ── Homepage section order (fixed sections + addons in one list) ────────────
  const FIXED_KEYS = ["hero", "featured_categories", "featured_products"];
  const _addonTypeLabel: Record<string, string> = { slideshow: "Slideshow", image_text: "Image + Text", gallery: "Gallery", features: "Features Row", testimonials: "Testimonials", faq: "FAQ", logo_strip: "Logo Strip", newsletter: "Newsletter", rich_text: "Text Block" };

  function fullOrder(): string[] {
    const order = form.section_order?.length ? [...form.section_order] : [...FIXED_KEYS];
    const seen = new Set(order);
    FIXED_KEYS.forEach((k) => { if (!seen.has(k)) order.push(k); });
    (form.home_sections ?? []).forEach((s) => { if (s.id && !seen.has(`addon:${s.id}`)) order.push(`addon:${s.id}`); });
    const addonIds = new Set((form.home_sections ?? []).map((s) => s.id));
    return order.filter((k) => FIXED_KEYS.includes(k) || (k.startsWith("addon:") && addonIds.has(k.slice(6))));
  }
  function orderLabel(key: string): string {
    if (!key.startsWith("addon:")) return SECTION_LABELS[key as SectionKey] ?? key;
    const s = (form.home_sections ?? []).find((x) => x.id === key.slice(6));
    const t = _addonTypeLabel[s?.type ?? ""] ?? "Addon";
    return s?.heading ? `${t}: ${s.heading}` : t;
  }
  function moveSection(i: number, dir: -1 | 1) {
    const order = fullOrder(); const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const a = order[i]; const bb = order[j];
    if (a === undefined || bb === undefined) return;
    order[i] = bb; order[j] = a; set("section_order", order);
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const updated = await storefrontService.update(form);
      setForm({ ...DEFAULT_BRANDING, ...updated }); setSaved(true);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  function openStore() { if (typeof window !== "undefined") window.open(window.location.origin + "/", "_blank"); }

  if (loading) return <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading storefront settings…</div>;

  const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" };
  const input: React.CSSProperties = { width: "100%", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "24px", marginBottom: "20px" };
  const title: React.CSSProperties = { fontFamily: "var(--font-bebas), sans-serif", fontSize: "18px", letterSpacing: ".04em", color: "#2A2830", marginBottom: "16px" };

  const ColorField = ({ k, name }: { k: keyof Branding; name: string }) => (
    <div>
      <label style={label}>{name}</label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input type="color" value={String(form[k] ?? "#000000")} onChange={(e) => set(k, e.target.value as never)} style={{ width: "44px", height: "38px", border: "1px solid #E2E0DA", borderRadius: "8px", cursor: "pointer", background: "#fff" }} />
        <input style={{ ...input, maxWidth: "120px" }} value={String(form[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      </div>
    </div>
  );

  const Toggle = ({ k, text }: { k: keyof Branding; text: string }) => (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#555" }}>
      <input type="checkbox" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked as never)} /> {text}
    </label>
  );

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "920px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>Storefront</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Design your store — logo, menu, hero, sections, colors. This is what customers see.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={openStore} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Preview Store ↗</button>
          {!readOnly && (
            <button onClick={handleSave} disabled={saving} style={{ background: saving ? "#9ca3af" : "#1C3557", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save Changes"}</button>
          )}
        </div>
      </div>

      {readOnly && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>👁</span> <strong>View-only access</strong> — your role can browse this page but not make changes.
        </div>
      )}
      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}
      {saved && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>✓ Saved! Open Preview Store to see your changes.</div>}
      {themeMsg && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{themeMsg}</div>}

      <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      {/* STARTER THEMES */}
      <div style={{ ...card, background: "linear-gradient(180deg,#FBFCFF,#F4F6FA)" }}>
        <div style={title}>STARTER THEMES</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "16px" }}>New here? Activate a ready-made design to instantly set up your colors, homepage, menus &amp; standard pages (About, Contact, policies). Everything stays fully editable afterwards — change images, text, menus, anything.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px" }}>
          {STORE_THEMES.map((t) => {
            const isLive = form.active_theme === t.id;
            return (
            <div key={t.id} style={{ background: "#fff", border: isLive ? "2px solid #16A34A" : "1px solid #E2E0DA", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", position: "relative" }}>
              {isLive && <span style={{ position: "absolute", top: "10px", right: "10px", zIndex: 2, background: "#16A34A", color: "#fff", fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", letterSpacing: ".04em", display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} /> LIVE</span>}
              <ThemePreview theme={t} />
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#2A2830", marginTop: "12px" }}>{t.name}</div>
              <p style={{ fontSize: "12.5px", color: "#7A7880", marginTop: "4px", lineHeight: 1.5, flex: 1 }}>{t.description}</p>
              <button onClick={() => activateTheme(t)} disabled={activating !== null} style={{ marginTop: "12px", width: "100%", background: isLive ? "#F0FDF4" : "#1C3557", color: isLive ? "#16A34A" : "#fff", border: isLive ? "1px solid #BBF7D0" : "none", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: activating !== null ? "not-allowed" : "pointer", opacity: activating !== null && activating !== t.id ? 0.6 : 1 }}>
                {activating === t.id ? "Applying…" : isLive ? "✓ Active theme — re-apply" : "Activate this theme"}
              </button>
            </div>
            );
          })}
        </div>
      </div>

      {/* STORE IDENTITY */}
      <div style={card}>
        <div style={title}>STORE IDENTITY</div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Store Name</label>
          <input style={input} value={form.store_name} onChange={(e) => set("store_name", e.target.value)} placeholder="Your store name" />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Logo</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {form.logo_url && <img src={form.logo_url} alt="logo" style={{ height: "40px", width: "auto", objectFit: "contain", border: "1px solid #eee", borderRadius: "6px", padding: "4px", background: "#fff" }} />}
            <button onClick={() => setMediaPickerFor("logo")} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Choose Logo</button>
            {form.logo_url && <button onClick={() => set("logo_url", null)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "13px", cursor: "pointer" }}>Remove</button>}
          </div>
          <input style={{ ...input, marginTop: "10px" }} value={form.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value || null)} placeholder="…or paste a logo image URL" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <ColorField k="primary_color" name="Primary" />
          <ColorField k="secondary_color" name="Secondary" />
          <ColorField k="accent_color" name="Accent" />
        </div>
        <div>
          <label style={label}>Favicon URL (browser tab icon)</label>
          <input style={input} value={form.favicon_url ?? ""} onChange={(e) => set("favicon_url", e.target.value || null)} placeholder="https://…/favicon.png" />
        </div>
      </div>

      {/* TYPOGRAPHY */}
      <div style={card}>
        <div style={title}>TYPOGRAPHY</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "14px" }}>Pick heading and body fonts independently — they apply across your whole store.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <div>
            <label style={label}>Heading font</label>
            <select style={input} value={form.font_heading} onChange={(e) => set("font_heading", e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Body font</label>
            <select style={input} value={form.font_body} onChange={(e) => set("font_body", e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ maxWidth: "420px" }}>
          <label style={label}>…or start from a pairing</label>
          <select
            style={input}
            value={fontPairingId(form.font_heading, form.font_body)}
            onChange={(e) => {
              const p = FONT_PAIRINGS.find((x) => x.id === e.target.value);
              if (p) { set("font_heading", p.heading); set("font_body", p.body); }
            }}
          >
            <option value="custom">— Custom —</option>
            {FONT_PAIRINGS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: "14px", padding: "16px", border: "1px solid #EEE", borderRadius: "10px", background: "#FAFAF8" }}>
          <div style={{ fontFamily: form.font_heading, fontSize: "24px", fontWeight: 700, color: "#2A2830" }}>The quick brown fox</div>
          <div style={{ fontFamily: form.font_body, fontSize: "14px", color: "#6B6B6B", marginTop: "4px" }}>Body text preview — jumps over the lazy dog. 1234567890</div>
        </div>
      </div>

      {/* THEME STYLE — the knobs that make a theme *feel* different */}
      <div style={card}>
        <div style={title}>THEME STYLE</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "16px" }}>How your product cards, buttons and section spacing look. This is what makes one theme feel different from another.</p>

        <label style={label}>Card style</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "18px" }}>
          {([
            { v: "bordered", label: "Bordered", hint: "Thin outline" },
            { v: "elevated", label: "Elevated", hint: "Soft shadow" },
            { v: "flat", label: "Flat", hint: "No border/shadow" },
          ] as const).map((opt) => {
            const on = (form.card_style || "bordered") === opt.v;
            return (
              <button key={opt.v} onClick={() => set("card_style", opt.v)} style={{ padding: "12px 10px", borderRadius: "8px", cursor: "pointer", textAlign: "center", border: on ? "2px solid #1C3557" : "1px solid #E2E0DA", background: on ? "#F0F4FA" : "#fff" }}>
                <div style={{ height: "34px", margin: "0 auto 8px", width: "70%", background: opt.v === "flat" ? "transparent" : "#fff", border: opt.v === "flat" ? "none" : "1px solid #E2E2DE", borderRadius: "6px", boxShadow: opt.v === "elevated" ? "0 4px 12px rgba(0,0,0,.14)" : "none" }} />
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#2A2830" }}>{opt.label}</div>
                <div style={{ fontSize: "11px", color: "#999" }}>{opt.hint}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={label}>Button shape — {form.button_radius >= 999 ? "Pill" : form.button_radius === 0 ? "Square" : `${form.button_radius}px`}</label>
            <input type="range" min={0} max={24} value={Math.min(form.button_radius ?? 4, 24)} onChange={(e) => set("button_radius", Number(e.target.value))} style={{ width: "100%" }} />
            <button onClick={() => set("button_radius", form.button_radius >= 999 ? 4 : 999)} style={{ marginTop: "6px", background: form.button_radius >= 999 ? "#1C3557" : "#F0F4FA", color: form.button_radius >= 999 ? "#fff" : "#1C3557", border: "1px solid #C9D6E8", padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Pill</button>
          </div>
          <div>
            <label style={label}>Corner roundness — {form.corner_radius ?? 6}px</label>
            <input type="range" min={0} max={24} value={form.corner_radius ?? 6} onChange={(e) => set("corner_radius", Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>

        <label style={label}>Section spacing</label>
        <div style={{ display: "flex", gap: "10px" }}>
          {(["compact", "normal", "spacious"] as const).map((sp) => {
            const on = (form.section_spacing || "normal") === sp;
            return (
              <button key={sp} onClick={() => set("section_spacing", sp)} style={{ flex: 1, padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", textTransform: "capitalize", border: on ? "2px solid #1C3557" : "1px solid #E2E0DA", background: on ? "#F0F4FA" : "#fff", color: "#2A2830" }}>{sp}</button>
            );
          })}
        </div>
      </div>

      {/* ANNOUNCEMENT BAR */}
      <div style={card}>
        <div style={title}>ANNOUNCEMENT BAR</div>
        <div style={{ marginBottom: "12px" }}><Toggle k="show_announcement" text="Show announcement bar at the top" /></div>
        <input style={{ ...input, marginBottom: "12px" }} value={form.announcement_text} onChange={(e) => set("announcement_text", e.target.value)} placeholder="e.g. Free shipping on orders over $500" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <ColorField k="announcement_bg_color" name="Background" />
          <ColorField k="announcement_text_color" name="Text" />
        </div>
      </div>

      {/* NAVIGATION — pick which menu shows in header / footer */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div style={title}>NAVIGATION</div>
          <Link href="/admin/storefront/menus" style={{ fontSize: "13px", fontWeight: 700, color: "#1C3557", textDecoration: "none" }}>Manage menus →</Link>
        </div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "16px" }}>Build menus under <strong>Manage menus</strong>, then choose which one appears where. Pages only show in a menu if you add them.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={label}>Header Menu</label>
            <select style={{ ...input, width: "100%" }} value={form.header_menu_id ?? ""} onChange={(e) => set("header_menu_id", e.target.value)}>
              <option value="">— none (Shop All only) —</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Footer Menu</label>
            <select style={{ ...input, width: "100%" }} value={form.footer_menu_id ?? ""} onChange={(e) => set("footer_menu_id", e.target.value)}>
              <option value="">— none —</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {menus.length === 0 && <p style={{ fontSize: "12px", color: "#B45309", marginTop: "12px" }}>No menus yet — click <strong>Manage menus →</strong> to create one.</p>}
      </div>

      {/* NAVBAR LAYOUT */}
      <div style={card}>
        <div style={title}>NAVBAR LAYOUT</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "14px" }}>Choose how your storefront header looks.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "18px" }}>
          {([
            { v: "logo_left", label: "Logo left", hint: "Logo · Menu · Actions" },
            { v: "logo_center", label: "Logo center", hint: "Menu · Logo · Actions" },
            { v: "logo_center_below", label: "Logo center, menu below", hint: "Logo on top row" },
          ] as const).map((opt) => (
            <button key={opt.v} onClick={() => set("header_layout", opt.v)} style={{ padding: "16px 10px", borderRadius: "8px", cursor: "pointer", textAlign: "center", border: (form.header_layout || "logo_left") === opt.v ? "2px solid #1C3557" : "1px solid #E2E0DA", background: (form.header_layout || "logo_left") === opt.v ? "#F0F4FA" : "#fff" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830", marginBottom: "4px" }}>{opt.label}</div>
              <div style={{ fontSize: "11px", color: "#999" }}>{opt.hint}</div>
            </button>
          ))}
        </div>
        <Toggle k="show_cart" text="Show cart icon in the header" />
      </div>

      {/* HERO BANNER */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={title}>HERO BANNER</div>
          <Toggle k="show_hero" text="Show" />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Headline</label>
          <input style={input} value={form.hero_heading} onChange={(e) => set("hero_heading", e.target.value)} placeholder="Quality Wholesale Products, Direct to Your Business" />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Sub-heading</label>
          <input style={input} value={form.hero_subheading} onChange={(e) => set("hero_subheading", e.target.value)} placeholder="Competitive pricing and fast fulfillment." />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div><label style={label}>Button Text</label><input style={input} value={form.hero_cta_text} onChange={(e) => set("hero_cta_text", e.target.value)} placeholder="Shop Now" /></div>
          <div><label style={label}>Button Link</label><MenuLinkField href={form.hero_cta_link} onChange={(v) => set("hero_cta_link", v)} products={allProducts} categories={allCategories} pages={pages} /></div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Hero Image (optional)</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {form.hero_image_url && <img src={form.hero_image_url} alt="hero" style={{ height: "48px", width: "auto", objectFit: "cover", border: "1px solid #eee", borderRadius: "6px" }} />}
            <button onClick={() => setMediaPickerFor("hero")} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Choose Image</button>
            {form.hero_image_url && <button onClick={() => set("hero_image_url", null)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "13px", cursor: "pointer" }}>Remove</button>}
          </div>
          <input style={{ ...input, marginTop: "10px" }} value={form.hero_image_url ?? ""} onChange={(e) => set("hero_image_url", e.target.value || null)} placeholder="…or paste an image URL" />
          {form.hero_image_url && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "14px" }}>
              <div>
                <label style={label}>Corner Roundness — {form.hero_image_radius ?? 4}px</label>
                <input type="range" min={0} max={48} value={form.hero_image_radius ?? 4} onChange={(e) => set("hero_image_radius", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={label}>Opacity — {form.hero_image_opacity ?? 100}%</label>
                <input type="range" min={20} max={100} value={form.hero_image_opacity ?? 100} onChange={(e) => set("hero_image_opacity", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <ColorField k="hero_bg_color" name="Background" />
          <ColorField k="hero_text_color" name="Text" />
        </div>
      </div>

      {/* FEATURED PRODUCTS */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={title}>FEATURED PRODUCTS</div>
          <Toggle k="show_featured_products" text="Show" />
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={label}>Section Heading</label>
          <input style={input} value={form.featured_products_heading} onChange={(e) => set("featured_products_heading", e.target.value)} placeholder="Featured Products" />
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={label}>Products to feature</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
            <button onClick={() => setPicker("products")} style={{ background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Select Products</button>
            <span style={{ fontSize: "13px", color: "#7A7880" }}>{form.featured_product_ids.length} selected</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {form.featured_product_ids.map((id) => {
              const p = allProducts.find((x) => x.id === id);
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "20px", padding: "4px 10px", fontSize: "12px" }}>
                  {p?.name ?? "product"}
                  <button onClick={() => set("featured_product_ids", form.featured_product_ids.filter((x) => x !== id))} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>×</button>
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div><label style={label}>"View all" text</label><input style={input} value={form.featured_products_view_all_text} onChange={(e) => set("featured_products_view_all_text", e.target.value)} placeholder="View all" /></div>
          <div><label style={label}>"View all" link</label><MenuLinkField href={form.featured_products_view_all_link} onChange={(v) => set("featured_products_view_all_link", v)} products={allProducts} categories={allCategories} pages={pages} /></div>
          <div><label style={label}>How many to show</label>
            <select style={input} value={form.featured_products_limit} onChange={(e) => set("featured_products_limit", Number(e.target.value))}>
              {[4, 8, 16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* FEATURED CATEGORIES */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={title}>FEATURED CATEGORIES</div>
          <Toggle k="show_featured_categories" text="Show" />
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={label}>Section Heading</label>
          <input style={input} value={form.featured_categories_heading} onChange={(e) => set("featured_categories_heading", e.target.value)} placeholder="Shop by Category" />
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={label}>Categories to feature</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
            <button onClick={() => setPicker("categories")} style={{ background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Select Categories</button>
            <span style={{ fontSize: "13px", color: "#7A7880" }}>{form.featured_category_ids.length} selected</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {form.featured_category_ids.map((id) => {
              const c = allCategories.find((x) => x.id === id);
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "20px", padding: "4px 10px", fontSize: "12px" }}>
                  {c?.name ?? "category"}
                  <button onClick={() => set("featured_category_ids", form.featured_category_ids.filter((x) => x !== id))} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>×</button>
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div><label style={label}>"View all" text</label><input style={input} value={form.featured_categories_view_all_text} onChange={(e) => set("featured_categories_view_all_text", e.target.value)} placeholder="View all" /></div>
          <div><label style={label}>"View all" link</label><MenuLinkField href={form.featured_categories_view_all_link} onChange={(v) => set("featured_categories_view_all_link", v)} products={allProducts} categories={allCategories} pages={pages} /></div>
          <div><label style={label}>How many to show</label>
            <select style={input} value={form.featured_categories_limit} onChange={(e) => set("featured_categories_limit", Number(e.target.value))}>
              {[4, 8, 16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Pickers */}
      {picker === "products" && (
        <PickerModal
          title="Select Featured Products"
          options={allProducts.map((p) => ({ id: p.id, label: p.name, sub: p.product_code ?? undefined, image: p.primary_image?.url_thumbnail ?? p.images?.[0]?.url_thumbnail ?? null }))}
          selected={form.featured_product_ids}
          onClose={() => setPicker(null)}
          onSave={(ids) => { set("featured_product_ids", ids); setPicker(null); }}
        />
      )}
      {picker === "categories" && (
        <PickerModal
          title="Select Featured Categories"
          options={allCategories.filter((c) => !c.parent_id).map((c) => ({ id: c.id, label: c.name }))}
          selected={form.featured_category_ids}
          onClose={() => setPicker(null)}
          onSave={(ids) => { set("featured_category_ids", ids); setPicker(null); }}
        />
      )}

      {/* Media Library picker (logo / hero image) */}
      {mediaPickerFor && (
        <MediaPicker
          onSelect={(url) => set(mediaPickerFor === "logo" ? "logo_url" : "hero_image_url", url)}
          onClose={() => setMediaPickerFor(null)}
        />
      )}

      {/* SECTION ORDER */}
      <div style={card}>
        <div style={title}>HOMEPAGE SECTION ORDER</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "12px" }}>Reorder with the arrows — this is the order customers see. Your <strong>Addons</strong> appear here too (added at the end; move them anywhere).</p>
        {(() => { const fo = fullOrder(); return fo.map((key, i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid #E2E0DA", borderRadius: "8px", marginBottom: "8px", background: key.startsWith("addon:") ? "#F0F4FA" : "#FAFAF8" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#2A2830" }}>{i + 1}. {orderLabel(key)} {key.startsWith("addon:") && <span style={{ fontSize: "11px", color: "#1A5CFF", fontWeight: 700 }}>· addon</span>}</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => moveSection(i, -1)} disabled={i === 0} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
              <button onClick={() => moveSection(i, 1)} disabled={i === fo.length - 1} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === fo.length - 1 ? "not-allowed" : "pointer", opacity: i === fo.length - 1 ? 0.4 : 1 }}>↓</button>
            </div>
          </div>
        )); })()}
      </div>

      {/* ADDONS — extra content sections below hero & featured */}
      <div style={card}>
        <div style={title}>ADDONS</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "16px" }}>Add extra sections to your homepage — image + text, gallery, newsletter, text. They render below your hero &amp; featured grids. Toggle each with <strong>Shown</strong>.</p>
        <SectionsEditor
          sections={form.home_sections ?? []}
          onChange={(s) => set("home_sections", s)}
          products={allProducts}
          categories={allCategories}
          pages={pages}
          allowedTypes={["slideshow", "image_text", "gallery", "features", "testimonials", "faq", "logo_strip", "newsletter", "rich_text"]}
        />
      </div>

      {/* FOOTER + SUPPORT */}
      <div style={card}>
        <div style={title}>FOOTER &amp; SUPPORT</div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Footer tagline (optional)</label>
          <input style={input} value={form.footer_text} onChange={(e) => set("footer_text", e.target.value)} placeholder="A short line about your store" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div><label style={label}>Support Email</label><input style={input} value={form.support_email} onChange={(e) => set("support_email", e.target.value)} placeholder="support@yourstore.com" /></div>
          <div><label style={label}>Support Phone</label><input style={input} value={form.support_phone} onChange={(e) => set("support_phone", e.target.value)} placeholder="+1 (555) 123-4567" /></div>
        </div>
        <div>
          <label style={label}>Email Sender Name</label>
          <input style={input} value={form.email_sender_name} onChange={(e) => set("email_sender_name", e.target.value)} placeholder="e.g. Puma Wholesale Team (shown as the From name on emails)" />
        </div>
      </div>

      {!readOnly && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "40px" }}>
          <button onClick={handleSave} disabled={saving} style={{ background: saving ? "#9ca3af" : "#1C3557", color: "#fff", border: "none", padding: "12px 28px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      )}
      </fieldset>
    </div>
  );
}
