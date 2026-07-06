import Link from "next/link";

const stats = [
  { n: "2,000+", l: "Wholesale Accounts" },
  { n: "22", l: "Years in Business" },
  { n: "Same-Day", l: "Fulfillment by 12PM CT" },
  { n: "No Min.", l: "Order Quantity" },
];

export default function TrustStrip() {
  return (
    <div style={{ background: "#F0F0EE", padding: "40px 24px", borderTop: "1px solid #E2E2DE", borderBottom: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div className="hero-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0px" }}>
          {stats.map((stat, i) => (
            <div key={stat.l} style={{ textAlign: "center", padding: "12px 24px", borderLeft: i > 0 ? "1px solid #E2E2DE" : "none" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1, marginBottom: "4px" }}>{stat.n}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B" }}>{stat.l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "12px", marginTop: "20px", paddingTop: "18px", borderTop: "1px solid #E2E2DE" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", margin: 0 }}>
            Create a wholesale account to get better prices on everything.
          </p>
          <Link href="/wholesale/register" className="trust-apply-btn" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#1C3557", border: "1px solid #1C3557", padding: "5px 12px", textDecoration: "none", fontWeight: 500, display: "inline-block", transition: "all .15s" }}>
            Apply for Wholesale Account →
          </Link>
        </div>
        <style>{`.trust-apply-btn:hover { background: #1C3557 !important; color: #ffffff !important; }`}</style>
      </div>
    </div>
  );
}
