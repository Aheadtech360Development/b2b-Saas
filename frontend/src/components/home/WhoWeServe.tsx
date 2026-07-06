import { PrinterIcon, BuildingIcon, ShirtIcon, UsersIcon } from "@/components/ui/icons";

export default function WhoWeServe() {
  const cards = [
    { icon: <PrinterIcon size={28} color="#FFFFFF" />, h: "Printing Companies", p: "DTF, screen, embroidery, and sublimation shops. Fabrics tested for your specific decoration process." },
    { icon: <UsersIcon size={28} color="#FFFFFF" />, h: "Retailers", p: "In-store and online retailers stocking private-label or branded apparel lines. Deep inventory always available." },
    { icon: <BuildingIcon size={28} color="#FFFFFF" />, h: "Corporate Buyers", p: "Uniforms, branded merch, event apparel at scale. NET 30 terms available for qualifying accounts." },
    { icon: <ShirtIcon size={28} color="#FFFFFF" />, h: "Apparel Brands", p: "Building your own line? Private label starts at 2,500 units per style per color with full branding." },
  ];

  return (
    <section style={{ padding: "72px 24px", background: "#1C3557" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>Who We Serve</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#FFFFFF", marginBottom: "40px", lineHeight: 1.2 }}>Built for businesses that move volume</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }} className="serve-grid-responsive">
          {cards.map(card => (
            <div key={card.h} style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", padding: "28px 22px" }}>
              <div style={{ marginBottom: "14px" }}>{card.icon}</div>
              <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600, color: "#FFFFFF", marginBottom: "10px" }}>{card.h}</h4>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>{card.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
