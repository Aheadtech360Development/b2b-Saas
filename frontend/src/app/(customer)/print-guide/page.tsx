import type { Metadata } from "next";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/print-guide`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Print Guide | AF Blanks",
      description: seo.meta_description ?? "Tested press settings and fabric compatibility ratings for DTF, screen printing, sublimation, and embroidery on AF blanks.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Print Guide | AF Blanks" };
  }
}

const METHODS = [
  { name: "DTF (Direct-to-Film)", desc: "Works on almost all fabrics. Great for detailed, full-color artwork." },
  { name: "Screen Print", desc: "Best for large runs on 100% cotton. Sharp, durable results." },
  { name: "Embroidery", desc: "Works on everything. Best for polos, caps, and structured garments." },
  { name: "Sublimation", desc: "Polyester only. Full color with no feel on the fabric." },
];

const COMPAT_TABLE = [
  { material: "100% Heavyweight Cotton", dtf: "Works Great", screen: "Works Great", emb: "Works Well", sub: "Not Recommended" },
  { material: "100% Ring-Spun Cotton", dtf: "Works Great", screen: "Works Great", emb: "Works Well", sub: "Not Recommended" },
  { material: "CVC 52/48", dtf: "Works Well", screen: "Works Well", emb: "Works Well", sub: "Low Poly — Test First" },
  { material: "CVC 60/40", dtf: "Works Well", screen: "Works Well", emb: "Works Well", sub: "Low Poly — Test First" },
  { material: "CVC 65/35", dtf: "Works Well", screen: "Test First", emb: "Works Well", sub: "Low Poly — Test First" },
  { material: "Fleece 70/30", dtf: "Works Well", screen: "Test First", emb: "Works Great", sub: "Not Recommended" },
  { material: "Fleece 80/20", dtf: "Works Well", screen: "Test First", emb: "Works Great", sub: "Not Recommended" },
];

const TIPS = [
  "Pre-press for 3–5 seconds before applying any transfer. Removes moisture.",
  "Always run a test on one piece before a full production run.",
  "Follow your ink or transfer supplier's cure temps — those take priority over fabric type.",
  "For a softer feel on heavier fabrics, use water-based inks or thin-adhesive DTF.",
];

function cellColor(val: string): React.CSSProperties {
  if (val === "Works Great") return { color: "#2d6a4f", fontWeight: 500 };
  if (val === "Not Recommended") return { color: "#9b2335" };
  if (val.includes("Test First")) return { color: "#8a6000" };
  return {};
}

export default function PrintGuidePage() {
  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "48px 24px 32px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", fontWeight: 600, color: "#1A1A1A", marginBottom: "10px", lineHeight: 1.15 }}>Print Guide</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B" }}>
            What works on what. Simple reference for decorators and print shops.
          </p>
        </div>
      </div>

      {/* DECORATION METHODS */}
      <div style={{ background: "#F8F8F6", padding: "56px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px" }}>
            Decoration Methods
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }} className="cert-grid-responsive">
            {METHODS.map(m => (
              <div key={m.name}>
                <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1A1A1A", marginBottom: "8px" }}>{m.name}</h4>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COMPATIBILITY TABLE */}
      <div style={{ background: "#FFFFFF", padding: "56px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px" }}>
            Fabric Compatibility
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E2DE" }}>
                  {["Material", "DTF", "Screen Print", "Embroidery", "Sublimation"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#1A1A1A", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPAT_TABLE.map((row, i) => (
                  <tr key={row.material} style={{ background: i % 2 === 0 ? "#F8F8F6" : "#FFFFFF", borderBottom: "1px solid #E2E2DE" }}>
                    <td style={{ padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1A1A1A" }}>{row.material}</td>
                    <td style={{ padding: "12px 16px", fontSize: "14px", ...cellColor(row.dtf) }}>{row.dtf}</td>
                    <td style={{ padding: "12px 16px", fontSize: "14px", ...cellColor(row.screen) }}>{row.screen}</td>
                    <td style={{ padding: "12px 16px", fontSize: "14px", ...cellColor(row.emb) }}>{row.emb}</td>
                    <td style={{ padding: "12px 16px", fontSize: "14px", ...cellColor(row.sub) }}>{row.sub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TIPS */}
      <div style={{ background: "#F8F8F6", padding: "56px 24px" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px" }}>
            A Few Things Worth Knowing
          </p>
          <ol style={{ paddingLeft: 0, listStyle: "none", maxWidth: "680px" }}>
            {TIPS.map((tip, i) => (
              <li key={i} style={{ display: "flex", gap: "16px", padding: "14px 0", borderBottom: "1px solid #E2E2DE", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 700, color: "#1C3557", minWidth: "24px", lineHeight: 1.4 }}>{i + 1}.</span>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", lineHeight: 1.65, margin: 0 }}>{tip}</p>
              </li>
            ))}
          </ol>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", marginTop: "24px" }}>
            Questions? Email us at{" "}
            <a href="mailto:info@afblanks.com" style={{ color: "#1C3557", textDecoration: "none" }}>info@afblanks.com</a>
          </p>
        </div>
      </div>

    </div>
  );
}
