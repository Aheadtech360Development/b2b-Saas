import { EditIcon, ClipboardIcon, TruckIcon, RefreshIcon } from "@/components/ui/icons";

export default function HowItWorks() {
  const steps = [
    { n: "01", icon: <EditIcon size={28} color="#1C3557" />, h: "Apply for Access", p: "Submit your business details. Free to apply. Approved within 24 hours. No commitment required." },
    { n: "02", icon: <ClipboardIcon size={28} color="#1C3557" />, h: "Browse & Build Order", p: "Select colors, enter quantities across sizes. Real-time stock and pricing shown in your account." },
    { n: "03", icon: <TruckIcon size={28} color="#1C3557" />, h: "Checkout & Ship", p: "Pay via card, ACH, wire, or NET 30. Orders before 12 PM CT ship from Dallas same day." },
    { n: "04", icon: <RefreshIcon size={28} color="#1C3557" />, h: "Reorder Easily", p: "Full order history saved in your account. Reorder a previous color breakdown in one click." },
  ];

  return (
    <section style={{ padding: "72px 24px", background: "#F8F8F6" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "8px" }}>How It Works</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", marginBottom: "40px", lineHeight: 1.2 }}>Wholesale ordering in 4 steps</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: "#FFFFFF", border: "1px solid #E2E2DE" }} className="steps-grid-responsive">
          {steps.map((step, i) => (
            <div key={step.n} style={{ padding: "32px 24px", borderRight: i < 3 ? "1px solid #E2E2DE" : "none" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", color: "#1C3557", lineHeight: 1, marginBottom: "12px", fontWeight: 300 }}>{step.n}</div>
              <div style={{ marginBottom: "12px" }}>{step.icon}</div>
              <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600, marginBottom: "8px", color: "#1A1A1A" }}>{step.h}</h4>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", lineHeight: 1.65 }}>{step.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
