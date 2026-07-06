export default function FaqSection() {
  const faqs = [
    { q: "How do I access wholesale pricing?", a: "Create a free wholesale account by submitting your business information. Once approved (typically within 24 hours), you'll have full access to wholesale pricing, the bulk order grid, and your account dashboard. There's no fee and no commitment required to apply." },
    { q: "Is there a minimum order quantity (MOQ)?", a: "No minimums on in-stock items — order 1 unit or 10,000, your choice. Pricing scales with volume automatically. Private label orders have a minimum of 2,500 units per style per color." },
    { q: "Are your blanks compatible with DTF and screen printing?", a: "Yes — all core blanks are tested for DTF transfers, screen printing, and embroidery. Each product page includes a Print Guide tab with compatibility ratings and recommended press settings." },
    { q: "How fast do orders ship?", a: "Orders placed before 12 PM CT ship the same day from our Dallas, TX warehouse. Standard ground delivery reaches most of the continental US in 2–5 business days." },
    { q: "What payment methods do you accept?", a: "We accept Visa, Mastercard, American Express, ACH bank transfer, and wire transfer. NET 30 terms available for qualifying accounts." },
  ];

  return (
    <section style={{ padding: "72px 24px", background: "#F8F8F6", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "8px" }}>FAQ</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", marginBottom: "40px", lineHeight: 1.2 }}>Frequently Asked Questions</h2>
        <div style={{ maxWidth: "780px" }}>
          {faqs.map((faq, i) => (
            <details key={i} style={{ border: "1px solid #E2E2DE", marginBottom: "6px", background: "#FFFFFF" }}>
              <summary style={{ padding: "16px 20px", fontSize: "14px", fontWeight: 500, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
                {faq.q}
                <span style={{ fontSize: "18px", color: "#6B6B6B", fontWeight: 300, marginLeft: "16px", flexShrink: 0 }}>+</span>
              </summary>
              <div style={{ padding: "12px 20px 16px", fontSize: "14px", color: "#6B6B6B", lineHeight: 1.75, borderTop: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
