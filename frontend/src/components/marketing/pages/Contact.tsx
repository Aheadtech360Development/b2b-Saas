"use client";

/** printcopilot.co/contact — the design's Contact page. */
import Link from "next/link";
import s from "../marketing.module.css";
import { sendContact, useLeadForm } from "../leads";

export default function ContactPage() {
  const { done, notDone, submit, sending, error } = useLeadForm(sendContact);

  return (
    <>
      <section style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
        <div
          className={s["grid-bg"]}
          style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "-160px",
            width: "900px",
            height: "520px",
            marginLeft: "-450px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.32),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "72px 32px 80px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 16px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(255,255,255,.05)",
              fontSize: "13px",
              fontWeight: "500",
              color: "rgba(255,255,255,.86)",
            }}
          >
            <span
              className={s["live"]}
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: "#0E72FB",
                display: "inline-block",
              }}
            ></span>
            Contact
          </div>
          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "24px auto 0", maxWidth: "860px", fontSize: "56px", lineHeight: "60px", color: "#FFFFFF" }}
          >
            Talk to us.
          </h1>
          <p
            style={{
              margin: "20px auto 0",
              maxWidth: "640px",
              fontSize: "18px",
              lineHeight: "28px",
              color: "rgba(255,255,255,.78)",
            }}
          >
            Pick the route that fits, or send a message and we will reply by email.
          </p>
        </div>
      </section>
      <section style={{ background: "#F6F8FB" }}>
        <div
          className={s["sec"]}
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "80px 32px 96px",
            display: "flex",
            flexWrap: "wrap",
            gap: "48px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "flex-start",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: "none",
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#EAF3FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0B66E4"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20V10M10 20V4M16 20v-8M22 20H2"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  Sales
                </h3>
                <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                  Questions about plans or whether PrintCoPilot fits your shop.
                </p>
                <Link
                  href="/demo"
                  style={{
                    display: "inline-block",
                    marginTop: "12px",
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#0B66E4",
                  }}
                >
                  Book a demo
                </Link>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "flex-start",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: "none",
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#EAF3FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0B66E4"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  Support
                </h3>
                <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                  Already a customer? Email us from the address on your account.
                </p>
                <p style={{ marginTop: "12px", fontSize: "14px", color: "#5A6A7E" }}>
                  {/* The inbox shops reach us on — the same one as CONTACT_EMAIL in PlatformLanding. */}
                  <a href="mailto:support@printcopilot.co" style={{ fontWeight: "600", color: "#0B66E4" }}>
                    support@printcopilot.co
                  </a>
                </p>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "flex-start",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: "none",
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#EAF3FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0B66E4"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="9" cy="8" r="3.5"></circle>
                  <path d="M2 20a7 7 0 0 1 14 0"></path>
                  <path d="M17 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  Partnerships
                </h3>
                <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                  Agencies, consultants and resellers who want to refer buyers.
                </p>
                <Link
                  href="/affiliate"
                  style={{
                    display: "inline-block",
                    marginTop: "12px",
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#0B66E4",
                  }}
                >
                  Affiliate and Partners
                </Link>
              </div>
            </div>
            <div
              style={{ background: "#FFFFFF", border: "1.5px dashed #D5DCE6", borderRadius: "12px", padding: "24px" }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#5A6A7E",
                }}
              >
                Placeholder
              </p>
              <p style={{ marginTop: "8px", fontSize: "15px", lineHeight: "22px", color: "#5A6A7E" }}>
                [BUSINESS ADDRESS]
                <br />
                [SUPPORT HOURS]
              </p>
            </div>
          </div>
          <div style={{ flex: "1.1 1 440px", minWidth: "0" }}>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 24px 60px rgba(12,30,53,0.10)",
              }}
            >
              {notDone && (
                <form onSubmit={submit}>
                  {/* Left empty by people; a form-filling bot fills it, and is answered as if it went through. */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>
                    <label htmlFor="c-hp-note">Leave this field empty</label>
                    <input id="c-hp-note" name="hp_note" tabIndex={-1} autoComplete="off" />
                  </div>
                  <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                    Send us a message
                  </h2>
                  <div style={{ marginTop: "20px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                          gap: "16px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label htmlFor="c-name" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Full name
                          </label>
                          <input
                            id="c-name"
                            name="name"
                            required
                            type="text"
                            placeholder=""
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              minHeight: "48px",
                              padding: "0 14px",
                              borderRadius: "8px",
                              border: "1px solid #D5DCE6",
                              background: "#FFFFFF",
                              color: "#0C1E35",
                              fontSize: "16px",
                              fontFamily: "'Inter',system-ui,sans-serif",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label htmlFor="c-email" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Work email
                          </label>
                          <input
                            id="c-email"
                            name="email"
                            required
                            type="email"
                            placeholder=""
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              minHeight: "48px",
                              padding: "0 14px",
                              borderRadius: "8px",
                              border: "1px solid #D5DCE6",
                              background: "#FFFFFF",
                              color: "#0C1E35",
                              fontSize: "16px",
                              fontFamily: "'Inter',system-ui,sans-serif",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label htmlFor="c-topic" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          What is it about?
                        </label>
                        <select
                          id="c-topic"
                          name="topic"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            minHeight: "48px",
                            padding: "0 12px",
                            borderRadius: "8px",
                            border: "1px solid #D5DCE6",
                            background: "#FFFFFF",
                            color: "#0C1E35",
                            fontSize: "16px",
                            fontFamily: "'Inter',system-ui,sans-serif",
                          }}
                        >
                          <option>Sales</option>
                          <option>Support</option>
                          <option>Partnerships</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label htmlFor="c-msg" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          Message
                        </label>
                        <textarea
                          id="c-msg"
                          name="msg"
                          required
                          placeholder="How can we help?"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            minHeight: "120px",
                            padding: "12px 14px",
                            borderRadius: "8px",
                            border: "1px solid #D5DCE6",
                            background: "#FFFFFF",
                            color: "#0C1E35",
                            fontSize: "16px",
                            fontFamily: "'Inter',system-ui,sans-serif",
                          }}
                        ></textarea>
                      </div>
                      <button
                        type="submit"
                        disabled={sending}
                        style={{
                          width: "100%",
                          minHeight: "56px",
                          border: "0",
                          borderRadius: "8px",
                          background: "#0B66E4",
                          color: "#FFFFFF",
                          fontSize: "17px",
                          fontWeight: "600",
                          cursor: "pointer",
                          fontFamily: "'Inter',system-ui,sans-serif",
                        }}
                      >
                        Send message
                      </button>
                      {error && (
                        <p
                          role="alert"
                          style={{ fontSize: "14px", lineHeight: "20px", color: "#B42318", textAlign: "center" }}
                        >
                          {error}
                        </p>
                      )}
                    </div>
                  </div>
                </form>
              )}
              {done && (
                <>
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "999px",
                        background: "#E7F6EC",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0E6B38"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5"></path>
                      </svg>
                    </span>
                    <h2
                      className={s["d"]}
                      style={{ marginTop: "20px", fontSize: "28px", lineHeight: "34px", color: "#0C1E35" }}
                    >
                      Message sent.
                    </h2>
                    <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                      Thanks for writing. We will reply by email.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
