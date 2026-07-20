import type { Metadata } from "next";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/private-label`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Private Label | AF Blanks",
      description: seo.meta_description ?? "Custom private label blank apparel manufacturing. Your brand, our factory expertise. Starting at 2,500 units per style/color.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Private Label | AF Blanks" };
  }
}

const STEPS = [
  { n: "1", h: "Send Us Your Brief", p: "Share your fabric, fit, colors, sizing, and label requirements." },
  { n: "2", h: "Sample First", p: "We make a sample for your approval before any bulk production starts." },
  { n: "3", h: "Production", p: "Minimum 2,500 pieces per style per color. Takes 45–60 days." },
  { n: "4", h: "Delivered to You", p: "Shipped direct to your warehouse or fulfillment center." },
];

export default function PrivateLabelPage() {
  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "48px 24px 32px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", fontWeight: 600, color: "#1A1A1A", marginBottom: "10px", lineHeight: 1.15 }}>Private Label</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B" }}>
            Your label. Your specs. Made in the same facilities as our wholesale line.
          </p>
        </div>
      </div>

      {/* INTRO */}
      <div style={{ background: "#F8F8F6", padding: "64px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <div className="why-grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center" }}>
            <div className="pl-img-wrap" style={{ overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Private-label.png"
                alt="Private Label Samples"
                style={{ width: "100%", height: "360px", objectFit: "cover", display: "block" }}
              />
            </div>
            <div>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "32px", fontWeight: 600, color: "#1A1A1A", marginBottom: "16px", lineHeight: 1.2 }}>
                Built for Brands Ready to Own Their Product
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", lineHeight: 1.75 }}>
                Our private label program lets apparel brands, print shops, and retailers get custom-made garments under their own brand — your labels, your tags, your packaging. Same factories we use for everything else. No middlemen.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{ background: "#FFFFFF", padding: "64px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "32px" }}>
            How It Works
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }} className="cert-grid-responsive">
            {STEPS.map(step => (
              <div key={step.n} style={{ border: "1px solid #E2E2DE", padding: "24px" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 300, color: "var(--brand-primary, #1C3557)", marginBottom: "12px" }}>{step.n}</div>
                <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1A1A1A", marginBottom: "8px" }}>{step.h}</h4>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 }}>{step.p}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WHAT'S INCLUDED */}
      <div style={{ background: "#F8F8F6", padding: "56px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px" }}>
            What&apos;s Included
          </p>
          <div className="why-grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Custom woven or printed labels", "Custom hang tags", "Custom packaging", "Multiple fabric options"].map(item => (
                <li key={item} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#1A1A1A", padding: "8px 0", borderBottom: "1px solid #E2E2DE", display: "flex", alignItems: "center", gap: "10px" }}>
                  {/* <span style={{ color: "var(--brand-primary, #1C3557)" }}>—</span>  */}
                  {item}
                </li>
              ))}
            </ul>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Full size range XS–5XL", "Oeko-Tex and GOTS certified fabrics available", "Full compliance paperwork", "One dedicated contact for your account"].map(item => (
                <li key={item} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#1A1A1A", padding: "8px 0", borderBottom: "1px solid #E2E2DE", display: "flex", alignItems: "center", gap: "10px" }}>
                  {/* <span style={{ color: "var(--brand-primary, #1C3557)" }}>—</span>  */}
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* THE NUMBERS */}
      <div style={{ background: "#FFFFFF", padding: "56px 24px" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px" }}>
            The Numbers
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", maxWidth: "640px", border: "1px solid #E2E2DE" }}>
            {[
              { label: "Minimum", value: "2,500 pieces per style per color" },
              { label: "Lead Time", value: "45–60 days from sample approval" },
              { label: "Samples", value: "Available before you commit to production" },
              { label: "Certifications", value: "ISO 9000, Oeko-Tex, GOTS, WRAP — available on request" },
            ].map((item, i) => (
              <div key={item.label} style={{ padding: "16px 20px", borderBottom: i < 3 ? "1px solid #E2E2DE" : "none", borderRight: i % 2 === 0 ? "1px solid #E2E2DE" : "none" }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6B6B", marginBottom: "4px" }}>{item.label}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#1A1A1A" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", marginTop: "24px" }}>
            Ready to start? Contact us.{" "}
            <a href="mailto:info@afblanks.com" style={{ color: "var(--brand-primary, #1C3557)", textDecoration: "none" }}>info@afblanks.com</a>
            {" "}·{" "}
            <a href="tel:+12142727213" style={{ color: "var(--brand-primary, #1C3557)", textDecoration: "none" }}>(214) 272-7213</a>
          </p>
        </div>
      </div>

    </div>
  );
}
