"use client";

/**
 * printcopilot.co/retail: the Retail plan's page, from the design board
 * "PrintCoPilot Retail Page and Site Changes" (board 1). Drawn inside
 * MarketingShell, which has the site's header and footer.
 *
 * Published only when the Retail launch switch is on (lib/retailLaunch):
 * the manager decides what it may claim first (specs/003-retail-launch,
 * T605). Held back from the board until then, in RETAIL_HELD: the sales tools
 * the platform does not have yet, and the price comparison with other
 * platforms (prices to be checked on each vendor's page and dated).
 */

export const RETAIL_HELD = {
  unbuiltTools: ["Abandoned cart emails", "Back in stock alerts and pre-orders", "Free shipping bar", "Cart upsells and bundles", "Size guide and wishlist", "Email and SMS signup popup"],
  priceComparison: "The math: Shopify Basic $39, Judge.me Awesome $15, Smile.io Starter $49, Loop Essential $155, "
    + "Klaviyo 500 profiles $20; $123 a month, $278 with returns (board 1). Not checked.",
  retentionClaim: "The retention tools that run over $200 a month elsewhere (board 1). Not checked.",
};

const CSS = ".rt a{text-decoration:none}\n.rt .dk{background-color:#0C1E35;background-image:linear-gradient(rgba(255,255,255,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.045) 1px,transparent 1px);background-size:56px 56px}\n.rt .pulse{animation:pc-pulse 2.4s ease-in-out infinite}\n@keyframes pc-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(14,114,251,0.6)}50%{opacity:0.7;box-shadow:0 0 0 7px rgba(14,114,251,0)}}\n.rt .float{animation:pc-float 6s ease-in-out infinite}\n@keyframes pc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}";

export default function RetailPage() {
  return (
    <div className="rt" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#0C1E35", background: "#FFFFFF", width: "100%", minWidth: "0" }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        precedence="default"
      />
      <style>{CSS}</style>
      {/* HERO */}
      <div id="top" className="dk" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: "-220px", width: "1100px", height: "700px", marginLeft: "-550px", background: "radial-gradient(closest-side, rgba(14,114,251,0.45), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "88px 32px 0", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: "26px", textAlign: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "13px", fontWeight: "500", color: "#DCE7F7", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)", padding: "8px 18px", borderRadius: "999px" }}>
            <span className="pulse" style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#0E72FB", display: "block" }} />
            For D2C and retail brands
          </span>
          <h1 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "68px", lineHeight: "1.04", letterSpacing: "-0.025em", color: "#FFFFFF", maxWidth: "900px" }}>
            A store for brands that sell
            <span style={{ color: "#2B84FF" }}>
              their own products.
            </span>
          </h1>
          <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.6", color: "#C8D6EA", maxWidth: "680px" }}>
            Streetwear, pet apparel, merch and more. Launch a branded store, sell more with tools that are already built in, and stop paying for a stack of apps.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px" }}>
            <a href="/signup?plan=retail" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "16px 28px", borderRadius: "10px", fontWeight: "600", fontSize: "16px", boxShadow: "0 10px 30px rgba(11,102,228,0.45)" }}>
              Start free trial →
            </a>
            <a href="/demo" style={{ color: "#FFFFFF", padding: "15px 28px", borderRadius: "10px", fontWeight: "600", fontSize: "16px", border: "1px solid rgba(255,255,255,0.35)" }}>
              Book a demo
            </a>
          </div>
          <span style={{ fontSize: "13px", color: "#9FB3D1" }}>
            14 day trial. No card needed.
          </span>
          <div style={{ position: "relative", width: "100%", maxWidth: "1020px", marginTop: "34px", textAlign: "left" }}>
            <div style={{ display: "flex", background: "#FFFFFF", borderRadius: "18px 18px 0 0", boxShadow: "0 -10px 80px rgba(14,114,251,0.35), 0 30px 80px rgba(0,0,0,0.5)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.25)", borderBottom: "none" }}>
              <div style={{ width: "58px", background: "#0C1E35", padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "7px", background: "#0E72FB", display: "block" }} />
                <span style={{ width: "24px", height: "24px", borderRadius: "7px", border: "1.5px solid #3A5578", display: "block" }} />
                <span style={{ width: "24px", height: "24px", borderRadius: "7px", border: "1.5px solid #3A5578", display: "block" }} />
                <span style={{ width: "24px", height: "24px", borderRadius: "7px", border: "1.5px solid #3A5578", display: "block" }} />
                <span style={{ width: "24px", height: "24px", borderRadius: "7px", border: "1.5px solid #3A5578", display: "block" }} />
              </div>
              <div style={{ flex: "1", minWidth: "0", background: "#F8FAFD", padding: "18px 26px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ fontSize: "12px", color: "#5A6B84", border: "1px solid #DCE4F0", background: "#FFFFFF", borderRadius: "8px", padding: "8px 12px", minWidth: "200px" }}>
                    Search orders, buyers, products Cmd K
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: "600" }}>
                    Inbox
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginTop: "18px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "26px" }}>
                      Orders
                    </div>
                    <div style={{ fontSize: "13px", color: "#5A6B84", marginTop: "2px" }}>
                      Every order, in one list.
                    </div>
                  </div>
                  <span style={{ background: "#0B66E4", color: "#FFFFFF", fontSize: "13px", fontWeight: "600", padding: "9px 16px", borderRadius: "8px" }}>
                    Create order
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px", fontSize: "12px" }}>
                  <span style={{ background: "#0C1E35", color: "#FFFFFF", padding: "6px 14px", borderRadius: "999px" }}>
                    All
                  </span>
                  <span style={{ border: "1px solid #DCE4F0", background: "#FFFFFF", padding: "6px 14px", borderRadius: "999px" }}>
                    Paid
                  </span>
                  <span style={{ border: "1px solid #DCE4F0", background: "#FFFFFF", padding: "6px 14px", borderRadius: "999px" }}>
                    Ready to ship
                  </span>
                  <span style={{ border: "1px solid #DCE4F0", background: "#FFFFFF", padding: "6px 14px", borderRadius: "999px" }}>
                    Shipped
                  </span>
                  <span style={{ border: "1px solid #DCE4F0", background: "#FFFFFF", padding: "6px 14px", borderRadius: "999px" }}>
                    Draft (unpaid)
                  </span>
                </div>
                <div style={{ marginTop: "14px", background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "12px", overflow: "hidden", fontSize: "13px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 1fr", padding: "11px 16px", background: "#F3F6FB", color: "#5A6B84", fontSize: "12px", fontWeight: "600" }}>
                    <span>
                      Order
                    </span>
                    <span>
                      Buyer
                    </span>
                    <span>
                      Fulfilment
                    </span>
                    <span>
                      Payment
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 1fr", padding: "12px 16px", borderTop: "1px solid #EDF1F8", alignItems: "center" }}>
                    <span style={{ fontWeight: "600" }}>
                      #2041
                    </span>
                    <span>
                      Maya R.
                    </span>
                    <span>
                      <span style={{ background: "#E4EEFF", color: "#0B5ED7", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Ready to ship
                      </span>
                    </span>
                    <span>
                      <span style={{ background: "#DDF3E4", color: "#137333", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Paid
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 1fr", padding: "12px 16px", borderTop: "1px solid #EDF1F8", alignItems: "center" }}>
                    <span style={{ fontWeight: "600" }}>
                      #2040
                    </span>
                    <span>
                      Jordan T.
                    </span>
                    <span>
                      <span style={{ background: "#E8EDF5", color: "#3F5169", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Shipped
                      </span>
                    </span>
                    <span>
                      <span style={{ background: "#DDF3E4", color: "#137333", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Paid
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 1fr", padding: "12px 16px", borderTop: "1px solid #EDF1F8", alignItems: "center" }}>
                    <span style={{ fontWeight: "600" }}>
                      #2039
                    </span>
                    <span>
                      Sam K.
                    </span>
                    <span>
                      <span style={{ background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Late
                      </span>
                    </span>
                    <span>
                      <span style={{ background: "#DDF3E4", color: "#137333", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Paid
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 1fr", padding: "12px 16px", borderTop: "1px solid #EDF1F8", alignItems: "center" }}>
                    <span style={{ fontWeight: "600" }}>
                      #2038
                    </span>
                    <span>
                      Lena P.
                    </span>
                    <span>
                      <span style={{ background: "#E8EDF5", color: "#3F5169", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Not started
                      </span>
                    </span>
                    <span>
                      <span style={{ background: "#FDE4E1", color: "#B42318", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                        Unpaid
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="float" style={{ position: "absolute", right: "-28px", top: "130px", width: "270px", background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", padding: "16px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", border: "1px solid #DCE4F0", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "600", color: "#0B5ED7" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#0E72FB", display: "block" }} />
                Copilot
              </span>
              <span style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.4" }}>
                Everyday hoodie is running low.
              </span>
              <span style={{ alignSelf: "flex-start", background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                Low stock
              </span>
              <span style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.4" }}>
                Paid orders not shipped after 3+ days.
              </span>
              <span style={{ alignSelf: "flex-start", background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                Needs review
              </span>
            </div>
            <div className="float" style={{ position: "absolute", left: "-36px", top: "250px", width: "250px", background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", border: "1px solid #DCE4F0", animationDelay: "1.5s" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #E6ECF5", fontSize: "11px", color: "#5A6B84" }}>
                yourbrand.com
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "15px" }}>
                  New drop is live.
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <span style={{ height: "64px", borderRadius: "8px", background: "#DCE8FB", display: "block" }} />
                  <span style={{ height: "64px", borderRadius: "8px", background: "#F3E8D9", display: "block" }} />
                </div>
                <span style={{ alignSelf: "flex-start", background: "#0B66E4", color: "#FFFFFF", fontSize: "12px", fontWeight: "600", padding: "7px 12px", borderRadius: "6px" }}>
                  Shop now
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* WHY */}
      <div id="features" style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px 88px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "800px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              WHY BRANDS COME HERE
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "48px", lineHeight: "1.08", letterSpacing: "-0.02em" }}>
              Other platforms sell you a store. Then they sell you the
              <span style={{ color: "#0B66E4" }}>
                apps.
              </span>
            </h2>
            <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.6", color: "#4A5B73" }}>
              Reviews, loyalty, returns, email, chat. Elsewhere each one is another subscription, another login and another set of customer data. Here they ship with the platform and share the same orders and customers.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "20px", padding: "30px", display: "flex", flexDirection: "column", gap: "14px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "54px", color: "#0B66E4", lineHeight: "1" }}>
                1
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "23px" }}>
                One bill, no app store
              </span>
              <span style={{ fontSize: "16px", lineHeight: "1.55", color: "#4A5B73" }}>
                Reviews, loyalty, gift cards, returns, tracking, live chat and the AI copilot are part of your plan. No plugins to find, vet or pay for.
              </span>
            </div>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "20px", padding: "30px", display: "flex", flexDirection: "column", gap: "14px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "54px", color: "#0B66E4", lineHeight: "1" }}>
                1
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "23px" }}>
                One list of orders and customers
              </span>
              <span style={{ fontSize: "16px", lineHeight: "1.55", color: "#4A5B73" }}>
                A review, a return and a reward all land on the same buyer profile. No syncing between tools, no data stuck in someone else's app.
              </span>
            </div>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "20px", padding: "30px", display: "flex", flexDirection: "column", gap: "14px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "54px", color: "#0B66E4", lineHeight: "1" }}>
                1
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "23px" }}>
                One copilot watching it all
              </span>
              <span style={{ fontSize: "16px", lineHeight: "1.55", color: "#4A5B73" }}>
                The AI agent reads your orders, stock and customers around the clock and tells you what needs you today.
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* STOREFRONT */}
      <div style={{ background: "#F6F8FB", borderTop: "1px solid #E6ECF5", borderBottom: "1px solid #E6ECF5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "64px" }}>
          <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              YOUR STOREFRONT
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "44px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              A store in your brand that talks to your buyers.
            </h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.6", color: "#4A5B73" }}>
              Your logo, your colors, your pages. Launch a store that looks like yours, not ours, and answer questions while buyers are still on the page.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "16px" }}>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Edit your theme and build pages in the website builder
              </span>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Live chat on your store, so buyers can ask before they leave
              </span>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                SEO settings for your pages and products
              </span>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "#E4EEFF", color: "#0B66E4", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Sign in, cart and checkout included
              </span>
            </div>
            <a href="/signup?plan=retail" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "15px 26px", borderRadius: "10px", fontWeight: "600", fontSize: "16px" }}>
              Start free trial
            </a>
          </div>
          <div style={{ flex: "1 1 460px", minWidth: "0", position: "relative" }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE4F0", borderRadius: "18px", boxShadow: "0 30px 70px rgba(12,30,53,0.16)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #E6ECF5", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#D5DCE8", display: "block" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#D5DCE8", display: "block" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#D5DCE8", display: "block" }} />
                <span style={{ marginLeft: "12px", fontSize: "12px", color: "#5A6B84", background: "#F3F6FB", padding: "5px 14px", borderRadius: "999px" }}>
                  yourbrand.com
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "17px" }}>
                  Your Brand
                </span>
                <span style={{ display: "flex", gap: "18px", fontSize: "13px", color: "#5A6B84" }}>
                  <span>
                    Shop
                  </span>
                  <span>
                    New in
                  </span>
                  <span>
                    Contact
                  </span>
                </span>
              </div>
              <div style={{ margin: "0 22px", borderRadius: "14px", background: "linear-gradient(120deg, #0C1E35, #14407C)", color: "#FFFFFF", padding: "30px 26px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "26px", lineHeight: "1.15" }}>
                  The autumn collection is here.
                </span>
                <span style={{ alignSelf: "flex-start", background: "#0B66E4", fontSize: "13px", fontWeight: "600", padding: "9px 16px", borderRadius: "8px" }}>
                  Shop now
                </span>
              </div>
              <div style={{ padding: "18px 22px 26px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ height: "110px", borderRadius: "12px", background: "#DCE8FB", display: "block" }} />
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    Everyday hoodie
                  </span>
                  <span style={{ fontSize: "13px", color: "#5A6B84" }}>
                    $48
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ height: "110px", borderRadius: "12px", background: "#F3E8D9", display: "block" }} />
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    Walk tee
                  </span>
                  <span style={{ fontSize: "13px", color: "#5A6B84" }}>
                    $32
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ height: "110px", borderRadius: "12px", background: "#DDEEE3", display: "block" }} />
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    Dog bandana
                  </span>
                  <span style={{ fontSize: "13px", color: "#5A6B84" }}>
                    $18
                  </span>
                </div>
              </div>
            </div>
            <div className="float" style={{ position: "absolute", right: "18px", bottom: "-26px", width: "250px", background: "#FFFFFF", border: "1px solid #DCE4F0", borderRadius: "14px", padding: "14px 16px", boxShadow: "0 20px 50px rgba(12,30,53,0.22)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#137333", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#16A34A", display: "block" }} />
                Online now
              </span>
              <span style={{ fontSize: "14px", lineHeight: "1.4" }}>
                Hi, need help picking a size?
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* COPILOT */}
      <div className="dk" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "-200px", top: "20px", width: "800px", height: "600px", background: "radial-gradient(closest-side, rgba(14,114,251,0.4), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "100px 32px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "64px" }}>
          <div style={{ flex: "1 1 420px", minWidth: "0", background: "#0F2744", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "20px", padding: "24px", boxShadow: "0 30px 80px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "#8FB8FF" }}>
              <span className="pulse" style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#0E72FB", display: "block" }} />
              Copilot
            </span>
            <span style={{ alignSelf: "flex-end", background: "#0B66E4", color: "#FFFFFF", fontSize: "14px", padding: "11px 16px", borderRadius: "14px 14px 4px 14px" }}>
              What needs me today?
            </span>
            <span style={{ fontSize: "15px", color: "#DCE7F7" }}>
              Three things are waiting on you.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "#16304F", borderRadius: "12px", padding: "13px 16px", fontSize: "14px", color: "#FFFFFF" }}>
                <span>
                  Paid orders not shipped after 3+ days
                </span>
                <span style={{ background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  Needs review
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "#16304F", borderRadius: "12px", padding: "13px 16px", fontSize: "14px", color: "#FFFFFF" }}>
                <span>
                  Products with open orders running low
                </span>
                <span style={{ background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  Low stock
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "#16304F", borderRadius: "12px", padding: "13px 16px", fontSize: "14px", color: "#FFFFFF" }}>
                <span>
                  Orders nobody paid for
                </span>
                <span style={{ background: "#E4EEFF", color: "#0B5ED7", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  Draft (unpaid)
                </span>
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px", alignItems: "flex-start" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#8FB8FF" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#0E72FB", display: "block" }} />
              AI COPILOT
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "44px", lineHeight: "1.1", letterSpacing: "-0.02em", color: "#FFFFFF" }}>
              A copilot that watches the store while you
              <span style={{ color: "#2B84FF" }}>
                work.
              </span>
            </h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.6", color: "#C8D6EA" }}>
              The 24/7 AI analytics agent reads your orders, stock and customers. It tells you what needs attention and answers questions in plain words.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "16px", color: "#FFFFFF" }}>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "rgba(14,114,251,0.3)", color: "#8FB8FF", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Flags late jobs and paid orders that have not shipped
              </span>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "rgba(14,114,251,0.3)", color: "#8FB8FF", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Warns you when products are running low
              </span>
              <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: "rgba(14,114,251,0.3)", color: "#8FB8FF", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✓
                </span>
                Ask about orders, stock or customers without building a report
              </span>
            </div>
            <a href="/signup?plan=retail" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "15px 26px", borderRadius: "10px", fontWeight: "600", fontSize: "16px" }}>
              Start free trial
            </a>
          </div>
        </div>
      </div>
      {/* TOOLS */}
      <div style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              BUILT TO CONVERT
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              Sales tools that come with the store.
            </h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.6", color: "#4A5B73" }}>
              Included, and already connected to your orders and customers.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "18px", padding: "26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "12px", color: "#5A6B84" }}>
                  Discount code
                </span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", border: "1.5px dashed #0B66E4", color: "#0B66E4", padding: "6px 12px", borderRadius: "8px" }}>
                    WELCOME10
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: "600", background: "#DDF3E4", color: "#137333", padding: "3px 10px", borderRadius: "999px" }}>
                    Applied
                  </span>
                </div>
              </div>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "19px" }}>
                Discount codes
              </span>
              <span style={{ fontSize: "14.5px", lineHeight: "1.55", color: "#4A5B73" }}>
                Run promotions from day one.
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* REVIEWS */}
      <div style={{ background: "#F6F8FB", borderTop: "1px solid #E6ECF5", borderBottom: "1px solid #E6ECF5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "20px", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              PRODUCT REVIEWS
            </span>
            <h3 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "30px", lineHeight: "1.15", letterSpacing: "-0.015em" }}>
              Let buyers vouch for you.
            </h3>
            <span style={{ fontSize: "16px", lineHeight: "1.6", color: "#4A5B73" }}>
              Collect and manage reviews from one place, so buyers see real feedback while they shop.
            </span>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "18px", color: "#F59E0B", letterSpacing: "2px" }}>
                ★★★★★
              </span>
              <span style={{ fontSize: "14px", lineHeight: "1.5" }}>
                Fits true to size and the fabric feels great.
              </span>
              <span style={{ fontSize: "12px", color: "#5A6B84" }}>
                Verified buyer
              </span>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "20px", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              SHIPPING
            </span>
            <h3 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "30px", lineHeight: "1.15", letterSpacing: "-0.015em" }}>
              Ship from the order list.
            </h3>
            <span style={{ fontSize: "16px", lineHeight: "1.6", color: "#4A5B73" }}>
              Connect your couriers and ship orders without leaving the platform.
            </span>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "600" }}>
                  #2041 Maya R.
                </span>
                <span style={{ background: "#E4EEFF", color: "#0B5ED7", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                  Ready to ship
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "600" }}>
                  #2040 Jordan T.
                </span>
                <span style={{ background: "#E8EDF5", color: "#3F5169", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>
                  Shipped
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* RETENTION */}
      <div className="dk" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: "-200px", top: "-100px", width: "800px", height: "600px", background: "radial-gradient(closest-side, rgba(14,114,251,0.35), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "100px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#8FB8FF" }}>
              <span className="pulse" style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#0E72FB", display: "block" }} />
              KEEP BUYERS COMING BACK
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", letterSpacing: "-0.02em", color: "#FFFFFF" }}>
              The retention tools other platforms
              <span style={{ color: "#2B84FF" }}>
                sell you as apps.
              </span>
            </h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.6", color: "#C8D6EA" }}>
              Loyalty, gift cards, returns and tracking are part of the Retail plan. They run on the same customer list as your store.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "18px" }}>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#5A6B84" }}>
                      Your rewards
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: "600", background: "#E4EEFF", color: "#0B5ED7", padding: "3px 10px", borderRadius: "999px" }}>
                      Gold member
                    </span>
                  </div>
                  <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "30px" }}>
                    1,240 points
                  </span>
                  <span style={{ height: "8px", borderRadius: "999px", background: "#E3E9F3", display: "block", position: "relative" }}>
                    <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "82%", background: "#0B66E4", borderRadius: "999px", display: "block" }} />
                  </span>
                  <span style={{ fontSize: "13px", color: "#4A5B73" }}>
                    260 points to your next $10 reward. Refer a friend for 200 more.
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px", color: "#FFFFFF" }}>
                  Loyalty and referrals
                </span>
                <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#C8D6EA" }}>
                  Points for every order, rewards you set, and referral rewards when buyers bring friends.
                </span>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ background: "linear-gradient(120deg, #0C1E35, #14407C)", color: "#FFFFFF", borderRadius: "12px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <span style={{ fontSize: "12px", letterSpacing: "0.1em", color: "#8FB8FF" }}>
                      GIFT CARD
                    </span>
                    <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "30px" }}>
                      $50
                    </span>
                    <span style={{ fontSize: "13px", letterSpacing: "0.12em" }}>
                      GIFT-8K2Q-M4TX
                    </span>
                  </div>
                  <span style={{ fontSize: "13px", color: "#4A5B73" }}>
                    Sent by email. Balance carries over after each order.
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px", color: "#FFFFFF" }}>
                  Gift cards
                </span>
                <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#C8D6EA" }}>
                  Buyers pick an amount, the recipient gets a code by email, and the balance stays on the code.
                </span>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600" }}>
                      Return #R-118
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: "600", background: "#FDEBD3", color: "#9A5B00", padding: "3px 10px", borderRadius: "999px" }}>
                      Needs review
                    </span>
                  </div>
                  <span style={{ fontSize: "13px", color: "#4A5B73" }}>
                    Everyday hoodie, size M. Reason: wrong size. Wants: exchange for L.
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span style={{ background: "#0B66E4", color: "#FFFFFF", fontSize: "12px", fontWeight: "600", padding: "7px 12px", borderRadius: "6px" }}>
                      Approve exchange
                    </span>
                    <span style={{ border: "1px solid #D0DCEE", fontSize: "12px", fontWeight: "600", padding: "6px 12px", borderRadius: "6px" }}>
                      Decline
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px", color: "#FFFFFF" }}>
                  Returns and exchanges
                </span>
                <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#C8D6EA" }}>
                  Buyers start a return or exchange themselves. You review every request in one place.
                </span>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "#FFFFFF", color: "#0C1E35", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    Order #2041
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                    <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#16A34A", display: "block" }} />
                      Paid
                    </span>
                    <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#16A34A", display: "block" }} />
                      Packed
                    </span>
                    <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#0B66E4", display: "block" }} />
                      <b>
                        Out for delivery
                      </b>
                    </span>
                    <span style={{ display: "flex", gap: "10px", alignItems: "center", color: "#8A97AB" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#D0DCEE", display: "block" }} />
                      Delivered
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px", color: "#FFFFFF" }}>
                  Order tracking page
                </span>
                <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#C8D6EA" }}>
                  Buyers see the status and courier link without emailing you.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* WHO */}
      <div style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              WHO IT IS FOR
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              Built for brands that sell what they make or source.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "18px" }}>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "21px" }}>
                Streetwear and fashion labels
              </span>
              <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#4A5B73" }}>
                Run collections and repeat customers from one place.
              </span>
            </div>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "21px" }}>
                Pet and lifestyle brands
              </span>
              <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#4A5B73" }}>
                Dog apparel, accessories and everything around them.
              </span>
            </div>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "21px" }}>
                Merch and creator brands
              </span>
              <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#4A5B73" }}>
                A store in your brand, not a marketplace page.
              </span>
            </div>
            <div style={{ border: "1px solid #E3E9F3", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "linear-gradient(180deg, #F2F7FF, #FFFFFF)" }}>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "21px" }}>
                Small and growing brands
              </span>
              <span style={{ fontSize: "15px", lineHeight: "1.55", color: "#4A5B73" }}>
                Start simple, and keep the same platform as you grow.
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* PRINT_LATER */}
      <div style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 32px 96px", boxSizing: "border-box" }}>
          <div style={{ background: "#F2F7FF", border: "1px solid #D5E3FA", borderRadius: "22px", padding: "40px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "28px" }}>
              Want to print your own products later?
            </span>
            <span style={{ fontSize: "17px", lineHeight: "1.6", color: "#4A5B73", maxWidth: "720px" }}>
              The same platform includes a gang sheet builder and supplier catalogs, so you can add printing without switching tools.
            </span>
          </div>
        </div>
      </div>
      {/* HOW */}
      <div style={{ background: "#F6F8FB", borderTop: "1px solid #E6ECF5", borderBottom: "1px solid #E6ECF5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              HOW IT STARTS
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              Try it with your own products before you pay.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "18px", padding: "30px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "999px", background: "#0B66E4", color: "#FFFFFF", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(11,102,228,0.35)" }}>
                1
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px" }}>
                Start your trial
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.55", color: "#4A5B73" }}>
                14 days, no card. Create your store with an email and a store name.
              </span>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "18px", padding: "30px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "999px", background: "#0B66E4", color: "#FFFFFF", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(11,102,228,0.35)" }}>
                2
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px" }}>
                Set up your store
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.55", color: "#4A5B73" }}>
                Add your products and choose your theme.
              </span>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E9F3", borderRadius: "18px", padding: "30px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "999px", background: "#0B66E4", color: "#FFFFFF", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(11,102,228,0.35)" }}>
                3
              </span>
              <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "22px" }}>
                Take a test order
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.55", color: "#4A5B73" }}>
                Place one yourself and watch it come through. Then decide.
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* PRICING */}
      <div id="plans" style={{ background: "#F6F8FB", borderTop: "1px solid #E6ECF5", borderBottom: "1px solid #E6ECF5" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", textAlign: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              PRICING
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "46px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              One plan. Everything included.
            </h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.6", color: "#4A5B73", maxWidth: "620px" }}>
              No apps or plugins to buy and no platform fee on orders. Every plan starts with a 14 day trial and no card.
            </p>
          </div>
          <div style={{ maxWidth: "520px", width: "100%", margin: "0 auto", boxSizing: "border-box", background: "#FFFFFF", border: "2px solid #0B66E4", borderRadius: "24px", padding: "36px", display: "flex", flexDirection: "column", gap: "18px", boxShadow: "0 24px 60px rgba(11,102,228,0.18)" }}>
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
          <div style={{ maxWidth: "520px", width: "100%", margin: "0 auto", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #D0DCEE", borderRadius: "16px", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "6px", textAlign: "center" }}>
            <span style={{ fontWeight: "600", fontSize: "16px" }}>
              Need more than 200 orders, gang sheets or wholesale?
            </span>
            <span style={{ fontSize: "14px", lineHeight: "1.5", color: "#4A5B73" }}>
              Move to Starter, Wholesale or Scale. Your store and customers come with you.
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px 24px" }}>
            <span style={{ fontSize: "15px", color: "#4A5B73" }}>
              Want every line side by side, with other platforms?
            </span>
            <a href="/pricing?tab=retail" style={{ color: "#0B66E4", fontWeight: "600", fontSize: "16px" }}>
              Open the pricing page →
            </a>
          </div>
        </div>
      </div>
      {/* QUESTIONS */}
      <div style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "96px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "32px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.14em", color: "#0B66E4" }}>
              QUESTIONS
            </span>
            <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "42px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
              Before you start.
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "22px 26px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>
                Do I need a card to start?
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
                No. The trial lasts 14 days and does not ask for a card.
              </span>
            </div>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "22px 26px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>
                Do I pay a commission on orders?
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
                No. Retail plans carry no platform fee on orders. Card payments run through Stripe, which charges its own processing fees.
              </span>
            </div>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "22px 26px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>
                Can I move to a print plan later?
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
                Yes. If you start printing or selling wholesale, you can switch to a plan that includes those tools.
              </span>
            </div>
            <div style={{ background: "#F6F8FB", border: "1px solid #E3E9F3", borderRadius: "14px", padding: "22px 26px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>
                Can I talk to someone before I start?
              </span>
              <span style={{ fontSize: "15.5px", lineHeight: "1.6", color: "#4A5B73" }}>
                Yes. Book a demo and we will pick a plan with you.
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* CLOSING */}
      <div id="trial" className="dk" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: "-100px", width: "1000px", height: "600px", marginLeft: "-500px", background: "radial-gradient(closest-side, rgba(14,114,251,0.4), rgba(14,114,251,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "104px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "22px", alignItems: "center", textAlign: "center" }}>
          <h2 style={{ margin: "0", fontFamily: "Outfit, sans-serif", fontWeight: "600", fontSize: "54px", lineHeight: "1.08", letterSpacing: "-0.02em", color: "#FFFFFF" }}>
            Start your 14 day
            <span style={{ color: "#2B84FF" }}>
              trial.
            </span>
          </h2>
          <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.6", color: "#C8D6EA", maxWidth: "560px" }}>
            No card needed. Bring your own products and see how it feels before you decide.
          </p>
          <form action="/signup" method="get" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", width: "100%", maxWidth: "560px" }}>
            <label htmlFor="cta-email" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Work email
            </label>
            <input id="cta-email" name="email" type="email" placeholder="Work email" style={{ flex: "1 1 260px", minWidth: "0", padding: "16px 18px", borderRadius: "10px", border: "1px solid #3A5578", background: "#FFFFFF", fontSize: "16px", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }} />
            <button type="submit" style={{ background: "#0B66E4", color: "#FFFFFF", padding: "17px 28px", borderRadius: "10px", fontWeight: "600", fontSize: "16px", boxSizing: "border-box", boxShadow: "0 10px 30px rgba(11,102,228,0.5)" }}>
              Start free trial →
            </button>
          <input type="hidden" name="plan" value="retail" />
</form>
          <span style={{ fontSize: "15px", color: "#C8D6EA" }}>
            Want to see it with someone first?
            <a href="/demo" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
              Book a demo
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
