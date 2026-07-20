"use client";

/**
 * ThemePreview — a small, live mockup of a store rendered with a theme's colors,
 * fonts and header layout. Gives a real visual sense of the theme (not swatches).
 */
import type { StoreTheme } from "@/lib/storeThemes";

export function ThemePreview({ theme }: { theme: StoreTheme }) {
  const b = theme.branding;
  const primary = b.primary_color || "#1C3557";
  const heroBg = b.hero_bg_color || b.secondary_color || "#F4F6FA";
  const heroText = b.hero_text_color || "#1A1A1A";
  const heading = b.font_heading || "'Fraunces', serif";
  const body = b.font_body || "'DM Sans', sans-serif";
  const layout = b.header_layout || "logo_left";
  const accent = b.accent_color || "#E8B84B";
  const cardStyle = b.card_style || "bordered";
  const btnRadius = b.button_radius ?? 4;
  const radius = b.corner_radius ?? 6;
  const spacing = b.section_spacing || "normal";
  const cardBox: React.CSSProperties = {
    background: cardStyle === "flat" ? "transparent" : "#fff",
    border: cardStyle === "flat" ? "none" : "1px solid #E2E2DE",
    borderRadius: cardStyle === "flat" ? 0 : `${Math.min(radius, 8)}px`,
    boxShadow: cardStyle === "elevated" ? "0 3px 10px rgba(0,0,0,.14)" : "none",
    padding: cardStyle === "flat" ? 0 : "3px",
  };
  const gridPad = spacing === "compact" ? "7px" : spacing === "spacious" ? "16px" : "10px";

  return (
    <div style={{ border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden", background: "#fff", fontFamily: body }}>
      {/* Header bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #ECECEC", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: layout === "logo_center" || layout === "logo_center_below" ? "center" : "space-between", gap: "8px", flexDirection: layout === "logo_center_below" ? "column" : "row" }}>
        <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "11px", color: primary }}>Your Store</span>
        <div style={{ display: "flex", gap: "8px" }}>
          {["Shop", "About", "Contact"].map((l) => <span key={l} style={{ fontSize: "7px", color: "#8A8A8A" }}>{l}</span>)}
        </div>
      </div>
      {/* Hero */}
      <div style={{ background: heroBg, padding: "16px 12px", minHeight: "70px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "5px" }}>
        <div style={{ fontFamily: heading, fontSize: "13px", fontWeight: 700, color: heroText, lineHeight: 1.1 }}>{b.hero_heading || "Your headline"}</div>
        <div style={{ fontSize: "7px", color: heroText, opacity: 0.7 }}>{(b.hero_subheading || "A short supporting line here.").slice(0, 46)}</div>
        <span style={{ marginTop: "3px", background: primary, color: "#fff", fontSize: "7px", fontWeight: 700, padding: "3px 8px", borderRadius: `${Math.min(btnRadius, 12)}px`, width: "fit-content" }}>{b.hero_cta_text || "Shop Now"}</span>
      </div>
      {/* Product grid mock — reflects the theme's card style + spacing */}
      <div style={{ padding: gridPad, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", background: "#fff" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={cardBox}>
            <div style={{ aspectRatio: "1/1", background: "#F1F0EC", borderRadius: cardStyle === "flat" ? 0 : "3px" }} />
            <div style={{ height: "3px", width: "80%", background: "#E4E3DE", borderRadius: "2px", marginTop: "4px" }} />
            <div style={{ height: "3px", width: "45%", background: primary, opacity: 0.5, borderRadius: "2px", marginTop: "3px" }} />
          </div>
        ))}
      </div>
      {/* Accent footer strip */}
      <div style={{ height: "10px", background: accent }} />
    </div>
  );
}
