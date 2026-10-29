"use client";

/**
 * The Pricing page's Retail brands tab (Retail launch, package 6), from the
 * design board "PrintCoPilot Retail Page and Site Changes" (board 2): one
 * Retail plan, its questions and the way in. Shown only when the Retail
 * launch switch is on (lib/retailLaunch).
 *
 * Held back until the manager decides (specs/003-retail-launch, T605): the
 * board's full comparison with other platforms (their prices are not checked
 * yet), and the plan card's line of sales tools the platform does not have
 * (shown as "Discount codes", the one it has).
 */

const CSS = ".rp-tab a{text-decoration:none}\n.rp-tab .dk{background-color:#0C1E35;background-image:linear-gradient(rgba(255,255,255,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.045) 1px,transparent 1px);background-size:56px 56px}";

export default function RetailPricing() {
  return (
    <div className="rp-tab" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#0C1E35" }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        precedence="default"
      />
      <style>{CSS}</style>
    <div className="dk" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: "-200px", width: "1000px", height: "600px", marginLeft: "-500px", background: "radial-gradient(closest-side, rgba(14,114,251,0.45), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "72px 32px 80px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", textAlign: "center" }}>
        <h1 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "60px", lineHeight: "1.05", letterSpacing: "-0.025em", color: "#FFFFFF", maxWidth: "820px" }}>
          One plan for D2C and retail brands.
          <span style={{ color: "#2B84FF" }}>
            Everything included.
          </span>
        </h1>
        <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.6", color: "#C8D6EA", maxWidth: "640px" }}>
          No apps or plugins to buy and no platform fee on orders. 14 days free, no card. Prices in USD.
        </p>
      </div>
    </div>
    <div id="p" style={{ background: "#F6F8FB", borderBottom: "1px solid #E6ECF5" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "56px 32px 72px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
        <div style={{ maxWidth: "520px", width: "100%", boxSizing: "border-box", background: "#FFFFFF", border: "2px solid #0B66E4", borderRadius: "24px", padding: "36px", display: "flex", flexDirection: "column", gap: "18px", boxShadow: "0 24px 60px rgba(11,102,228,0.18)" }}>
          <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "28px" }}>
            Retail
          </span>
          <span style={{ fontSize: "15px", color: "#4A5B73" }}>
            For brands selling their own products.
          </span>
          <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "700", fontSize: "60px", lineHeight: "1" }}>
            $79
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "400", fontSize: "16px", color: "#4A5B73" }}>
              per month
            </span>
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ background: "#E4EEFF", color: "#0B5ED7", fontSize: "13px", fontWeight: "600", padding: "6px 12px", borderRadius: "999px" }}>
              200 orders a month
            </span>
            <span style={{ background: "#E4EEFF", color: "#0B5ED7", fontSize: "13px", fontWeight: "600", padding: "6px 12px", borderRadius: "999px" }}>
              2 staff accounts
            </span>
            <span style={{ background: "#E4EEFF", color: "#0B5ED7", fontSize: "13px", fontWeight: "600", padding: "6px 12px", borderRadius: "999px" }}>
              No platform fee on orders
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "6px" }}>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Storefront and website builder
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Cart, checkout and Stripe payments
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Live chat and courier connections
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Product reviews and the AI copilot
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Loyalty and referral rewards
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Gift cards
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Returns and exchanges portal
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Order tracking page
            </span>
            <span style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "15px", lineHeight: "1.45" }}>
              <span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </span>
              Discount codes
            </span>
          </div>
          <a href="/signup?plan=retail" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "16px 22px", borderRadius: "10px", fontWeight: "600", fontSize: "16px", textAlign: "center", marginTop: "8px", boxShadow: "0 10px 30px rgba(11,102,228,0.4)" }}>
            Start free trial →
          </a>
          <span style={{ fontSize: "13px", color: "#5A6B84", textAlign: "center" }}>
            14 day trial. No card needed.
          </span>
        </div>
        <div style={{ maxWidth: "520px", width: "100%", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #D0DCEE", borderRadius: "16px", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "6px", textAlign: "center" }}>
          <span style={{ fontWeight: "600", fontSize: "16px" }}>
            Need more than 200 orders, gang sheets or wholesale?
          </span>
          <span style={{ fontSize: "14px", lineHeight: "1.5", color: "#4A5B73" }}>
            Switch to the Print and wholesale tab above. Your store and customers come with you.
          </span>
        </div>
      </div>
    </div>
    <div style={{ background: "#F6F8FB", borderTop: "1px solid #E6ECF5" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "88px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "8px" }}>
        <h2 style={{ margin: "0 0 16px", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "38px", letterSpacing: "-0.02em" }}>
          Before you pick a plan.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #E3E9F3" }}>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              Do I need a card to start?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              No. The trial lasts 14 days and does not ask for a card.
            </span>
          </div>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              Do I pay a commission on orders?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              No. Retail carries no platform fee on orders. Card payments run through Stripe, which charges its own processing fees.
            </span>
          </div>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              What happens if I pass 200 orders a month?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              Move to a print plan, which has higher limits. Your store and customers come with you.
            </span>
          </div>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              Can I move to a print plan later?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              Yes. If you start printing or selling wholesale, you can switch to a plan that includes those tools.
            </span>
          </div>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              Can I sell wholesale on the Retail plan?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              Wholesale tools, including account approval, pricing tiers and net terms, are on the Wholesale and Scale plans.
            </span>
          </div>
          <div style={{ padding: "22px 0", borderBottom: "1px solid #E3E9F3", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "600", fontSize: "17px" }}>
              Can I talk to someone before I start?
            </span>
            <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
              Yes. Book a demo and we will help you choose.
            </span>
          </div>
        </div>
      </div>
    </div>
    <div className="dk" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: "-100px", width: "900px", height: "500px", marginLeft: "-450px", background: "radial-gradient(closest-side, rgba(14,114,251,0.4), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "88px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "18px", alignItems: "center", textAlign: "center" }}>
        <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", color: "#FFFFFF" }}>
          Start free. Pick a plan when you are
          <span style={{ color: "#2B84FF" }}>
            sure.
          </span>
        </h2>
        <span style={{ fontSize: "18px", color: "#C8D6EA" }}>
          14 days, no card. Set up your store and place a test order before you decide.
        </span>
        <a href="/signup?plan=retail" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "16px 28px", borderRadius: "10px", fontWeight: "600", fontSize: "16px", boxShadow: "0 10px 30px rgba(11,102,228,0.5)" }}>
          Start free trial →
        </a>
      </div>
    </div>
    </div>
  );
}
