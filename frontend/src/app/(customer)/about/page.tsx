import type { Metadata } from "next";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/about`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "About Us | AF Blanks",
      description: seo.meta_description ?? "Factory-direct wholesale blank apparel. Dallas, TX. Serving the US print industry since 2010.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "About Us | AF Blanks" };
  }
}

export default function AboutPage() {
  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HERO */}
      <div style={{ background: "#FFFFFF", padding: "72px 24px 56px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "48px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15, maxWidth: "660px", marginBottom: "16px" }}>
            Premium Blank Apparel, Direct from Us.
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "16px", color: "#6B6B6B", lineHeight: 1.65 }}>
            Dallas, TX. Supplying print shops and decorators across the US since 2010.
          </p>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{ background: "#F0F0EE", padding: "28px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <div className="about-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0" }}>
            {[
              { n: "2,000+", l: "Wholesale Accounts" },
              { n: "22", l: "Years in Business" },
              { n: "Dallas, TX", l: "Warehouse & HQ" },
              { n: "Same-Day", l: "Fulfillment by 12PM CT" },
            ].map((s, i) => (
              <div key={s.l} style={{ textAlign: "center", padding: "12px 24px", borderLeft: i > 0 ? "1px solid #E2E2DE" : "none" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1, marginBottom: "4px" }}>{s.n}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OUR STORY */}
      <div style={{ background: "#F8F8F6", padding: "72px 24px", maxWidth: "1500px", margin: "0 auto" }}>
        <div style={{ margin: "0 auto" }}>
          <div className="about-story-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "8px" }}>Our Story</p>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.2, marginBottom: 0 }}>
                Lower prices, direct from us.
              </h2>
            </div>
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", lineHeight: 1.75 }}>
                American Fashion was founded with a single purpose: remove the middlemen that drive up blank apparel costs for print shops and decorators across the US. For too long, businesses were paying markups of 20–35% on every blank they ordered. We built direct relationships with manufacturers and opened our own Dallas warehouse to fix that. Today, 2,000+ businesses across the US order with AF — getting lower prices and same-day shipping every time.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* TIMELINE */}
      <div style={{ background: "#FFFFFF", padding: "64px 24px", borderTop: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: 0 }}>History</p>
          <div style={{ maxWidth: "680px", margin: "32px auto 0" }}>
            {[
              { year: "2015", title: "ISO 9000 Certified", body: "Quality standards locked in. GOTS and Oeko-Tex certifications followed." },
              { year: "2019", title: "500+ Active Accounts", body: "Expanded to hoodies, sweatshirts, and polos. Started shipping nationwide." },
              { year: "2020", title: "Founded in Dallas", body: "First warehouse opened. Started with cotton tees for the Texas print market." },
              { year: "2023", title: "Private Label Program", body: "Started making custom-label apparel for brands. Min 2,500 pcs/style/color." },
              { year: "2025", title: "2,000+ Accounts Nationwide", body: "Serving print shops, decorators, brands, and corporate buyers in all 50 states." },
            ].map((item, i, arr) => (
              <div key={item.year} style={{ display: "flex", gap: "28px", paddingBottom: "32px", paddingLeft: "28px", borderLeft: `1px solid ${i < arr.length - 1 ? "#E2E2DE" : "transparent"}`, marginLeft: "20px", position: "relative" }}>
                <div style={{ position: "absolute", left: "-5px", top: "4px", width: "9px", height: "9px", borderRadius: "50%", background: "#1C3557" }} />
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 700, color: "#1C3557", minWidth: "52px" }}>{item.year}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1A1A1A", marginBottom: "4px" }}>{item.title}</div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.55 }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CERTIFICATIONS */}
      <div style={{ background: "#FFFFFF", padding: "56px 24px", borderTop: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "8px" }}>Certifications &amp; Compliance</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", marginBottom: "32px" }}>Every AF product is tested and certified.</p>
          <div className="about-cert-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "24px" }}>
            {[
              { h: "ISO 9000" },
              { h: "Oeko-Tex Standard 100" },
              { h: "GOTS Certified" },
              { h: "WRAP Certified" },
            ].map(c => (
              <div key={c.h}>
                <h5 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: "#1A1A1A" }}>{c.h}</h5>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 }}></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CORPORATE BAND */}
      <div style={{ background: "#1C3557", padding: "56px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "32px", fontWeight: 600, color: "#FFFFFF", marginBottom: "16px" }}>Corporate &amp; Institutional Buyers</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "rgba(255,255,255,0.8)", marginBottom: "20px", lineHeight: 1.6 }}>
            Need compliance documents for your procurement team? We have everything ready.
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "rgba(255,255,255,0.9)" }}>
            info@afblanks.com &nbsp;·&nbsp; +1 (469) 367-9753
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .about-story-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .about-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .about-cert-grid  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
