"use client";

import { useEffect, useRef, useState } from "react";
import { storefrontService } from "@/services/storefront.service";
import { DEFAULT_BRANDING, type Branding, type MenuItem, type SectionKey } from "@/components/providers/BrandingProvider";

const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Hero Banner",
  featured_categories: "Featured Categories",
  featured_products: "Featured Products",
};

export default function StorefrontSettingsPage() {
  const [form, setForm] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storefrontService.get()
      .then((b) => setForm({ ...DEFAULT_BRANDING, ...b }))
      .catch(() => setError("Failed to load storefront settings"))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Branding>(key: K, value: Branding[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  // ── Menu (with submenus) ───────────────────────────────────────────────────
  function updateMenu(next: MenuItem[]) { set("menu_items", next); }
  function setItem(i: number, patch: Partial<MenuItem>) {
    const m = [...form.menu_items]; const cur = m[i] ?? { label: "", href: "" };
    m[i] = { ...cur, ...patch }; updateMenu(m);
  }
  function addItem() { updateMenu([...form.menu_items, { label: "New Link", href: "/products" }]); }
  function removeItem(i: number) { updateMenu(form.menu_items.filter((_, x) => x !== i)); }
  function addChild(i: number) {
    const m = [...form.menu_items]; const cur = m[i]; if (!cur) return;
    m[i] = { ...cur, children: [...(cur.children ?? []), { label: "Sub Link", href: "/products" }] };
    updateMenu(m);
  }
  function setChild(i: number, j: number, patch: Partial<MenuItem>) {
    const m = [...form.menu_items]; const cur = m[i]; if (!cur) return;
    const kids = [...(cur.children ?? [])]; const curKid = kids[j] ?? { label: "", href: "" };
    kids[j] = { ...curKid, ...patch }; m[i] = { ...cur, children: kids }; updateMenu(m);
  }
  function removeChild(i: number, j: number) {
    const m = [...form.menu_items]; const cur = m[i]; if (!cur) return;
    m[i] = { ...cur, children: (cur.children ?? []).filter((_, x) => x !== j) }; updateMenu(m);
  }

  // ── Section order ──────────────────────────────────────────────────────────
  function moveSection(i: number, dir: -1 | 1) {
    const order = [...form.section_order]; const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const a = order[i]; const bb = order[j];
    if (a === undefined || bb === undefined) return;
    order[i] = bb; order[j] = a; set("section_order", order);
  }

  async function upload(kind: "logo" | "hero", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(kind); setError(null);
    try {
      const url = await storefrontService.uploadImage(file);
      set(kind === "logo" ? "logo_url" : "hero_image_url", url);
    } catch { setError("Upload failed — paste an image URL instead."); }
    finally { setUploading(null); if (kind === "logo" && logoRef.current) logoRef.current.value = ""; if (kind === "hero" && heroRef.current) heroRef.current.value = ""; }
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
          <button onClick={handleSave} disabled={saving} style={{ background: saving ? "#9ca3af" : "#1C3557", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}
      {saved && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>✓ Saved! Open Preview Store to see your changes.</div>}

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
            <input ref={logoRef} type="file" accept="image/*" onChange={(e) => upload("logo", e)} style={{ display: "none" }} />
            <button onClick={() => logoRef.current?.click()} disabled={uploading === "logo"} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>{uploading === "logo" ? "Uploading…" : "Upload Logo"}</button>
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

      {/* NAVIGATION MENU + submenus */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={title}>NAVIGATION MENU</div>
          <button onClick={addItem} style={{ background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "6px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Add Menu</button>
        </div>
        {form.menu_items.map((m, i) => (
          <div key={i} style={{ border: "1px solid #EEE", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input style={{ ...input, flex: "0 0 180px" }} value={m.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Label (e.g. T-Shirts)" />
              <input style={{ ...input, flex: 1 }} value={m.href} onChange={(e) => setItem(i, { href: e.target.value })} placeholder="/products?category=t-shirts" />
              <button onClick={() => removeItem(i)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
            </div>
            {/* submenu children */}
            <div style={{ marginTop: "8px", paddingLeft: "20px", borderLeft: "2px solid #EEE" }}>
              {(m.children ?? []).map((c, j) => (
                <div key={j} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ color: "#bbb", fontSize: "12px" }}>↳</span>
                  <input style={{ ...input, flex: "0 0 160px", padding: "7px 10px" }} value={c.label} onChange={(e) => setChild(i, j, { label: e.target.value })} placeholder="Sub label (Crewneck)" />
                  <input style={{ ...input, flex: 1, padding: "7px 10px" }} value={c.href} onChange={(e) => setChild(i, j, { href: e.target.value })} placeholder="/products?category=crewneck" />
                  <button onClick={() => removeChild(i, j)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "16px", cursor: "pointer" }}>×</button>
                </div>
              ))}
              <button onClick={() => addChild(i)} style={{ background: "transparent", border: "none", color: "#1C3557", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>+ Add sub-menu item</button>
            </div>
          </div>
        ))}
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
          <div><label style={label}>Button Link</label><input style={input} value={form.hero_cta_link} onChange={(e) => set("hero_cta_link", e.target.value)} placeholder="/products" /></div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={label}>Hero Image (optional)</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {form.hero_image_url && <img src={form.hero_image_url} alt="hero" style={{ height: "48px", width: "auto", objectFit: "cover", border: "1px solid #eee", borderRadius: "6px" }} />}
            <input ref={heroRef} type="file" accept="image/*" onChange={(e) => upload("hero", e)} style={{ display: "none" }} />
            <button onClick={() => heroRef.current?.click()} disabled={uploading === "hero"} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>{uploading === "hero" ? "Uploading…" : "Upload Image"}</button>
            {form.hero_image_url && <button onClick={() => set("hero_image_url", null)} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "13px", cursor: "pointer" }}>Remove</button>}
          </div>
          <input style={{ ...input, marginTop: "10px" }} value={form.hero_image_url ?? ""} onChange={(e) => set("hero_image_url", e.target.value || null)} placeholder="…or paste an image URL" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <ColorField k="hero_bg_color" name="Background" />
          <ColorField k="hero_text_color" name="Text" />
        </div>
      </div>

      {/* FEATURED SECTIONS */}
      <div style={card}>
        <div style={title}>FEATURED SECTIONS</div>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "8px" }}><Toggle k="show_featured_categories" text="Show Featured Categories" /></div>
          <input style={input} value={form.featured_categories_heading} onChange={(e) => set("featured_categories_heading", e.target.value)} placeholder="Shop by Category" />
        </div>
        <div>
          <div style={{ marginBottom: "8px" }}><Toggle k="show_featured_products" text="Show Featured Products (from your store)" /></div>
          <input style={input} value={form.featured_products_heading} onChange={(e) => set("featured_products_heading", e.target.value)} placeholder="Featured Products" />
        </div>
      </div>

      {/* SECTION ORDER */}
      <div style={card}>
        <div style={title}>HOMEPAGE SECTION ORDER</div>
        <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "12px" }}>Drag order with the arrows — this is the order customers see on your homepage.</p>
        {form.section_order.map((key, i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid #E2E0DA", borderRadius: "8px", marginBottom: "8px", background: "#FAFAF8" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#2A2830" }}>{i + 1}. {SECTION_LABELS[key]}</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => moveSection(i, -1)} disabled={i === 0} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
              <button onClick={() => moveSection(i, 1)} disabled={i === form.section_order.length - 1} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === form.section_order.length - 1 ? "not-allowed" : "pointer", opacity: i === form.section_order.length - 1 ? 0.4 : 1 }}>↓</button>
            </div>
          </div>
        ))}
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "40px" }}>
        <button onClick={handleSave} disabled={saving} style={{ background: saving ? "#9ca3af" : "#1C3557", color: "#fff", border: "none", padding: "12px 28px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}
