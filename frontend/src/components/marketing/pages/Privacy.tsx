/** printcopilot.co/privacy-policy — the design's Privacy page. */
import Link from "next/link";
import s from "../marketing.module.css";

export default function PrivacyPage() {
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
            Privacy Policy
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
            Information we collect
          </a>
          <a
            href="#s1"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            How we use information
          </a>
          <a
            href="#s2"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Who we share it with
          </a>
          <a
            href="#s3"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Cookies and tracking
          </a>
          <a
            href="#s4"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            How long we keep data
          </a>
          <a
            href="#s5"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Your choices and rights
          </a>
          <a
            href="#s6"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Security
          </a>
          <a
            href="#s7"
            style={{ display: "block", padding: "8px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            Contact us
          </a>
        </aside>
        <main style={{ flex: "1", minWidth: "0", maxWidth: "760px", padding: "48px 0 96px" }}>
          <section id="s0" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              1. Information we collect
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We collect the information you give us when you sign up, book a demo or contact us: your name, email address, business name and anything you write in a form.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              When you run a shop on PrintCoPilot, we store the shop data you add, such as products, prices, orders, customer details, artwork files and settings. Card payments are handled by Stripe, so we never see or store full card numbers.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              When you visit our website, we receive basic technical data, such as your browser type, the pages you open and the link that brought you here.
            </p>
          </section>
          <section id="s1" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              2. How we use information
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We use your information to run and support the service: to create your account, host your shop, process orders and payments, send account and billing emails, and answer your questions.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We also use it to keep the service secure, to fix problems and to improve the product.
            </p>
          </section>
          <section id="s2" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              3. Who we share it with
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We share information only with companies that help us run the service, and only what they need for that job: payment processing (Stripe), hosting and databases, image storage, email delivery, shipping label and sales tax services, and the AI provider behind our assistant. They may use it only to provide their service to us.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Shops on PrintCoPilot own their customer data. When you buy from a shop, that shop decides how your information is used, and we process it on its behalf.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We may also share information when the law requires it, or as part of a merger or sale of our business. We do not sell your personal information.
            </p>
          </section>
          <section id="s3" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              4. Cookies and tracking
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We use cookies and similar browser storage to keep you signed in, remember your settings and record which partner link brought you to us, if any. Shops can also add their own analytics and advertising tools to their storefronts. Our <Link href="/cookie-policy" style={{ fontWeight: "600", color: "#0B66E4" }}>Cookie Policy</Link> explains this in more detail.
            </p>
          </section>
          <section id="s4" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              5. How long we keep data
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We keep your information while your account is open. After it is closed, we keep it only as long as we need it for legal, tax or accounting reasons, to settle disputes or to enforce our agreements, and then delete it.
            </p>
          </section>
          <section id="s5" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              6. Your choices and rights
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              You can see and update most of your account information in your account settings. You can also ask us for a copy of your data, or ask us to correct or delete it, by emailing <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>support@printcopilot.co</a>. Depending on the state you live in, you may have further rights under local privacy law, and we will honor them.
            </p>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              If you bought from a shop that runs on PrintCoPilot, please contact that shop first. We will help it answer your request.
            </p>
          </section>
          <section id="s6" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              7. Security
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              We protect your information with encrypted connections (HTTPS), access controls that keep each shop&apos;s data separate, and regular database backups. No system is completely secure, so please use a strong password and tell us at once if you think your account has been misused.
            </p>
          </section>
          <section id="s7" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              8. Contact us
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#3A4A5E" }}>
              Questions about this policy or your data? Email <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>support@printcopilot.co</a>. If we change this policy in a meaningful way, we will update the date at the top of this page and let account owners know.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
