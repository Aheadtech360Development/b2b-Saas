"use client";

/**
 * SectionsEditor — reusable storefront section builder used by BOTH the Pages
 * editor and the Home page editor. Manages an array of sections: add, remove,
 * reorder, per-section show/hide, and all field editors (image via MediaPicker,
 * buttons via link picker, gallery, contact form, newsletter).
 */
import { useState } from "react";
import { MediaPicker } from "@/components/admin/MediaPicker";
import type { PageSection, PageButton, ContactField, GalleryImage, SlideItem, FeatureItem, TestimonialItem, FaqItem, LogoItem } from "@/components/storefront/SectionRenderer";
import type { StorefrontPageRecord } from "@/services/pages.service";
import type { Category } from "@/types/product.types";

export interface EditorProduct { id: string; name: string; slug?: string }

const SECTION_META: Record<string, { label: string; icon: string }> = {
  hero: { label: "Hero Banner", icon: "🖼" },
  slideshow: { label: "Slideshow", icon: "🎞" },
  image_text: { label: "Image + Text", icon: "📄" },
  rich_text: { label: "Text Block", icon: "✍️" },
  gallery: { label: "Gallery", icon: "🏞" },
  features: { label: "Features Row", icon: "⭐" },
  testimonials: { label: "Testimonials", icon: "💬" },
  faq: { label: "FAQ", icon: "❓" },
  logo_strip: { label: "Logo Strip", icon: "🏷" },
  newsletter: { label: "Newsletter", icon: "✉️" },
  contact_form: { label: "Contact Form", icon: "📬" },
};

const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { width: "100%", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "10px 12px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "20px", marginBottom: "18px" };
const btnGhost: React.CSSProperties = { background: "#F0F4FA", border: "1px solid #C9D6E8", color: "#1C3557", padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" };

function ColorInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} style={{ width: "44px", height: "38px", border: "1px solid #E2E0DA", borderRadius: "8px", cursor: "pointer", background: "#fff" }} />
      <input style={{ ...input, maxWidth: "120px" }} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="#ffffff" />
    </div>
  );
}

function ButtonEditor({ btn, products, categories, pages, onChange, onRemove }: {
  btn: PageButton;
  products: EditorProduct[];
  categories: Category[];
  pages: StorefrontPageRecord[];
  onChange: (b: PageButton) => void;
  onRemove: () => void;
}) {
  const smallInput: React.CSSProperties = { ...input, padding: "8px 10px", fontSize: "13px" };
  return (
    <div style={{ border: "1px solid #EEE", borderRadius: "8px", padding: "12px", marginBottom: "8px", background: "#FAFAF8" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
        <input style={{ ...smallInput, flex: 1 }} value={btn.text} onChange={(e) => onChange({ ...btn, text: e.target.value })} placeholder="Button text (e.g. Shop Now)" />
        <button onClick={onRemove} title="Remove button" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <select style={{ ...smallInput, flex: "0 0 130px" }} value={btn.link_type} onChange={(e) => onChange({ ...btn, link_type: e.target.value as PageButton["link_type"], link_value: "" })}>
          <option value="product">Product</option>
          <option value="category">Category</option>
          <option value="page">Page</option>
          <option value="custom">Custom URL</option>
        </select>
        {btn.link_type === "product" && (
          <select style={{ ...smallInput, flex: 1, minWidth: "180px" }} value={btn.link_value} onChange={(e) => onChange({ ...btn, link_value: e.target.value })}>
            <option value="">— select a product —</option>
            {products.filter((p) => p.slug).map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
        )}
        {btn.link_type === "category" && (
          <select style={{ ...smallInput, flex: 1, minWidth: "180px" }} value={btn.link_value} onChange={(e) => onChange({ ...btn, link_value: e.target.value })}>
            <option value="">— select a category —</option>
            {categories.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        )}
        {btn.link_type === "page" && (
          <select style={{ ...smallInput, flex: 1, minWidth: "180px" }} value={btn.link_value} onChange={(e) => onChange({ ...btn, link_value: e.target.value })}>
            <option value="">— select a page —</option>
            <option value="/">Home</option>
            <option value="/products">Shop All</option>
            {pages.map((p) => <option key={p.id} value={`/${p.slug}`}>{p.title}</option>)}
          </select>
        )}
        {btn.link_type === "custom" && (
          <input style={{ ...smallInput, flex: 1, minWidth: "180px" }} value={btn.link_value} onChange={(e) => onChange({ ...btn, link_value: e.target.value })} placeholder="https://example.com or /any-path" />
        )}
      </div>
    </div>
  );
}

export function SectionsEditor({ sections, onChange, products, categories, pages, allowedTypes }: {
  sections: PageSection[];
  onChange: (sections: PageSection[]) => void;
  products: EditorProduct[];
  categories: Category[];
  pages: StorefrontPageRecord[];
  allowedTypes?: string[];
}) {
  const [mediaPickerFor, setMediaPickerFor] = useState<{ kind: "section" | "gallery" | "slide" | "avatar" | "logos"; index: number; slideIdx?: number } | null>(null);
  const types = allowedTypes ?? Object.keys(SECTION_META);

  const genId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const updateSection = (i: number, patch: Partial<PageSection>) => onChange(sections.map((s, x) => (x === i ? { ...s, ...patch } : s)));
  const removeSection = (i: number) => onChange(sections.filter((_, x) => x !== i));
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const arr = [...sections];
    const a = arr[i], b = arr[j];
    if (a === undefined || b === undefined) return;
    arr[i] = b; arr[j] = a;
    onChange(arr);
  };
  function addSection(type: string) {
    const base: PageSection = type === "image_text"
      ? { type, heading: "", subheading: "", body: "", image_url: null, layout: "image_right", buttons: [] }
      : type === "hero"
      ? { type, heading: "", subheading: "", image_url: null, buttons: [] }
      : type === "contact_form"
      ? { type, heading: "Get in Touch", subheading: "", submit_text: "Send Message", fields: [
          { label: "Name", type: "text", required: true },
          { label: "Email", type: "email", required: true },
          { label: "Message", type: "textarea", required: true },
        ] }
      : type === "newsletter"
      ? { type, heading: "Join our newsletter", subheading: "Get the latest products and offers in your inbox.", submit_text: "Subscribe", placeholder: "Enter your email" }
      : type === "gallery"
      ? { type, heading: "Gallery", subheading: "", columns: 3, images: [] }
      : type === "slideshow"
      ? { type, interval: 5, slides: [{ image_url: null, heading: "Your headline here", subheading: "", button: { text: "Shop Now", link_type: "page", link_value: "/products" } }] }
      : type === "features"
      ? { type, heading: "Why Choose Us", subheading: "", features: [
          { icon: "🚚", title: "Fast Shipping", text: "Most orders ship within 24 hours." },
          { icon: "✅", title: "Quality Checked", text: "Every product inspected before it ships." },
          { icon: "💰", title: "Wholesale Pricing", text: "Better prices as your volume grows." },
        ] }
      : type === "testimonials"
      ? { type, heading: "What Our Customers Say", subheading: "", testimonials: [
          { quote: "Ordering has never been this easy. Fast, reliable, and great prices.", author: "Sara Ahmed", role: "Owner, Acme Traders", avatar_url: null },
        ] }
      : type === "faq"
      ? { type, heading: "Frequently Asked Questions", subheading: "", faqs: [
          { question: "What is the minimum order?", answer: "There is no minimum — order what your business needs." },
          { question: "How fast do you ship?", answer: "Most orders ship within 24 hours." },
        ] }
      : type === "logo_strip"
      ? { type, heading: "Trusted by", logos: [] }
      : { type, heading: "", body: "" };
    onChange([...sections, { ...base, id: genId() }]);
  }

  const setButtons = (i: number, buttons: PageButton[]) => updateSection(i, { buttons });
  const setFields = (i: number, fields: ContactField[]) => updateSection(i, { fields });
  const setGallery = (i: number, images: GalleryImage[]) => updateSection(i, { images });
  const setSlides = (i: number, slides: SlideItem[]) => updateSection(i, { slides });
  const setFeatures = (i: number, features: FeatureItem[]) => updateSection(i, { features });
  const setTestimonials = (i: number, testimonials: TestimonialItem[]) => updateSection(i, { testimonials });
  const setFaqs = (i: number, faqs: FaqItem[]) => updateSection(i, { faqs });
  const setLogos = (i: number, logos: LogoItem[]) => updateSection(i, { logos });
  const patchSlide = (i: number, si: number, patch: Partial<SlideItem>) => {
    const cur = sections[i]?.slides ?? [];
    setSlides(i, cur.map((sl, y) => (y === si ? { ...sl, ...patch } : sl)));
  };
  const moveSlide = (i: number, si: number, dir: -1 | 1) => {
    const cur = [...(sections[i]?.slides ?? [])];
    const j = si + dir; if (j < 0 || j >= cur.length) return;
    const a = cur[si], b = cur[j]; if (!a || !b) return;
    cur[si] = b; cur[j] = a; setSlides(i, cur);
  };

  return (
    <>
      {sections.map((s, i) => {
        const meta = SECTION_META[s.type] ?? { label: s.type, icon: "▫" };
        const enabled = s.enabled !== false;
        return (
          <div key={i} style={{ ...card, opacity: enabled ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "17px", letterSpacing: ".04em", color: "#2A2830" }}>{meta.icon} {meta.label}</div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#555", cursor: "pointer", marginRight: "6px" }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => updateSection(i, { enabled: e.target.checked })} /> Shown
                </label>
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "4px 10px", cursor: i === sections.length - 1 ? "not-allowed" : "pointer", opacity: i === sections.length - 1 ? 0.4 : 1 }}>↓</button>
                <button onClick={() => removeSection(i)} title="Remove section" style={{ background: "#fff", border: "1px solid #F1C4C4", borderRadius: "6px", color: "#B91C1C", padding: "4px 10px", cursor: "pointer" }}>🗑</button>
              </div>
            </div>

            {/* Heading (all types except slideshow which uses per-slide text) */}
            {s.type !== "slideshow" && (
              <div style={{ marginBottom: "12px" }}>
                <label style={label}>Heading</label>
                <input style={input} value={s.heading ?? ""} onChange={(e) => updateSection(i, { heading: e.target.value })} placeholder="Section heading" />
              </div>
            )}

            {/* Slideshow — slides with image + text + button */}
            {s.type === "slideshow" && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ marginBottom: "12px", maxWidth: "220px" }}>
                  <label style={label}>Auto-rotate every (seconds)</label>
                  <input type="number" min={2} max={30} style={input} value={s.interval ?? 5} onChange={(e) => updateSection(i, { interval: Number(e.target.value) })} />
                </div>
                {(s.slides ?? []).map((sl, si) => (
                  <div key={si} style={{ border: "1px solid #E2E0DA", borderRadius: "10px", padding: "14px", marginBottom: "12px", background: "#FAFAF8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#555" }}>Slide {si + 1}</span>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => moveSlide(i, si, -1)} disabled={si === 0} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "3px 9px", cursor: si === 0 ? "not-allowed" : "pointer", opacity: si === 0 ? 0.4 : 1 }}>↑</button>
                        <button onClick={() => moveSlide(i, si, 1)} disabled={si === (s.slides?.length ?? 0) - 1} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "3px 9px", cursor: si === (s.slides?.length ?? 0) - 1 ? "not-allowed" : "pointer", opacity: si === (s.slides?.length ?? 0) - 1 ? 0.4 : 1 }}>↓</button>
                        <button onClick={() => setSlides(i, (s.slides ?? []).filter((_, y) => y !== si))} title="Remove slide" style={{ background: "#fff", border: "1px solid #F1C4C4", borderRadius: "6px", color: "#B91C1C", padding: "3px 9px", cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                      {sl.image_url && <img src={sl.image_url} alt="" style={{ height: "46px", width: "auto", objectFit: "cover", border: "1px solid #eee", borderRadius: "6px" }} />}
                      <button onClick={() => setMediaPickerFor({ kind: "slide", index: i, slideIdx: si })} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Choose Image</button>
                      {sl.image_url && <button onClick={() => patchSlide(i, si, { image_url: null })} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "13px", cursor: "pointer" }}>Remove</button>}
                    </div>
                    <input style={{ ...input, marginBottom: "8px" }} value={sl.image_url ?? ""} onChange={(e) => patchSlide(i, si, { image_url: e.target.value || null })} placeholder="…or paste image URL" />
                    <input style={{ ...input, marginBottom: "8px" }} value={sl.heading ?? ""} onChange={(e) => patchSlide(i, si, { heading: e.target.value })} placeholder="Slide heading" />
                    <input style={{ ...input, marginBottom: "8px" }} value={sl.subheading ?? ""} onChange={(e) => patchSlide(i, si, { subheading: e.target.value })} placeholder="Slide sub-heading (optional)" />
                    <label style={label}>Button (optional)</label>
                    <ButtonEditor
                      btn={sl.button ?? { text: "", link_type: "page", link_value: "/products" }}
                      products={products}
                      categories={categories}
                      pages={pages}
                      onChange={(nb) => patchSlide(i, si, { button: nb })}
                      onRemove={() => patchSlide(i, si, { button: undefined })}
                    />
                  </div>
                ))}
                <button onClick={() => setSlides(i, [...(s.slides ?? []), { image_url: null, heading: "", subheading: "", button: { text: "", link_type: "page", link_value: "/products" } }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Slide</button>
              </div>
            )}

            {/* Subheading */}
            {(s.type === "hero" || s.type === "image_text" || s.type === "contact_form" || s.type === "gallery" || s.type === "newsletter" || s.type === "features" || s.type === "testimonials" || s.type === "faq") && (
              <div style={{ marginBottom: "12px" }}>
                <label style={label}>Sub-heading</label>
                <input style={input} value={s.subheading ?? ""} onChange={(e) => updateSection(i, { subheading: e.target.value })} placeholder="A short supporting line" />
              </div>
            )}

            {/* Newsletter fields */}
            {s.type === "newsletter" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div><label style={label}>Input Placeholder</label><input style={input} value={s.placeholder ?? ""} onChange={(e) => updateSection(i, { placeholder: e.target.value })} placeholder="Enter your email" /></div>
                <div><label style={label}>Button Text</label><input style={input} value={s.submit_text ?? ""} onChange={(e) => updateSection(i, { submit_text: e.target.value })} placeholder="Subscribe" /></div>
                <div style={{ gridColumn: "1 / -1" }}><p style={{ fontSize: "12px", color: "#7A7880" }}>Sign-ups land in <strong>Admin → Messages</strong>.</p></div>
              </div>
            )}

            {/* Features row */}
            {s.type === "features" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={label}>Features (up to 4 show per row)</label>
                {(s.features ?? []).map((f, fi) => (
                  <div key={fi} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px", flexWrap: "wrap", background: "#FAFAF8", border: "1px solid #EEE", borderRadius: "8px", padding: "10px" }}>
                    <input style={{ ...input, flex: "0 0 62px", padding: "8px", fontSize: "18px", textAlign: "center" }} value={f.icon ?? ""} onChange={(e) => setFeatures(i, (s.features ?? []).map((x, y) => y === fi ? { ...x, icon: e.target.value } : x))} placeholder="🚚" />
                    <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <input style={{ ...input, padding: "8px 10px", fontSize: "13px" }} value={f.title ?? ""} onChange={(e) => setFeatures(i, (s.features ?? []).map((x, y) => y === fi ? { ...x, title: e.target.value } : x))} placeholder="Feature title" />
                      <textarea style={{ ...input, padding: "8px 10px", fontSize: "13px", minHeight: "52px", resize: "vertical", fontFamily: "inherit" }} value={f.text ?? ""} onChange={(e) => setFeatures(i, (s.features ?? []).map((x, y) => y === fi ? { ...x, text: e.target.value } : x))} placeholder="Short description" />
                    </div>
                    <button onClick={() => setFeatures(i, (s.features ?? []).filter((_, y) => y !== fi))} title="Remove" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
                  </div>
                ))}
                <button onClick={() => setFeatures(i, [...(s.features ?? []), { icon: "★", title: "New feature", text: "" }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Feature</button>
              </div>
            )}

            {/* Testimonials */}
            {s.type === "testimonials" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={label}>Testimonials (up to 3 per row)</label>
                {(s.testimonials ?? []).map((t, ti) => (
                  <div key={ti} style={{ background: "#FAFAF8", border: "1px solid #EEE", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#555" }}>Quote {ti + 1}</span>
                      <button onClick={() => setTestimonials(i, (s.testimonials ?? []).filter((_, y) => y !== ti))} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
                    </div>
                    <textarea style={{ ...input, minHeight: "64px", resize: "vertical", fontFamily: "inherit", marginBottom: "8px" }} value={t.quote ?? ""} onChange={(e) => setTestimonials(i, (s.testimonials ?? []).map((x, y) => y === ti ? { ...x, quote: e.target.value } : x))} placeholder="What the customer said…" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                      <input style={{ ...input, padding: "8px 10px", fontSize: "13px" }} value={t.author ?? ""} onChange={(e) => setTestimonials(i, (s.testimonials ?? []).map((x, y) => y === ti ? { ...x, author: e.target.value } : x))} placeholder="Author name" />
                      <input style={{ ...input, padding: "8px 10px", fontSize: "13px" }} value={t.role ?? ""} onChange={(e) => setTestimonials(i, (s.testimonials ?? []).map((x, y) => y === ti ? { ...x, role: e.target.value } : x))} placeholder="Role / company" />
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      {t.avatar_url && <img src={t.avatar_url} alt="" style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover" }} />}
                      <button onClick={() => setMediaPickerFor({ kind: "avatar", index: i, slideIdx: ti })} style={{ ...btnGhost }}>🖼 Avatar</button>
                      {t.avatar_url && <button onClick={() => setTestimonials(i, (s.testimonials ?? []).map((x, y) => y === ti ? { ...x, avatar_url: null } : x))} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "12px", cursor: "pointer" }}>Remove</button>}
                    </div>
                  </div>
                ))}
                <button onClick={() => setTestimonials(i, [...(s.testimonials ?? []), { quote: "", author: "", role: "", avatar_url: null }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Testimonial</button>
              </div>
            )}

            {/* FAQ */}
            {s.type === "faq" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={label}>Questions</label>
                {(s.faqs ?? []).map((f, qi) => (
                  <div key={qi} style={{ background: "#FAFAF8", border: "1px solid #EEE", borderRadius: "8px", padding: "12px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                      <input style={{ ...input, flex: 1, padding: "8px 10px", fontSize: "13px" }} value={f.question ?? ""} onChange={(e) => setFaqs(i, (s.faqs ?? []).map((x, y) => y === qi ? { ...x, question: e.target.value } : x))} placeholder="Question" />
                      <button onClick={() => setFaqs(i, (s.faqs ?? []).filter((_, y) => y !== qi))} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
                    </div>
                    <textarea style={{ ...input, minHeight: "56px", resize: "vertical", fontFamily: "inherit", fontSize: "13px" }} value={f.answer ?? ""} onChange={(e) => setFaqs(i, (s.faqs ?? []).map((x, y) => y === qi ? { ...x, answer: e.target.value } : x))} placeholder="Answer" />
                  </div>
                ))}
                <button onClick={() => setFaqs(i, [...(s.faqs ?? []), { question: "", answer: "" }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Question</button>
              </div>
            )}

            {/* Logo strip */}
            {s.type === "logo_strip" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={label}>Logos</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                  {(s.logos ?? []).map((l, li) => (
                    <div key={li} style={{ border: "1px solid #EEE", borderRadius: "8px", padding: "8px", background: "#FAFAF8" }}>
                      <div style={{ position: "relative", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "6px", marginBottom: "6px" }}>
                        {l.url ? <img src={l.url} alt="" style={{ maxHeight: "34px", maxWidth: "100%", objectFit: "contain" }} /> : <span style={{ color: "#bbb", fontSize: "11px" }}>No logo</span>}
                        <button onClick={() => setLogos(i, (s.logos ?? []).filter((_, y) => y !== li))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: "50%", width: "20px", height: "20px", cursor: "pointer", fontSize: "12px", lineHeight: 1 }}>×</button>
                      </div>
                      <input style={{ ...input, padding: "6px 8px", fontSize: "11px" }} value={l.url ?? ""} onChange={(e) => setLogos(i, (s.logos ?? []).map((x, y) => y === li ? { ...x, url: e.target.value } : x))} placeholder="Logo URL" />
                    </div>
                  ))}
                </div>
                <button onClick={() => setMediaPickerFor({ kind: "logos", index: i })} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Add from Library</button>
              </div>
            )}

            {/* Contact form fields */}
            {s.type === "contact_form" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={label}>Form Fields</label>
                {(s.fields ?? []).map((f, fi) => (
                  <div key={fi} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", background: "#FAFAF8", border: "1px solid #EEE", borderRadius: "8px", padding: "10px" }}>
                    <input style={{ ...input, flex: "1 1 150px", padding: "8px 10px", fontSize: "13px" }} value={f.label} onChange={(e) => setFields(i, (s.fields ?? []).map((x, y) => y === fi ? { ...x, label: e.target.value } : x))} placeholder="Field label (e.g. Company)" />
                    <select style={{ ...input, flex: "0 0 120px", padding: "8px 10px", fontSize: "13px" }} value={f.type} onChange={(e) => setFields(i, (s.fields ?? []).map((x, y) => y === fi ? { ...x, type: e.target.value as ContactField["type"] } : x))}>
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                      <option value="tel">Phone</option>
                      <option value="textarea">Long text</option>
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#555", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!f.required} onChange={(e) => setFields(i, (s.fields ?? []).map((x, y) => y === fi ? { ...x, required: e.target.checked } : x))} /> Required
                    </label>
                    <button onClick={() => setFields(i, (s.fields ?? []).filter((_, y) => y !== fi))} title="Remove field" style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "18px", cursor: "pointer" }}>×</button>
                  </div>
                ))}
                <button onClick={() => setFields(i, [...(s.fields ?? []), { label: "New Field", type: "text", required: false }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Field</button>
                <div style={{ marginTop: "12px" }}>
                  <label style={label}>Submit Button Text</label>
                  <input style={input} value={s.submit_text ?? ""} onChange={(e) => updateSection(i, { submit_text: e.target.value })} placeholder="Send Message" />
                </div>
                <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "8px" }}>Submissions land in <strong>Admin → Messages</strong>.</p>
              </div>
            )}

            {/* Gallery */}
            {s.type === "gallery" && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={label}>Columns</label>
                  <select style={{ ...input, maxWidth: "160px" }} value={s.columns ?? 3} onChange={(e) => updateSection(i, { columns: Number(e.target.value) })}>
                    {[2, 3, 4].map((n) => <option key={n} value={n}>{n} per row</option>)}
                  </select>
                </div>
                <label style={label}>Images</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                  {(s.images ?? []).map((im, gi) => (
                    <div key={gi} style={{ border: "1px solid #EEE", borderRadius: "8px", padding: "8px", background: "#FAFAF8" }}>
                      <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "6px", overflow: "hidden", background: "#F4F3EF", marginBottom: "6px" }}>
                        {im.url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={im.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: "12px" }}>No image</span>}
                        <button onClick={() => setGallery(i, (s.images ?? []).filter((_, y) => y !== gi))} title="Remove" style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: "50%", width: "22px", height: "22px", cursor: "pointer", fontSize: "13px", lineHeight: 1 }}>×</button>
                      </div>
                      <input style={{ ...input, padding: "6px 8px", fontSize: "12px" }} value={im.caption ?? ""} onChange={(e) => setGallery(i, (s.images ?? []).map((x, y) => y === gi ? { ...x, caption: e.target.value } : x))} placeholder="Caption (optional)" />
                      <input style={{ ...input, padding: "6px 8px", fontSize: "11px", marginTop: "5px" }} value={im.url ?? ""} onChange={(e) => setGallery(i, (s.images ?? []).map((x, y) => y === gi ? { ...x, url: e.target.value } : x))} placeholder="Image URL" />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => setMediaPickerFor({ kind: "gallery", index: i })} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Add from Library</button>
                  <button onClick={() => setGallery(i, [...(s.images ?? []), { url: "", caption: "" }])} style={{ ...btnGhost }}>+ Add by URL</button>
                </div>
              </div>
            )}

            {/* Body */}
            {(s.type === "image_text" || s.type === "rich_text") && (
              <div style={{ marginBottom: "12px" }}>
                <label style={label}>Body Text</label>
                <textarea style={{ ...input, minHeight: "90px", resize: "vertical", fontFamily: "inherit" }} value={s.body ?? ""} onChange={(e) => updateSection(i, { body: e.target.value })} placeholder="Paragraph text…" />
              </div>
            )}

            {/* Image */}
            {(s.type === "hero" || s.type === "image_text") && (
              <div style={{ marginBottom: "12px" }}>
                <label style={label}>Image</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {s.image_url && <img src={s.image_url} alt="" style={{ height: "46px", width: "auto", objectFit: "cover", border: "1px solid #eee", borderRadius: "6px" }} />}
                  <button onClick={() => setMediaPickerFor({ kind: "section", index: i })} style={{ background: "#fff", border: "1px solid #1C3557", color: "#1C3557", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>🖼 Choose Image</button>
                  {s.image_url && <button onClick={() => updateSection(i, { image_url: null })} style={{ background: "transparent", border: "none", color: "#B91C1C", fontSize: "13px", cursor: "pointer" }}>Remove</button>}
                </div>
                <input style={{ ...input, marginTop: "10px" }} value={s.image_url ?? ""} onChange={(e) => updateSection(i, { image_url: e.target.value || null })} placeholder="…or paste an image URL" />
              </div>
            )}

            {/* Layout */}
            {s.type === "image_text" && (
              <div style={{ marginBottom: "12px" }}>
                <label style={label}>Layout</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["image_left", "image_right"] as const).map((opt) => (
                    <button key={opt} onClick={() => updateSection(i, { layout: opt })} style={{ flex: 1, padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: (s.layout ?? "image_right") === opt ? "2px solid #1C3557" : "1px solid #E2E0DA", background: (s.layout ?? "image_right") === opt ? "#F0F4FA" : "#fff", color: "#2A2830" }}>
                      {opt === "image_left" ? "◧ Image left · Text right" : "Text left · Image right ◨"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Colors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div><label style={label}>Background</label><ColorInput value={s.bg_color} onChange={(v) => updateSection(i, { bg_color: v })} /></div>
              <div><label style={label}>Text Color</label><ColorInput value={s.text_color} onChange={(v) => updateSection(i, { text_color: v })} /></div>
            </div>

            {/* Buttons */}
            {(s.type === "hero" || s.type === "image_text") && (
              <div>
                <label style={label}>Buttons</label>
                {(s.buttons ?? []).map((b, bi) => (
                  <ButtonEditor
                    key={bi}
                    btn={b}
                    products={products}
                    categories={categories}
                    pages={pages}
                    onChange={(nb) => setButtons(i, (s.buttons ?? []).map((x, y) => (y === bi ? nb : x)))}
                    onRemove={() => setButtons(i, (s.buttons ?? []).filter((_, y) => y !== bi))}
                  />
                ))}
                <button onClick={() => setButtons(i, [...(s.buttons ?? []), { text: "Learn More", link_type: "page", link_value: "/products" }])} style={{ ...btnGhost, marginTop: "4px" }}>+ Add Button</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Add section */}
      <div style={{ ...card, borderStyle: "dashed", textAlign: "center" }}>
        <div style={{ fontSize: "13px", color: "#7A7880", marginBottom: "12px", fontWeight: 600 }}>Add a section</div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          {types.map((type) => {
            const m = SECTION_META[type] ?? { label: type, icon: "▫" };
            return <button key={type} onClick={() => addSection(type)} style={{ ...btnGhost, padding: "10px 18px", fontSize: "13px" }}>{m.icon} {m.label}</button>;
          })}
        </div>
      </div>

      {/* Media Library picker */}
      {mediaPickerFor && (
        <MediaPicker
          multiple={mediaPickerFor.kind === "gallery" || mediaPickerFor.kind === "logos"}
          onSelect={(url) => {
            const { kind, index, slideIdx } = mediaPickerFor;
            if (kind === "section") {
              updateSection(index, { image_url: url });
            } else if (kind === "slide" && slideIdx !== undefined) {
              patchSlide(index, slideIdx, { image_url: url });
            } else if (kind === "avatar" && slideIdx !== undefined) {
              const cur = sections[index]?.testimonials ?? [];
              setTestimonials(index, cur.map((x, y) => (y === slideIdx ? { ...x, avatar_url: url } : x)));
            } else if (kind === "logos") {
              setLogos(index, [...(sections[index]?.logos ?? []), { url }]);
            } else {
              const cur = sections[index]?.images ?? [];
              setGallery(index, [...cur, { url, caption: "" }]);
            }
          }}
          onSelectMultiple={(urls) => {
            const { kind, index } = mediaPickerFor;
            if (kind === "logos") {
              setLogos(index, [...(sections[index]?.logos ?? []), ...urls.map((u) => ({ url: u }))]);
            } else {
              const cur = sections[index]?.images ?? [];
              setGallery(index, [...cur, ...urls.map((u) => ({ url: u, caption: "" }))]);
            }
          }}
          onClose={() => setMediaPickerFor(null)}
        />
      )}
    </>
  );
}
