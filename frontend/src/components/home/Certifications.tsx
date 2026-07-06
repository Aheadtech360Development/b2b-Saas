export default function Certifications() {
  const certs = [
    { h: "ISO 9000", p: "Consistent production standards, run to run." },
    { h: "Oeko-Tex Standard 100", p: "Every component tested. Safe for sensitive skin." },
    { h: "GOTS Certified", p: "Organic cotton verified field to finished product." },
    { h: "WRAP Certified", p: "Ethical labor, legal compliance, safe working conditions." },
  ];

  return (
    <section style={{ padding: "56px 24px", background: "#FFFFFF", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "24px", textAlign: "center" }}>
          Certifications &amp; Compliance
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }} className="cert-grid-responsive">
          {certs.map(cert => (
            <div key={cert.h}>
              <h5 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#1A1A1A" }}>{cert.h}</h5>
              {/* <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 }}>{cert.p}</p> */}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
