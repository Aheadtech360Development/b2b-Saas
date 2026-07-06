"use client";

import { useState } from "react";

type PolicyId = "shipping" | "ordering" | "terms" | "privacy";

const TABS: { id: PolicyId; label: string }[] = [
  { id: "shipping", label: "Shipping & Returns" },
  { id: "ordering", label: "Ordering Info" },
  { id: "terms", label: "Terms & Conditions" },
  { id: "privacy", label: "Privacy Policy" },
];

const sectionStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "#1A1A1A",
  borderBottom: "1px solid #E2E2DE",
  paddingBottom: "10px",
  marginBottom: "12px",
  marginTop: "28px",
};

const bodyStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "14px",
  color: "#6B6B6B",
  lineHeight: 1.75,
  marginBottom: "20px",
};

export default function PrivacyPolicyPage() {
  const [active, setActive] = useState<PolicyId>("shipping");

  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "48px 24px 0", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", fontWeight: 600, color: "#1A1A1A", marginBottom: "24px", lineHeight: 1.15 }}>Policies</h1>
          {/* Tab nav */}
          <div style={{ display: "flex", gap: "0", borderBottom: "none", flexWrap: "wrap" }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: active === tab.id ? "#1C3557" : "#6B6B6B",
                  padding: "10px 20px",
                  background: "transparent",
                  border: "none",
                  borderBottom: active === tab.id ? "2px solid #1C3557" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "color .15s",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ background: "#F8F8F6", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: "760px" }}>

          {active === "shipping" && (
            <div>
              <h2 style={sectionStyle}>Shipping</h2>
              <p style={bodyStyle}>Orders placed before 12:00PM CT ship the same day from our Dallas, TX warehouse.</p>
              <p style={bodyStyle}>We ship via USPS, UPS, FedEx, or OnTrac ground. If you have your own UPS or FedEx account number, include it when ordering and we will use it.</p>
              <p style={bodyStyle}>Free shipping on orders $300 and above.</p>
              <p style={bodyStyle}>Shipping rates are calculated at checkout based on weight and destination.</p>

              <h2 style={sectionStyle}>Will Call (Local Pickup)</h2>
              <p style={bodyStyle}>Available Monday–Friday, 8:30AM–4:30PM CT from our Dallas warehouse.</p>
              <p style={bodyStyle}>Allow at least 3 hours from when you place the order before coming in.</p>
              <p style={bodyStyle}>Cutoff for same-day pickup is 12:00PM CT. Orders placed after that may not be ready until the next business day.</p>
              <p style={bodyStyle}>Wait for your &lsquo;Ready for Pickup&rsquo; email before coming in.</p>
              <p style={bodyStyle}>We can hold will call orders for 5 business days. After that, items may be restocked and a 10% restocking fee applies.</p>

              <h2 style={sectionStyle}>Returns & Claims</h2>
              <p style={bodyStyle}>Inspect all items before washing, printing, or making any changes to the garment.</p>
              <p style={bodyStyle}>All claims must be made within 5 days of receiving your order. Email info@afblanks.com with your order number.</p>
              <p style={bodyStyle}>We cannot accept returns on anything that has been washed, printed, or altered in any way.</p>
              <p style={bodyStyle}>All returns require a Return Authorization (RA). We will email you one once your claim is approved. Returns sent without an RA will be refused.</p>
              <p style={bodyStyle}>RA numbers are valid for 14 days. If we do not receive the items within that time, you will need to submit a new request.</p>
              <p style={bodyStyle}>A 10% restocking fee applies to all returns that are not a result of our error.</p>
              <p style={bodyStyle}>Return shipping costs are the customer&rsquo;s responsibility unless the return is due to our mistake.</p>
              <p style={bodyStyle}>If you received damaged items, we will replace or refund them. Contact us within 5 days of delivery.</p>
              <p style={bodyStyle}>If you received the wrong style, color, or size, contact us within 5 days before making any changes to the garment.</p>
            </div>
          )}

          {active === "ordering" && (
            <div>
              <h2 style={sectionStyle}>Placing an Order</h2>
              <p style={bodyStyle}>You do not need an account to place an order. Wholesale account holders get access to lower wholesale pricing.</p>
              <p style={bodyStyle}>There is no minimum order quantity on in-stock items.</p>
              <p style={bodyStyle}>For large orders over 1,000 units or custom configurations, use the &lsquo;Request a Quote&rsquo; option on any product page. We respond within 2 business hours.</p>
              <p style={bodyStyle}>To submit a PO, email it to info@afblanks.com</p>

              <h2 style={sectionStyle}>Order Confirmation</h2>
              <p style={bodyStyle}>You will receive a confirmation email right after checkout. Check it carefully — it shows exactly what you ordered. If anything looks wrong, email info@afblanks.com within 24 hours.</p>

              <h2 style={sectionStyle}>Changes & Cancellations</h2>
              <p style={bodyStyle}>You can change or cancel an order within 2 hours of placing it. Email info@afblanks.com with your order number.</p>
              <p style={bodyStyle}>Once an order is being picked and packed it cannot be changed or cancelled.</p>
              <p style={bodyStyle}>Same-day orders cannot be changed after confirmation.</p>

              <h2 style={sectionStyle}>Stock & Availability</h2>
              <p style={bodyStyle}>Stock counts shown on product pages are updated in near real time.</p>
              <p style={bodyStyle}>If something goes out of stock after you order, we will contact you within 4 hours with three options: a backorder date, a substitute, or a full refund for those items.</p>

              <h2 style={sectionStyle}>Payment</h2>
              <p style={bodyStyle}>Credit or Debit Card — Visa, Mastercard, Amex. Charged at checkout.</p>
              <p style={bodyStyle}>ACH Bank Transfer — 1–2 business days to process.</p>
              <p style={bodyStyle}>Wire Transfer — We send wire details after the order is placed. Ships when funds are received.</p>
              <p style={bodyStyle}>NET 30 — Available to accounts with 3 or more orders over 90 days. Apply through your account.</p>
              <p style={bodyStyle}>Cash — Accepted for will call orders only.</p>

              <h2 style={sectionStyle}>Sales Tax</h2>
              <p style={bodyStyle}>We collect sales tax in states where required by law.</p>
              <p style={bodyStyle}>If your business has a sales tax exemption certificate, email it to info@afblanks.com before your first order. We will apply it to your account within 1 business day.</p>
            </div>
          )}

          {active === "terms" && (
            <div>
              <h2 style={sectionStyle}>Payment Methods</h2>
              <p style={bodyStyle}>We accept cash (will call only), credit cards, approved company or personal checks, and cashier&rsquo;s checks. NET terms are available for accounts approved by our credit department or that have built sufficient order history with us. For more information contact 469-367-9753.</p>

              <h2 style={sectionStyle}>No Minimums</h2>
              <p style={bodyStyle}>We do not have any minimum order quantities on standard in-stock items.</p>

              <h2 style={sectionStyle}>Order Processing</h2>
              <p style={bodyStyle}>Most orders placed before 12:00PM CT are completed same day. If you need an order rushed, email info@afblanks.com or call 469-367-9753.</p>

              <h2 style={sectionStyle}>Wholesale Accounts</h2>
              <p style={bodyStyle}>All wholesale accounts are for business-to-business use only. You must hold a valid resale certificate to maintain a wholesale account. We reserve the right to approve, suspend, or close any account at our discretion.</p>

              <h2 style={sectionStyle}>Pricing</h2>
              <p style={bodyStyle}>All prices are in USD and subject to change without notice. Wholesale pricing is only available to approved account holders.</p>

              <h2 style={sectionStyle}>Claims & Returns</h2>
              <p style={bodyStyle}>All claims must be made within 5 days of receiving goods. Items must be unaltered. Returns require a Return Authorization. Items returned without one will be refused. A 10% restocking fee applies. Customers are responsible for return shipping unless the return is our fault.</p>

              <h2 style={sectionStyle}>Cancellations</h2>
              <p style={bodyStyle}>Once you receive an order confirmation, the order cannot be cancelled. Call customer service to request any changes: 469-367-9753, Monday–Friday 8:30AM–5:00PM CT.</p>

              <h2 style={sectionStyle}>Liability</h2>
              <p style={bodyStyle}>AF Apparels is not responsible for delays caused by shipping carriers or events outside our control. Our liability is limited to the value of the order placed.</p>
            </div>
          )}

          {active === "privacy" && (
            <div>
              <p style={{ ...bodyStyle, color: "#9B9B9B", fontSize: "12px", marginBottom: "24px" }}>Last updated: January 30, 2025</p>

              <h2 style={sectionStyle}>What We Collect</h2>
              <p style={bodyStyle}>When you use our site or place an order, we collect your name, address, phone number, email, and order details. Payment information is processed securely through our payment provider — we do not store card details on our servers. We also collect basic usage data through cookies to help the site work properly.</p>

              <h2 style={sectionStyle}>How We Use It</h2>
              <p style={bodyStyle}>To process and fulfill your orders.</p>
              <p style={bodyStyle}>To send you updates about your order or account.</p>
              <p style={bodyStyle}>To send promotional emails if you have opted in. You can unsubscribe at any time using the link in any email.</p>
              <p style={bodyStyle}>To improve how our site works.</p>

              <h2 style={sectionStyle}>Who We Share It With</h2>
              <p style={bodyStyle}>We share information with third parties only as needed to run the business — shipping carriers, payment processors, and our platform provider. We do not sell your personal information to third parties for their own marketing.</p>

              <h2 style={sectionStyle}>Cookies</h2>
              <p style={bodyStyle}>We use cookies to keep the site running and to understand how people use it. You can turn cookies off in your browser settings, though some parts of the site may not work as expected.</p>

              <h2 style={sectionStyle}>Your Rights</h2>
              <p style={bodyStyle}>Depending on where you live, you may have the right to access, correct, delete, or export your personal information. To make a request, email info.afapparel@gmail.com</p>

              <h2 style={sectionStyle}>Children</h2>
              <p style={bodyStyle}>This site is not intended for anyone under 18. We do not knowingly collect information from children.</p>

              <h2 style={sectionStyle}>Contact</h2>
              <p style={bodyStyle}>Privacy questions: info.afapparel@gmail.com</p>
              <p style={bodyStyle}>Address: 10719 Turbeville Road, Dallas, TX 75243</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
