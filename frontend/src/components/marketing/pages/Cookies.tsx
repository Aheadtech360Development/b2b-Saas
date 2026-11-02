/** printcopilot.co/cookie-policy — the design's Cookies page. */
import Link from "next/link";
import s from "../marketing.module.css";

export default function CookiesPage() {
  return (
    <>
      <section style={{ background: "#F6F8FB", borderBottom: "1px solid #E3E8EF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "64px 32px 48px" }}>
          <p
            style={{
              fontSize: "12px",
              lineHeight: "16px",
              fontWeight: "600",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#0B66E4",
            }}
          >
            Legal
          </p>
          <h1 className={s["d"]} style={{ marginTop: "12px", fontSize: "48px", lineHeight: "52px", color: "#0C1E35" }}>
            Cookie Policy
          </h1>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#5A6A7E" }}>Last updated: November 2, 2026</p>
        </div>
      </section>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 32px",
          display: "flex",
          gap: "56px",
          alignItems: "flex-start",
        }}
      >
        <aside
          className={s["side-nav"]}
          style={{
            flex: "none",
            width: "232px",
            position: "sticky",
            top: "96px",
            paddingTop: "48px",
            alignSelf: "flex-start",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#5A6A7E",
              paddingBottom: "8px",
            }}
          >
            On this page
          </p>
          <a
            href="#s0"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            What cookies are
          </a>
          <a
            href="#s1"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Cookies we use
          </a>
          <a
            href="#s2"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Managing cookies
          </a>
          <a
            href="#s3"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Contact us
          </a>
        </aside>
        <main style={{ flex: "1", minWidth: "0", maxWidth: "760px", padding: "48px 0 96px" }}>
          <section id="s0" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              1. What cookies are
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Cookies are small text files a website saves in your browser. Sites also use similar browser storage. Together they let a site remember you between pages and visits.
            </p>
          </section>
          <section id="s1" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              2. Cookies we use
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Essential: these keep you signed in, remember the shop you are using and keep your cart. The site does not work properly without them.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Referral: if you arrive through a partner link, we save the partner code so the partner gets credit if you sign up. It lasts for the partner program&apos;s cookie window.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Analytics and advertising: we and the shops on PrintCoPilot may use tools such as Google Analytics and the Meta Pixel to understand visits and measure ads. These tools set their own cookies, and each shop decides which tools its storefront uses.
            </p>
          </section>
          <section id="s2" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              3. Managing cookies
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You can block or delete cookies in your browser settings. If you block essential cookies, signing in and checkout may not work. You can also manage ad settings in your Google and Meta accounts.
            </p>
          </section>
          <section id="s3" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              4. Contact us
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Questions about cookies? Email <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>support@printcopilot.co</a>. Our <Link href="/privacy-policy" style={{ fontWeight: "600", color: "#0B66E4" }}>Privacy Policy</Link> explains how we handle personal information.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
