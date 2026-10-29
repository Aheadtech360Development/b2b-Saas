"use client";

/** printcopilot.co/demo — the design's Demo page. */
import Link from "next/link";
import s from "../marketing.module.css";
import { RETAIL_LAUNCHED } from "@/lib/retailLaunch";
import { sendDemo, useLeadForm } from "../leads";

export default function DemoPage() {
  const { done, notDone, submit, sending, error } = useLeadForm(sendDemo);

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
            left: "-200px",
            top: "-100px",
            width: "800px",
            height: "560px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.3),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          className={s["sec"]}
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "80px 32px 96px",
            display: "flex",
            flexWrap: "wrap",
            gap: "56px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "1 1 420px", minWidth: "0" }}>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "12px",
                lineHeight: "16px",
                fontWeight: "600",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.78)",
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
              Book a demo
            </p>
            <h1
              className={`${s["d"]} ${s["hero-h1"]}`}
              style={{ marginTop: "16px", fontSize: "48px", lineHeight: "52px", color: "#FFFFFF" }}
            >
              See PrintCoPilot with your own business in mind.
            </h1>
            <p style={{ marginTop: "20px", fontSize: "18px", lineHeight: "28px", color: "rgba(255,255,255,.78)" }}>
              Tell us what you sell. We will show you the parts that matter to you and help you pick a plan.
            </p>
            <ul
              style={{
                listStyle: "none",
                margin: "28px 0 0",
                padding: "0",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                fontSize: "16px",
                lineHeight: "24px",
                color: "rgba(255,255,255,.9)",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "1px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "rgba(14,114,251,.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                A walk through your store, plus the builder and production flow if you print
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "1px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "rgba(14,114,251,.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                Plan advice based on your orders and buyers
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "1px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "rgba(14,114,251,.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                Your questions answered, with no pressure and no card
              </li>
            </ul>
            <div aria-hidden="true" style={{ marginTop: "40px", maxWidth: "480px" }}>
              <div
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: "16px",
                  padding: "22px",
                  boxShadow: "0 24px 80px rgba(14,114,251,.2)",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    paddingBottom: "14px",
                    borderBottom: "1px solid rgba(255,255,255,.12)",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#FFFFFF",
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
                  Copilot
                </div>
                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <p
                    style={{
                      maxWidth: "80%",
                      padding: "10px 16px",
                      borderRadius: "12px",
                      background: "#0B66E4",
                      color: "#FFFFFF",
                      fontSize: "15px",
                      lineHeight: "22px",
                    }}
                  >
                    What needs me today?
                  </p>
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <p style={{ fontSize: "15px", lineHeight: "22px", color: "#FFFFFF" }}>
                    Three things are waiting on you.
                  </p>
                  <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,.06)",
                        fontSize: "14px",
                        color: "#FFFFFF",
                      }}
                    >
                      <span>Paid orders not shipped after 3+ days</span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          lineHeight: "16px",
                          background: "#FFF4DB",
                          color: "#7A5200",
                        }}
                      >
                        Needs review
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,.06)",
                        fontSize: "14px",
                        color: "#FFFFFF",
                      }}
                    >
                      <span>Products with open orders running low</span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          lineHeight: "16px",
                          background: "#FDECEA",
                          color: "#B42318",
                        }}
                      >
                        Low stock
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,.06)",
                        fontSize: "14px",
                        color: "#FFFFFF",
                      }}
                    >
                      <span>Gang sheet jobs nobody paid for</span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          lineHeight: "16px",
                          background: "#FFF4DB",
                          color: "#7A5200",
                        }}
                      >
                        Draft (unpaid)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p style={{ marginTop: "32px", fontSize: "15px", color: "rgba(255,255,255,.78)" }}>
              Prefer to look around yourself?{" "}
              <Link href="/signup" style={{ fontWeight: "600", color: "#FFFFFF", textDecoration: "underline" }}>
                Start free trial
              </Link>
            </p>
          </div>
          <div style={{ flex: "1 1 440px", minWidth: "0", position: "sticky", top: "96px" }}>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 24px 60px rgba(12,30,53,0.18)",
                color: "#3A4A5E",
              }}
            >
              {notDone && (
                <form onSubmit={submit}>
                  {/* Left empty by people; a form-filling bot fills it, and is answered as if it went through. */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>
                    <label htmlFor="d-hp-note">Leave this field empty</label>
                    <input id="d-hp-note" name="hp_note" tabIndex={-1} autoComplete="off" />
                  </div>
                  <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                    Tell us about your business
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
                          <label htmlFor="d-name" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Full name
                          </label>
                          <input
                            id="d-name"
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
                          <label htmlFor="d-email" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Work email
                          </label>
                          <input
                            id="d-email"
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
                        <label htmlFor="d-biz" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          Business name
                        </label>
                        <input
                          id="d-biz"
                          name="biz"
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
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                          gap: "16px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label htmlFor="d-type" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Business type
                          </label>
                          <select
                            id="d-type"
                            name="type"
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
                            <option value="">Select one</option>
                            <option>Print shop</option>
                            <option>DTF or gang sheet shop</option>
                            <option>Screen printer</option>
                            <option>Embroiderer</option>
                            <option>Blank or wholesale apparel supplier</option>
                            <option>Custom apparel brand</option>
                            {RETAIL_LAUNCHED && <option>D2C or retail brand</option>}
                            <option>Other</option>
                          </select>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label htmlFor="d-country" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Country
                          </label>
                          <select
                            id="d-country"
                            name="country"
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
                            <option value="">Select one</option>
                            <option>United States</option>
                            <option>Canada</option>
                            <option>United Kingdom</option>
                            <option>Australia</option>
                            <option>Germany</option>
                            <option>United Arab Emirates</option>
                            <option>Other</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label htmlFor="d-sell" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          What do you sell?
                        </label>
                        <textarea
                          id="d-sell"
                          name="sell"
                          placeholder="Products, services, who you sell to"
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
                        Book a demo
                      </button>
                      {error && (
                        <p
                          role="alert"
                          style={{ fontSize: "14px", lineHeight: "20px", color: "#B42318", textAlign: "center" }}
                        >
                          {error}
                        </p>
                      )}
                      <p style={{ fontSize: "13px", lineHeight: "18px", color: "#5A6A7E", textAlign: "center" }}>
                        We will email you a few times to choose from.
                      </p>
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
                      Thanks, we got it.
                    </h2>
                    <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                      Check your email. We will send a few times to choose from.
                    </p>
                    <Link
                      className={s["btn-line"]}
                      href="/signup"
                      style={{
                        marginTop: "24px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "48px",
                        padding: "0 24px",
                        borderRadius: "8px",
                        border: "1px solid #D5DCE6",
                        background: "#FFFFFF",
                        color: "#0C1E35",
                        fontSize: "15px",
                        fontWeight: "600",
                      }}
                    >
                      Start free trial while you wait
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      <section style={{ background: "#FFFFFF" }}>
        <div className={s["sec"]} style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px" }}>
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
            What happens next
          </p>
          <h2 className={s["d"]} style={{ marginTop: "12px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}>
            Three steps, no surprises.
          </h2>
          <div
            style={{
              marginTop: "40px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "32px",
            }}
          >
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
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
                  <rect x="5" y="3" width="14" height="18" rx="2"></rect>
                  <path d="M9 8h6M9 12h6M9 16h4"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  1. Send the form
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  Tell us what you sell and who you sell to.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
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
                  2. Pick a time
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  We email you a few times that suit you.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
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
                  <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>
                  <path d="M19 15v4M17 17h4"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  3. See it on your terms
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  We walk through your setup and help you choose a plan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
