import Image from "next/image";

export default function WhyChooseUs() {
  const rows = [
    { num: "01", h: "Direct Wholesale Pricing", p: "Ship direct with no intermediaries — lower unit cost vs. traditional wholesale." },
    { num: "02", h: "Quality Products", p: "Carefully selected, print-ready inventory built for your business." },
    { num: "03", h: "Fast Fulfillment", p: "In-stock items ready to ship, so your orders arrive quickly." },
    { num: "04", h: "Consistent Quality", p: "Reliable run-to-run consistency on every order." },
    { num: "05", h: "Scale With Your Business", p: "From a single unit to bulk orders — flexible quantities that grow with you." },
  ];

  return (
    <section style={{ padding: "72px 24px", background: "#FFFFFF", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div className="why-grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center" }}>
          <div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "8px" }}>Why Us</p>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", marginBottom: "32px", lineHeight: 1.2 }}>Why Businesses Choose Us</h2>
            {rows.map(({ num, h, p }) => (
              <div key={num} style={{ display: "flex", gap: "16px", marginBottom: "20px", alignItems: "flex-start" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 300, color: "#1C3557", minWidth: "28px", lineHeight: 1, marginTop: "2px" }}>{num}</div>
                <div>
                  <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, marginBottom: "4px", color: "#1A1A1A" }}>{h}</h4>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 }}>{p}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:flex">
            <div style={{ height: "440px", width: "100%", overflow: "hidden", border: "1px solid #E2E2DE", position: "relative" }}>
              <Image
                src="/Home page Hero.png"
                alt="Warehouse / Fulfillment Center"
                fill
                sizes="(max-width: 1140px) 40vw, 440px"
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
