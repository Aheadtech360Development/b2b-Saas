/** printcopilot.co/privacy-policy — the design's Privacy page. */
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
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#5A6A7E" }}>Last updated: [DATE]</p>
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
          <div
            style={{
              background: "#F6F8FB",
              border: "1.5px dashed #D5DCE6",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "16px",
            }}
          >
            <p style={{ fontSize: "14px", lineHeight: "20px", color: "#5A6A7E" }}>
              Placeholder structure. Replace every bracketed section with reviewed legal text before launch.
            </p>
          </div>
          <section id="s0" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              1. Information we collect
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s1" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              2. How we use information
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s2" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              3. Who we share it with
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s3" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              4. Cookies and tracking
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s4" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              5. How long we keep data
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s5" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              6. Your choices and rights
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s6" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              7. Security
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
          <section id="s7" style={{ padding: "32px 0", borderTop: "1px solid #E3E8EF" }}>
            <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
              8. Contact us
            </h2>
            <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "26px", color: "#5A6A7E" }}>
              [LEGAL TEXT GOES HERE. Have this section written or reviewed by a lawyer.]
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
