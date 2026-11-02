/** printcopilot.co/terms — the design's Terms page. */
import Link from "next/link";
import s from "../marketing.module.css";

export default function TermsPage() {
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
            Terms of Service
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
            Using PrintCoPilot
          </a>
          <a
            href="#s1"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Accounts
          </a>
          <a
            href="#s2"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Plans, billing and trials
          </a>
          <a
            href="#s3"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Gang Sheet commission
          </a>
          <a
            href="#s4"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Acceptable use
          </a>
          <a
            href="#s5"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Your content
          </a>
          <a
            href="#s6"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Termination
          </a>
          <a
            href="#s7"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Liability
          </a>
          <a
            href="#s8"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Changes to these terms
          </a>
          <a
            href="#s9"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Contact us
          </a>
        </aside>
        <main style={{ flex: "1", minWidth: "0", maxWidth: "760px", padding: "48px 0 96px" }}>
          <section id="s0" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              1. Using PrintCoPilot
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              These terms apply when you visit printcopilot.co or use the PrintCoPilot platform to run a shop. By creating an account or using the service, you agree to them.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              PrintCoPilot is a business tool. You must be at least 18 and use it on behalf of a business.
            </p>
          </section>
          <section id="s1" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              2. Accounts
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You are responsible for the information in your account, for keeping your password safe, and for everything done by the staff you invite. Tell us at once at <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>support@printcopilot.co</a> if you think someone has used your account without permission.
            </p>
          </section>
          <section id="s2" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              3. Plans, billing and trials
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Every plan starts with a free trial, as shown on our <Link href="/pricing" style={{ fontWeight: "600", color: "#0B66E4" }}>Pricing page</Link>. To keep using the service after the trial, add a payment method for your plan.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Plans are billed monthly in advance through Stripe at the price shown on our <Link href="/pricing" style={{ fontWeight: "600", color: "#0B66E4" }}>Pricing page</Link>, and renew each month until you cancel. If a payment fails, we may limit access to your account until it is paid. We will give you notice before we change the price of your plan.
            </p>
          </section>
          <section id="s3" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              4. Gang Sheet commission
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Orders placed through the Gang Sheet Builder and paid through your shop&apos;s online checkout carry a PrintCoPilot commission. The rate depends on your plan and is shown on our <Link href="/pricing" style={{ fontWeight: "600", color: "#0B66E4" }}>Pricing page</Link>. Stripe takes it from the payment automatically. Other orders carry no PrintCoPilot commission.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Payments your customers make go to your own Stripe account. You are responsible for your prices, taxes, refunds and chargebacks with your customers.
            </p>
          </section>
          <section id="s4" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              5. Acceptable use
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Do not use PrintCoPilot to sell or print anything illegal, to infringe the trademarks, copyrights or other rights of others, to send spam, or to harm or interfere with the service or other shops. We may remove content or suspend an account that breaks these rules.
            </p>
          </section>
          <section id="s5" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              6. Your content
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You own the content you put on PrintCoPilot, such as your products, designs, artwork and customer data. You give us permission to host, copy, process and display it only as needed to run the service for you.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You confirm that you have the rights to every design you print or sell.
            </p>
          </section>
          <section id="s6" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              7. Termination
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You can cancel your plan at any time from your billing settings. We may suspend or close an account that breaks these terms or does not pay, and we will usually tell you first. After an account is closed, we may delete its data, so export what you need before you leave.
            </p>
          </section>
          <section id="s7" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              8. Liability
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We work hard to keep PrintCoPilot available and accurate, but the service is provided as is, without warranties of any kind, to the fullest extent the law allows.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              PrintCoPilot is not liable for indirect, incidental or consequential losses, such as lost profits, lost sales or lost data, to the fullest extent the law allows.
            </p>
          </section>
          <section id="s8" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              9. Changes to these terms
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We may update these terms as the product changes. We will change the date at the top of this page, and for important changes we will tell account owners by email or in the admin before they take effect. Using the service after that means you accept the new terms.
            </p>
          </section>
          <section id="s9" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              10. Contact us
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Questions about these terms? Email <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>support@printcopilot.co</a>.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
