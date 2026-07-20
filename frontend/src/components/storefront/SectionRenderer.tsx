"use client";

/**
 * SectionRenderer — renders a storefront page from its `sections` array.
 * Section types: image_text, rich_text, hero, contact_form.
 * Every button resolves its link via link_type (page / product / category / custom).
 */
import Link from "next/link";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { useBranding } from "@/components/providers/BrandingProvider";

export interface PageButton {
  text: string;
  link_type: "page" | "product" | "category" | "custom";
  link_value: string;
}

export interface ContactField {
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required?: boolean;
}

export interface GalleryImage {
  url: string;
  caption?: string;
}

export interface SlideItem {
  image_url?: string | null;
  heading?: string;
  subheading?: string;
  button?: PageButton;
}

export interface FeatureItem {
  icon?: string;
  title?: string;
  text?: string;
}

export interface TestimonialItem {
  quote?: string;
  author?: string;
  role?: string;
  avatar_url?: string | null;
}

export interface FaqItem {
  question?: string;
  answer?: string;
}

export interface LogoItem {
  url: string;
  alt?: string;
}

export interface PageSection {
  /** Stable id — used to position homepage addons in the section order. */
  id?: string;
  type: string;
  heading?: string;
  subheading?: string;
  body?: string;
  image_url?: string | null;
  layout?: "image_left" | "image_right";
  bg_color?: string;
  text_color?: string;
  buttons?: PageButton[];
  // contact_form
  fields?: ContactField[];
  submit_text?: string;
  // gallery
  images?: GalleryImage[];
  columns?: number;
  // slideshow
  slides?: SlideItem[];
  interval?: number;
  // newsletter
  placeholder?: string;
  // features / testimonials / faq / logo_strip
  features?: FeatureItem[];
  testimonials?: TestimonialItem[];
  faqs?: FaqItem[];
  logos?: LogoItem[];
  // per-section visibility (false = hidden)
  enabled?: boolean;
}

export function resolveHref(b: PageButton): string {
  switch (b.link_type) {
    case "product": return `/products/${b.link_value}`;
    case "category": return `/products?category=${b.link_value}`;
    case "page": return b.link_value.startsWith("/") ? b.link_value : `/${b.link_value}`;
    default: return b.link_value || "#";
  }
}

function Buttons({ buttons, color }: { buttons?: PageButton[]; color: string }) {
  if (!buttons?.length) return null;
  return (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "22px" }}>
      {buttons.map((b, i) => (
        <Link key={i} href={resolveHref(b)}
          style={{ display: "inline-block", background: i === 0 ? color : "transparent", color: i === 0 ? "#fff" : color, border: `1.5px solid ${color}`, padding: "12px 26px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "var(--brand-btn-radius, 4px)" }}>
          {b.text} →
        </Link>
      ))}
    </div>
  );
}

function ImageText({ s, primary }: { s: PageSection; primary: string }) {
  const imgRight = (s.layout ?? "image_right") === "image_right";
  const text = (
    <div>
      {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "38px", fontWeight: 600, color: s.text_color || "#1A1A1A", lineHeight: 1.15, marginBottom: "16px" }}>{s.heading}</h2>}
      {s.subheading && <p style={{ fontSize: "17px", color: "#6B6B6B", marginBottom: "12px", fontWeight: 500 }}>{s.subheading}</p>}
      {s.body && <p style={{ fontSize: "16px", color: "#4B4B4B", lineHeight: 1.7 }}>{s.body}</p>}
      <Buttons buttons={s.buttons} color={primary} />
    </div>
  );
  const image = (
    <div style={{ background: "#F4F3EF", borderRadius: "6px", overflow: "hidden", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {s.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image_url} alt={s.heading ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ color: "#bbb", fontSize: "13px" }}>Image</span>
      )}
    </div>
  );
  return (
    <section style={{ background: s.bg_color || "#fff", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div className="section-imgtext-grid" style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px", alignItems: "center" }}>
        {imgRight ? <>{text}{image}</> : <>{image}{text}</>}
      </div>
    </section>
  );
}

function RichText({ s }: { s: PageSection }) {
  return (
    <section style={{ background: s.bg_color || "#FAFAF8", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto", textAlign: "center" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", marginBottom: "16px" }}>{s.heading}</h2>}
        {s.body && <p style={{ fontSize: "17px", color: "#4B4B4B", lineHeight: 1.75 }}>{s.body}</p>}
      </div>
    </section>
  );
}

function HeroBlock({ s, primary }: { s: PageSection; primary: string }) {
  return (
    <section style={{ background: s.bg_color || "#F8F8F6" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "80px 24px", display: "grid", gridTemplateColumns: s.image_url ? "1fr 1fr" : "1fr", gap: "48px", alignItems: "center" }}>
        <div>
          {s.heading && <h1 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "48px", fontWeight: 600, color: s.text_color || "#1A1A1A", lineHeight: 1.1, marginBottom: "16px" }}>{s.heading}</h1>}
          {s.subheading && <p style={{ fontSize: "18px", color: "#6B6B6B", marginBottom: "8px" }}>{s.subheading}</p>}
          <Buttons buttons={s.buttons} color={primary} />
        </div>
        {s.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image_url} alt={s.heading ?? ""} style={{ width: "100%", borderRadius: "4px", objectFit: "cover", maxHeight: "440px" }} />
        )}
      </div>
    </section>
  );
}

function Gallery({ s }: { s: PageSection }) {
  const imgs = (s.images ?? []).filter((i) => i.url);
  const cols = Math.min(Math.max(s.columns ?? 3, 2), 4);
  return (
    <section style={{ background: s.bg_color || "#fff", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", marginBottom: "8px", textAlign: "center" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: "#6B6B6B", marginBottom: "8px", textAlign: "center" }}>{s.subheading}</p>}
        {imgs.length > 0 && (
          <div className="sr-gallery-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "16px", marginTop: "28px" }}>
            {imgs.map((im, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <div style={{ overflow: "hidden", borderRadius: "var(--brand-radius, 8px)", aspectRatio: "1 / 1", background: "#F4F3EF", boxShadow: "var(--brand-card-shadow, none)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={im.url}
                    alt={im.caption ?? ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .35s ease", display: "block" }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  />
                </div>
                {im.caption && <figcaption style={{ fontSize: "13px", color: "#6B6B6B", textAlign: "center", marginTop: "8px" }}>{im.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 900px) { .sr-gallery-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 520px) { .sr-gallery-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

function ContactForm({ s, primary }: { s: PageSection; primary: string }) {
  const fields: ContactField[] = s.fields?.length
    ? s.fields
    : [
        { label: "Name", type: "text", required: true },
        { label: "Email", type: "email", required: true },
        { label: "Message", type: "textarea", required: true },
      ];
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #D9D8D2", borderRadius: "6px", padding: "12px 14px",
    fontSize: "15px", outline: "none", boxSizing: "border-box", background: "#fff", fontFamily: "inherit",
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const page_slug = typeof window !== "undefined" ? window.location.pathname.replace(/^\//, "") : "";
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug, form_name: s.heading || "Contact", data: values,
      }, { skipAuth: true });
      setStatus("sent");
      setValues({});
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <section style={{ background: s.bg_color || "#FAFAF8", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
        <div style={{ maxWidth: "620px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>✓</div>
          <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "30px", color: s.text_color || "#1A1A1A", marginBottom: "8px" }}>Thank you!</h2>
          <p style={{ fontSize: "16px", color: "#6B6B6B" }}>Your message has been received. We&apos;ll get back to you soon.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: s.bg_color || "#FAFAF8", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "620px", margin: "0 auto" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", marginBottom: "8px", textAlign: "center" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: "#6B6B6B", marginBottom: "28px", textAlign: "center" }}>{s.subheading}</p>}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {fields.map((f, i) => (
            <div key={i}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4B4B4B", marginBottom: "6px" }}>
                {f.label}{f.required && <span style={{ color: "#B91C1C" }}> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea required={f.required} value={values[f.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))} style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }} />
              ) : (
                <input type={f.type} required={f.required} value={values[f.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))} style={inputStyle} />
              )}
            </div>
          ))}
          {status === "error" && <p style={{ color: "#B91C1C", fontSize: "14px" }}>Something went wrong. Please try again.</p>}
          <button type="submit" disabled={status === "sending"} style={{ background: primary, color: "#fff", border: "none", padding: "14px 28px", fontSize: "15px", fontWeight: 600, borderRadius: "4px", cursor: status === "sending" ? "not-allowed" : "pointer", opacity: status === "sending" ? 0.7 : 1, marginTop: "4px" }}>
            {status === "sending" ? "Sending…" : (s.submit_text || "Send Message")}
          </button>
        </form>
      </div>
    </section>
  );
}

/** Shared card treatment so new sections inherit the active theme's style. */
const themeCard: React.CSSProperties = {
  background: "var(--brand-card-bg, #fff)",
  border: "var(--brand-card-border, 1px solid #E2E2DE)",
  borderRadius: "var(--brand-card-radius, 6px)",
  boxShadow: "var(--brand-card-shadow, none)",
};

function Features({ s, primary }: { s: PageSection; primary: string }) {
  const items = (s.features ?? []).filter((f) => f.title || f.text || f.icon);
  if (items.length === 0) return null;
  return (
    <section style={{ background: s.bg_color || "#fff", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", textAlign: "center", marginBottom: "8px" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: "#6B6B6B", textAlign: "center", marginBottom: "10px" }}>{s.subheading}</p>}
        <div className="sr-features-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`, gap: "20px", marginTop: "30px" }}>
          {items.map((f, i) => (
            <div key={i} style={{ ...themeCard, padding: "26px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>{f.icon || "★"}</div>
              {f.title && <div style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "18px", fontWeight: 700, color: s.text_color || "#1A1A1A", marginBottom: "6px" }}>{f.title}</div>}
              {f.text && <p style={{ fontSize: "14px", color: "#6B6B6B", lineHeight: 1.6 }}>{f.text}</p>}
              <div style={{ height: "3px", width: "34px", background: primary, margin: "14px auto 0", borderRadius: "2px" }} />
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:820px){.sr-features-grid{grid-template-columns:1fr 1fr !important}}@media(max-width:520px){.sr-features-grid{grid-template-columns:1fr !important}}`}</style>
    </section>
  );
}

function Testimonials({ s, primary }: { s: PageSection; primary: string }) {
  const items = (s.testimonials ?? []).filter((t) => t.quote);
  if (items.length === 0) return null;
  return (
    <section style={{ background: s.bg_color || "#FAFAF8", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", textAlign: "center", marginBottom: "8px" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: "#6B6B6B", textAlign: "center" }}>{s.subheading}</p>}
        <div className="sr-testi-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, minmax(0, 1fr))`, gap: "20px", marginTop: "30px" }}>
          {items.map((t, i) => (
            <figure key={i} style={{ ...themeCard, padding: "26px 24px", margin: 0 }}>
              <div style={{ color: primary, fontSize: "34px", lineHeight: 1, fontFamily: "Georgia, serif" }}>&ldquo;</div>
              <blockquote style={{ margin: "6px 0 18px", fontSize: "15.5px", color: "#3A3A3A", lineHeight: 1.7 }}>{t.quote}</blockquote>
              <figcaption style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {t.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.avatar_url} alt={t.author ?? ""} style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <span style={{ width: "38px", height: "38px", borderRadius: "50%", background: primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px" }}>
                    {(t.author || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div>
                  {t.author && <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{t.author}</div>}
                  {t.role && <div style={{ fontSize: "12.5px", color: "#8A8A8A" }}>{t.role}</div>}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:820px){.sr-testi-grid{grid-template-columns:1fr !important}}`}</style>
    </section>
  );
}

function Faq({ s, primary }: { s: PageSection; primary: string }) {
  const items = (s.faqs ?? []).filter((f) => f.question);
  const [open, setOpen] = useState<number | null>(0);
  if (items.length === 0) return null;
  return (
    <section style={{ background: s.bg_color || "#fff", padding: "var(--brand-section-py, 64px) 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "34px", fontWeight: 600, color: s.text_color || "#1A1A1A", textAlign: "center", marginBottom: "8px" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: "#6B6B6B", textAlign: "center", marginBottom: "26px" }}>{s.subheading}</p>}
        {items.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ ...themeCard, marginBottom: "10px", overflow: "hidden" }}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", background: "transparent", border: "none", padding: "18px 20px", cursor: "pointer", textAlign: "left", fontSize: "16px", fontWeight: 600, color: "#1A1A1A", fontFamily: "inherit" }}
              >
                {f.question}
                <span style={{ color: primary, fontSize: "20px", lineHeight: 1, transform: isOpen ? "rotate(45deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>+</span>
              </button>
              {isOpen && f.answer && (
                <div style={{ padding: "0 20px 20px", fontSize: "15px", color: "#5A5A5A", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{f.answer}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LogoStrip({ s }: { s: PageSection }) {
  const items = (s.logos ?? []).filter((l) => l.url);
  if (items.length === 0) return null;
  return (
    <section style={{ background: s.bg_color || "#FAFAF8", padding: "44px 24px", borderTop: "1px solid #EFEEE9" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {s.heading && <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#9A9A9A", textAlign: "center", marginBottom: "24px" }}>{s.heading}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "40px" }}>
          {items.map((l, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={l.url} alt={l.alt ?? ""} style={{ maxHeight: "38px", width: "auto", objectFit: "contain", filter: "grayscale(100%)", opacity: 0.65, transition: "all .2s" }}
              onMouseOver={(e) => { e.currentTarget.style.filter = "none"; e.currentTarget.style.opacity = "1"; }}
              onMouseOut={(e) => { e.currentTarget.style.filter = "grayscale(100%)"; e.currentTarget.style.opacity = "0.65"; }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Slideshow({ s, primary }: { s: PageSection; primary: string }) {
  const slides = (s.slides ?? []).filter((sl) => sl.image_url || sl.heading || sl.subheading);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const secs = s.interval && s.interval > 0 ? s.interval : 5;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), secs * 1000);
    return () => clearInterval(t);
  }, [slides.length, s.interval]);

  const cur = slides[Math.min(idx, slides.length - 1)];
  if (!cur) return null;
  const go = (d: number) => setIdx((i) => (i + d + slides.length) % slides.length);

  return (
    <section style={{ position: "relative", width: "100%", height: "clamp(340px, 52vw, 520px)", overflow: "hidden", background: s.bg_color || "#1A1A1A" }}>
      {cur.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cur.image_url} alt={cur.heading ?? ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15))" }} />
      <div style={{ position: "relative", zIndex: 2, maxWidth: "1200px", margin: "0 auto", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 48px" }}>
        {cur.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 600, color: s.text_color || "#fff", lineHeight: 1.1, marginBottom: "12px", maxWidth: "620px" }}>{cur.heading}</h2>}
        {cur.subheading && <p style={{ fontSize: "clamp(15px, 2vw, 19px)", color: s.text_color ? `${s.text_color}dd` : "rgba(255,255,255,.9)", marginBottom: "22px", maxWidth: "520px" }}>{cur.subheading}</p>}
        {cur.button?.text && (
          <Link href={resolveHref(cur.button)} style={{ display: "inline-block", background: primary, color: "#fff", padding: "13px 28px", fontSize: "15px", fontWeight: 600, textDecoration: "none", borderRadius: "3px", width: "fit-content" }}>
            {cur.button.text} →
          </Link>
        )}
      </div>

      {slides.length > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Previous" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", zIndex: 3, background: "rgba(255,255,255,.85)", border: "none", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", fontSize: "18px", color: "#1A1A1A" }}>‹</button>
          <button onClick={() => go(1)} aria-label="Next" style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", zIndex: 3, background: "rgba(255,255,255,.85)", border: "none", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", fontSize: "18px", color: "#1A1A1A" }}>›</button>
          <div style={{ position: "absolute", bottom: "16px", left: 0, right: 0, zIndex: 3, display: "flex", gap: "8px", justifyContent: "center" }}>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} style={{ width: i === idx ? "22px" : "8px", height: "8px", borderRadius: "20px", border: "none", background: i === idx ? "#fff" : "rgba(255,255,255,.5)", cursor: "pointer", transition: "all .2s", padding: 0 }} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Newsletter({ s, primary }: { s: PageSection; primary: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    try {
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: typeof window !== "undefined" ? window.location.pathname.replace(/^\//, "") : "",
        form_name: s.heading || "Newsletter",
        data: { Email: email },
      }, { skipAuth: true });
      setStatus("sent"); setEmail("");
    } catch { setStatus("error"); }
  }

  return (
    <section style={{ background: s.bg_color || "#1C3557", padding: "60px 24px" }}>
      <div style={{ maxWidth: "620px", margin: "0 auto", textAlign: "center" }}>
        {s.heading && <h2 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "32px", fontWeight: 600, color: s.text_color || "#fff", marginBottom: "8px" }}>{s.heading}</h2>}
        {s.subheading && <p style={{ fontSize: "16px", color: s.text_color ? `${s.text_color}cc` : "rgba(255,255,255,.8)", marginBottom: "22px" }}>{s.subheading}</p>}
        {status === "sent" ? (
          <p style={{ fontSize: "16px", fontWeight: 600, color: s.text_color || "#fff" }}>✓ Thanks for subscribing!</p>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={s.placeholder || "Enter your email"}
              style={{ flex: "1 1 260px", maxWidth: "340px", border: "none", borderRadius: "4px", padding: "14px 16px", fontSize: "15px", outline: "none" }} />
            <button type="submit" disabled={status === "sending"} style={{ background: primary === (s.bg_color || "#1C3557") ? "#fff" : primary, color: primary === (s.bg_color || "#1C3557") ? "#1C3557" : "#fff", border: "none", borderRadius: "4px", padding: "14px 28px", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
              {status === "sending" ? "…" : (s.submit_text || "Subscribe")}
            </button>
          </form>
        )}
        {status === "error" && <p style={{ color: "#FCA5A5", fontSize: "14px", marginTop: "10px" }}>Something went wrong. Try again.</p>}
      </div>
    </section>
  );
}

export default function SectionRenderer({ sections }: { sections: PageSection[] }) {
  const b = useBranding();
  const primary = b.primary_color || "#1C3557";
  return (
    <div style={{ fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)" }}>
      {sections.filter((s) => s.enabled !== false).map((s, i) => {
        switch (s.type) {
          case "hero": return <HeroBlock key={i} s={s} primary={primary} />;
          case "image_text": return <ImageText key={i} s={s} primary={primary} />;
          case "rich_text": return <RichText key={i} s={s} />;
          case "contact_form": return <ContactForm key={i} s={s} primary={primary} />;
          case "gallery": return <Gallery key={i} s={s} />;
          case "slideshow": return <Slideshow key={i} s={s} primary={primary} />;
          case "newsletter": return <Newsletter key={i} s={s} primary={primary} />;
          case "features": return <Features key={i} s={s} primary={primary} />;
          case "testimonials": return <Testimonials key={i} s={s} primary={primary} />;
          case "faq": return <Faq key={i} s={s} primary={primary} />;
          case "logo_strip": return <LogoStrip key={i} s={s} />;
          default: return null;
        }
      })}
    </div>
  );
}
