/** printcopilot.co/about — the design's About page. */
import Link from "next/link";
import s from "../marketing.module.css";
import { RETAIL_LAUNCHED } from "@/lib/retailLaunch";

export default function AboutPage() {
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
            padding: "80px 32px 88px",
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
            About
          </div>
          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "24px auto 0", maxWidth: "860px", fontSize: "56px", lineHeight: "60px", color: "#FFFFFF" }}
          >
            {RETAIL_LAUNCHED
              ? "Software built for how print, apparel and D2C businesses really work."
              : "Software built for how print and apparel businesses really work."}
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
            PrintCoPilot brings your store, your gang sheets, your wholesale buyers and your production into one place.
          </p>
        </div>
      </section>
      <section style={{ background: "#FFFFFF" }}>
        <div className={s["sec"]} style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "center" }}>
            <div style={{ flex: "1 1 380px", minWidth: "0" }}>
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
                Why it exists
              </p>
              <h2
                className={s["d"]}
                style={{ marginTop: "12px", maxWidth: "560px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
              >
                Most print and apparel businesses run on a patchwork.
              </h2>
              <p style={{ marginTop: "20px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
                A store in one tab, a gang sheet app in another, a spreadsheet for production and an inbox for
                everything else. Every extra tool is another place an order can get stuck.
              </p>
              <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
                PrintCoPilot puts the whole flow in one platform, so you can see what is paid, what is printing and what
                needs you.
              </p>
            </div>
            <div aria-hidden="true" style={{ flex: "1.2 1 460px", minWidth: "0" }}>
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  background: "#0C1E35",
                  borderRadius: "16px",
                  padding: "40px 32px",
                }}
              >
                <div
                  className={s["grid-bg"]}
                  style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
                ></div>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "-100px",
                    width: "700px",
                    height: "420px",
                    marginLeft: "-350px",
                    background: "radial-gradient(closest-side,rgba(14,114,251,.32),rgba(14,114,251,0))",
                    pointerEvents: "none",
                  }}
                ></div>
                <div style={{ position: "relative" }}>
                  <div style={{ maxWidth: "560px", margin: "0 auto" }}>
                    <div
                      style={{
                        display: "flex",
                        textAlign: "left",
                        background: "#F6F8FB",
                        border: "1px solid rgba(255,255,255,.18)",
                        borderRadius: "16px",
                        overflow: "hidden",
                        boxShadow: "0 24px 80px rgba(14,114,251,.25)",
                      }}
                    >
                      <div style={{ flex: "1", minWidth: "0" }}>
                        <div
                          style={{
                            minHeight: "52px",
                            background: "#FFFFFF",
                            borderBottom: "1px solid #E3E8EF",
                            padding: "0 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                              width: "260px",
                              maxWidth: "100%",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              padding: "7px 12px",
                              fontSize: "13px",
                              color: "#5A6A7E",
                            }}
                          >
                            <span>Search orders, buyers</span>
                            <span style={{ fontSize: "12px", fontWeight: "600" }}>Cmd K</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              fontSize: "13px",
                              fontWeight: "600",
                              color: "#0C1E35",
                            }}
                          >
                            Inbox{" "}
                            <span
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "999px",
                                background: "#0E72FB",
                                display: "inline-block",
                              }}
                            ></span>
                            <span
                              style={{
                                width: "26px",
                                height: "26px",
                                borderRadius: "999px",
                                background: "#0C1E35",
                                display: "inline-block",
                              }}
                            ></span>
                          </div>
                        </div>
                        <div style={{ padding: "20px" }}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <div>
                              <h3 className={s["d"]} style={{ fontSize: "26px", lineHeight: "32px", color: "#0C1E35" }}>
                                Orders
                              </h3>
                              <p style={{ marginTop: "4px", fontSize: "14px", color: "#5A6A7E" }}>
                                Every order and gang sheet job, in one list.
                              </p>
                            </div>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                minHeight: "40px",
                                padding: "0 16px",
                                borderRadius: "8px",
                                background: "#0B66E4",
                                color: "#FFFFFF",
                                fontSize: "14px",
                                fontWeight: "600",
                              }}
                            >
                              Create order
                            </span>
                          </div>
                          <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: "999px",
                                background: "#EAF3FF",
                                color: "#0A4FB3",
                                fontWeight: "600",
                                fontSize: "13px",
                              }}
                            >
                              All
                            </span>
                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: "999px",
                                border: "1px solid #D5DCE6",
                                color: "#3A4A5E",
                                fontWeight: "500",
                                background: "#FFFFFF",
                                fontSize: "13px",
                              }}
                            >
                              Paid
                            </span>
                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: "999px",
                                border: "1px solid #D5DCE6",
                                color: "#3A4A5E",
                                fontWeight: "500",
                                background: "#FFFFFF",
                                fontSize: "13px",
                              }}
                            >
                              In production
                            </span>
                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: "999px",
                                border: "1px solid #D5DCE6",
                                color: "#3A4A5E",
                                fontWeight: "500",
                                background: "#FFFFFF",
                                fontSize: "13px",
                              }}
                            >
                              Ready to ship
                            </span>
                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: "999px",
                                border: "1px solid #D5DCE6",
                                color: "#3A4A5E",
                                fontWeight: "500",
                                background: "#FFFFFF",
                                fontSize: "13px",
                              }}
                            >
                              Draft (unpaid)
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: "14px",
                              background: "#FFFFFF",
                              border: "1px solid #E3E8EF",
                              borderRadius: "12px",
                              overflowX: "auto",
                            }}
                          >
                            <div style={{ minWidth: "520px" }}>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  padding: "12px 20px",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  color: "#5A6A7E",
                                }}
                              >
                                <span>Order</span>
                                <span>Buyer</span>
                                <span>Production</span>
                                <span>Payment</span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  alignItems: "center",
                                  minHeight: "48px",
                                  padding: "0 20px",
                                  borderTop: "1px solid #E3E8EF",
                                  fontSize: "14px",
                                  color: "#0C1E35",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>#1042</span>
                                <span>Harbor Tees</span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#EAF3FF",
                                      color: "#0A4FB3",
                                    }}
                                  >
                                    In production
                                  </span>
                                </span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#E7F6EC",
                                      color: "#0E6B38",
                                    }}
                                  >
                                    Paid
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  alignItems: "center",
                                  minHeight: "48px",
                                  padding: "0 20px",
                                  borderTop: "1px solid #E3E8EF",
                                  fontSize: "14px",
                                  color: "#0C1E35",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>#1041</span>
                                <span>Studio North</span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#E7F6EC",
                                      color: "#0E6B38",
                                    }}
                                  >
                                    Ready to ship
                                  </span>
                                </span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#E7F6EC",
                                      color: "#0E6B38",
                                    }}
                                  >
                                    Paid
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  alignItems: "center",
                                  minHeight: "48px",
                                  padding: "0 20px",
                                  borderTop: "1px solid #E3E8EF",
                                  fontSize: "14px",
                                  color: "#0C1E35",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>#1040</span>
                                <span>Corner Print Co</span>
                                <span>
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
                                </span>
                                <span>
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
                                    Unpaid
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  alignItems: "center",
                                  minHeight: "48px",
                                  padding: "0 20px",
                                  borderTop: "1px solid #E3E8EF",
                                  fontSize: "14px",
                                  color: "#0C1E35",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>#1039</span>
                                <span>Pine Street Apparel</span>
                                <span>
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
                                    Late
                                  </span>
                                </span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#E7F6EC",
                                      color: "#0E6B38",
                                    }}
                                  >
                                    Paid
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                                  gap: "16px",
                                  alignItems: "center",
                                  minHeight: "48px",
                                  padding: "0 20px",
                                  borderTop: "1px solid #E3E8EF",
                                  fontSize: "14px",
                                  color: "#0C1E35",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>#1038</span>
                                <span>Harbor Tees</span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#EAF3FF",
                                      color: "#0A4FB3",
                                    }}
                                  >
                                    In production
                                  </span>
                                </span>
                                <span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      lineHeight: "16px",
                                      background: "#E7F6EC",
                                      color: "#0E6B38",
                                    }}
                                  >
                                    Paid
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section style={{ background: "#F6F8FB" }}>
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
            What we believe
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Three ideas behind every screen.
          </h2>
          <div
            style={{
              marginTop: "40px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "24px",
            }}
          >
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
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
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                One list beats five tools.
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Orders, jobs and customers belong together, not scattered across apps.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
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
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                You should see what needs you today.
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                The platform tells you what is late or stuck, so you do not have to hunt for it.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
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
                  <path d="M19 5L5 19"></path>
                  <circle cx="7" cy="7" r="2"></circle>
                  <circle cx="17" cy="17" r="2"></circle>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                Pricing should get cheaper as you grow.
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Plans are flat, and the gang sheet commission drops as you move up.
              </p>
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
            Who we build for
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Print and apparel businesses of every kind.
          </h2>
          <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              Print shops
            </span>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              DTF and gang sheet shops
            </span>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              Screen printers
            </span>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              Embroiderers
            </span>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              Blank and wholesale apparel suppliers
            </span>
            <span
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              Custom apparel brands
            </span>
            {RETAIL_LAUNCHED && (<span data-retail-card
              style={{
                padding: "12px 20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                fontSize: "15px",
                fontWeight: "600",
                color: "#0C1E35",
              }}
            >
              D2C and retail brands
            </span>)}
          </div>
        </div>
      </section>
      <section style={{ background: "#F6F8FB" }}>
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
            The team
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            The people behind PrintCoPilot.
          </h2>
          <div
            style={{
              marginTop: "32px",
              background: "#FFFFFF",
              border: "1.5px dashed #D5DCE6",
              borderRadius: "12px",
              padding: "32px",
            }}
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
            <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#5A6A7E" }}>
              [FOUNDER AND TEAM NAMES, PHOTOS AND ROLES GO HERE. Add only people who agree to be shown.]
            </p>
          </div>
        </div>
      </section>
      <section id="cta" style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
        <div
          className={s["grid-bg"]}
          style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "-80px",
            width: "900px",
            height: "500px",
            marginLeft: "-450px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.32),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          className={s["sec"]}
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "104px 32px",
            textAlign: "center",
          }}
        >
          <h2
            className={s["d"]}
            style={{ margin: "0 auto", maxWidth: "760px", fontSize: "48px", lineHeight: "52px", color: "#FFFFFF" }}
          >
            See what it can do for your business.
          </h2>
          <p
            style={{
              margin: "20px auto 0",
              maxWidth: "560px",
              fontSize: "18px",
              lineHeight: "28px",
              color: "rgba(255,255,255,.78)",
            }}
          >
            Start the trial or talk to us first.
          </p>
          <div style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px" }}>
            <Link
              className={s["btn-primary"]}
              href="/signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "56px",
                padding: "0 32px",
                borderRadius: "8px",
                background: "#0B66E4",
                color: "#FFFFFF",
                fontSize: "17px",
                fontWeight: "600",
              }}
            >
              Start free trial
            </Link>
            <Link
              className={s["btn-ghost"]}
              href="/demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "56px",
                padding: "0 28px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "17px",
                fontWeight: "600",
              }}
            >
              Book a demo
            </Link>
          </div>
          <p style={{ marginTop: "16px", fontSize: "14px", color: "rgba(255,255,255,.72)" }}>
            14 day trial. No card needed.
          </p>
        </div>
      </section>
    </>
  );
}
