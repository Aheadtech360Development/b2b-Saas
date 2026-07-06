"use client";

export function BrandLogos() {
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "20px 0" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 24px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#94A3B8", marginBottom: "14px", textAlign: "center" }}>
          Trusted by 2,000+ businesses across the US
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{ background: "#F4F6F9", border: "1px solid #E2E8F0", borderRadius: "3px", height: "34px", width: "100px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".04em" }}
            >
              [Client Logo]
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
