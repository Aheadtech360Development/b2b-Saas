/** printcopilot.co/features — the design's Features page. */
import Link from "next/link";
import s from "../marketing.module.css";

export default function FeaturesPage() {
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
            padding: "80px 32px 0",
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
            Features
          </div>
          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "24px auto 0", maxWidth: "860px", fontSize: "56px", lineHeight: "60px", color: "#FFFFFF" }}
          >
            Everything you need to sell, produce and manage.
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
            One platform for your store, gang sheets, wholesale, production and the AI that watches over them. See each
            part below.
          </p>
          <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px" }}>
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
          <div
            className={s["chips-sm"]}
            style={{ marginTop: "28px", flexWrap: "wrap", justifyContent: "center", gap: "10px" }}
          >
            <a
              className={s["btn-ghost"]}
              href="#gang"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Gang Sheet Builder
            </a>
            <a
              className={s["btn-ghost"]}
              href="#wholesale"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Wholesale and B2B
            </a>
            <a
              className={s["btn-ghost"]}
              href="#storefront"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Storefront and website builder
            </a>
            <a
              className={s["btn-ghost"]}
              href="#orders"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Orders and production
            </a>
            <a
              className={s["btn-ghost"]}
              href="#customers"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Customers and buyer portal
            </a>
            <a
              className={s["btn-ghost"]}
              href="#ai"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              AI analytics agent
            </a>
            <a
              className={s["btn-ghost"]}
              href="#suppliers"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Suppliers and payments
            </a>
            <a
              className={s["btn-ghost"]}
              href="#mobile"
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,.28)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Mobile app
            </a>
          </div>
          <div aria-hidden="true" style={{ maxWidth: "1000px", margin: "56px auto 0" }}>
            <div
              style={{
                display: "flex",
                textAlign: "left",
                background: "#F6F8FB",
                border: "1px solid rgba(255,255,255,.18)",
                borderBottom: "0",
                borderRadius: "16px 16px 0 0",
                overflow: "hidden",
                boxShadow: "0 24px 80px rgba(14,114,251,.25)",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  flex: "none",
                  width: "64px",
                  background: "#0C1E35",
                  borderRight: "1px solid rgba(255,255,255,.08)",
                  padding: "20px 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div style={{ width: "26px", height: "26px", borderRadius: "7px", background: "#0E72FB" }}></div>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                  }}
                ></div>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                  }}
                ></div>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                  }}
                ></div>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                  }}
                ></div>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                  }}
                ></div>
              </div>
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
            paddingTop: "56px",
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
            href="#gang"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              01
            </span>
            Gang Sheet Builder
          </a>
          <a
            href="#wholesale"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              02
            </span>
            Wholesale and B2B
          </a>
          <a
            href="#storefront"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              03
            </span>
            Storefront and website builder
          </a>
          <a
            href="#orders"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              04
            </span>
            Orders and production
          </a>
          <a
            href="#customers"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              05
            </span>
            Customers and buyer portal
          </a>
          <a
            href="#ai"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              06
            </span>
            AI analytics agent
          </a>
          <a
            href="#suppliers"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              07
            </span>
            Suppliers and payments
          </a>
          <a
            href="#mobile"
            style={{ display: "block", padding: "9px 0", fontSize: "14px", lineHeight: "20px", color: "#3A4A5E" }}
          >
            <span className={s["d"]} style={{ color: "#0B66E4", marginRight: "8px" }}>
              08
            </span>
            Mobile app
          </a>
        </aside>
        <main style={{ flex: "1", minWidth: "0" }}>
          <section id="gang" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                01
              </span>
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
                Gang Sheet Builder
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              Buyers build their own gang sheets in your store.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Each paid sheet lands in your production queue.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
                  <div style={{ maxWidth: "620px", margin: "0 auto" }}>
                    <div
                      style={{
                        background: "#F6F8FB",
                        borderRadius: "16px",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,.18)",
                        boxShadow: "0 24px 80px rgba(14,114,251,.25)",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          background: "#FFFFFF",
                          borderBottom: "1px solid #E3E8EF",
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              background: "#EAF3FF",
                              color: "#0A4FB3",
                              fontSize: "12px",
                              fontWeight: "600",
                            }}
                          >
                            Sheet 22 x 24 in
                          </span>
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              border: "1px solid #D5DCE6",
                              color: "#3A4A5E",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            Upload art
                          </span>
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              border: "1px solid #D5DCE6",
                              color: "#3A4A5E",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            Arrange
                          </span>
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: "36px",
                            padding: "0 14px",
                            borderRadius: "8px",
                            background: "#0B66E4",
                            color: "#FFFFFF",
                            fontSize: "13px",
                            fontWeight: "600",
                          }}
                        >
                          Add to cart
                        </span>
                      </div>
                      <div style={{ padding: "20px" }}>
                        <div
                          style={{
                            background: "#FFFFFF",
                            border: "1px solid #D5DCE6",
                            borderRadius: "8px",
                            padding: "14px",
                            display: "grid",
                            gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                            gridTemplateRows: "repeat(5,40px)",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              gridColumn: "span 3",
                              gridRow: "span 2",
                              border: "1.5px solid #0E72FB",
                              borderRadius: "6px",
                              background: "#EAF3FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#0A4FB3",
                            }}
                          >
                            Art 1
                          </div>
                          <div
                            style={{
                              gridColumn: "span 2",
                              gridRow: "span 3",
                              border: "1.5px solid #0E72FB",
                              borderRadius: "6px",
                              background: "#EAF3FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#0A4FB3",
                            }}
                          >
                            Art 2
                          </div>
                          <div
                            style={{
                              gridColumn: "span 1",
                              gridRow: "span 2",
                              border: "1.5px solid #0E72FB",
                              borderRadius: "6px",
                              background: "#EAF3FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#0A4FB3",
                            }}
                          >
                            3
                          </div>
                          <div
                            style={{
                              gridColumn: "span 3",
                              gridRow: "span 1",
                              border: "1.5px solid #0E72FB",
                              borderRadius: "6px",
                              background: "#EAF3FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#0A4FB3",
                            }}
                          >
                            Art 4
                          </div>
                          <div
                            style={{
                              gridColumn: "span 2",
                              gridRow: "span 2",
                              border: "1.5px solid #0E72FB",
                              borderRadius: "6px",
                              background: "#EAF3FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#0A4FB3",
                            }}
                          >
                            Art 5
                          </div>
                          <div
                            style={{
                              gridColumn: "span 4",
                              gridRow: "span 1",
                              border: "1.5px dashed #D5DCE6",
                              borderRadius: "6px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "500",
                              color: "#5A6A7E",
                            }}
                          >
                            Drop art here
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Build in the browser.</strong> Buyers arrange art on a sheet
                  without design software.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Sizes you control.</strong> Each product opens its own sheet
                  sizes, set from your backend.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Upload a print ready file.</strong> A pop-up on the product page
                  for buyers with a finished sheet.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Transfers by size.</strong> Buyers upload art and order by size.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Commission only here.</strong> It applies to Gang Sheet orders
                  only, and drops as you move up a plan.
                </p>
              </li>
            </ul>
          </section>
          <section id="wholesale" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                02
              </span>
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
                Wholesale and B2B
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              Wholesale that does not run on email.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Control who can buy, what they pay and how they pay.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
              <div
                style={{
                  background: "#F6F8FB",
                  border: "1px solid #E3E8EF",
                  borderRadius: "16px",
                  padding: "40px 32px",
                }}
              >
                <div style={{ maxWidth: "660px", margin: "0 auto" }}>
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E3E8EF",
                      borderRadius: "16px",
                      padding: "22px",
                      boxShadow: "0 24px 80px rgba(14,114,251,.2)",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <p className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                          Matrix ordering
                        </p>
                        <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>
                          Classic tee, by color and size
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                          Wholesale tier
                        </span>
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
                          Net terms approved
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "16px",
                        overflowX: "auto",
                        border: "1px solid #E3E8EF",
                        borderRadius: "12px",
                      }}
                    >
                      <div style={{ minWidth: "400px" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.4fr repeat(5,minmax(0,1fr))",
                            gap: "8px",
                            padding: "10px 16px",
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#5A6A7E",
                          }}
                        >
                          <span>Color</span>
                          <span>S</span>
                          <span>M</span>
                          <span>L</span>
                          <span>XL</span>
                          <span>2XL</span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.4fr repeat(5,minmax(0,1fr))",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 16px",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "14px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>Black</span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            12
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            24
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            24
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            12
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.4fr repeat(5,minmax(0,1fr))",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 16px",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "14px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>Navy</span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            12
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #0E72FB",
                              background: "#EAF3FF",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            12
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.4fr repeat(5,minmax(0,1fr))",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 16px",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "14px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>White</span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                          <span
                            style={{
                              padding: "8px",
                              border: "1px solid #D5DCE6",
                              borderRadius: "8px",
                              textAlign: "center",
                            }}
                          >
                            0
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: "40px",
                          padding: "0 18px",
                          borderRadius: "8px",
                          background: "#0B66E4",
                          color: "#FFFFFF",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        Add to order
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Account approval.</strong> Review and approve each buyer account.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Pricing tiers.</strong> Set different prices for different buyer
                  groups.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Net terms.</strong> Offer payment terms to approved buyers.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Quick Buy.</strong> Repeat buyers reorder in a few clicks.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Matrix ordering grid.</strong> Order by color and size in one
                  grid.
                </p>
              </li>
            </ul>
          </section>
          <section id="storefront" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                03
              </span>
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
                Storefront and website builder
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              A store in your brand, with live chat built in.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Your logo, your colors, your pages.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
                  <div style={{ maxWidth: "620px", margin: "0 auto" }}>
                    <div
                      style={{
                        position: "relative",
                        background: "#FFFFFF",
                        border: "1px solid #E3E8EF",
                        borderRadius: "16px",
                        overflow: "hidden",
                        boxShadow: "0 24px 80px rgba(14,114,251,.2)",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          background: "#F6F8FB",
                          borderBottom: "1px solid #E3E8EF",
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <span style={{ display: "flex", gap: "6px" }}>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: "#D5DCE6",
                              display: "inline-block",
                            }}
                          ></span>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: "#D5DCE6",
                              display: "inline-block",
                            }}
                          ></span>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: "#D5DCE6",
                              display: "inline-block",
                            }}
                          ></span>
                        </span>
                        <span
                          style={{
                            flex: "1",
                            maxWidth: "240px",
                            padding: "4px 12px",
                            borderRadius: "999px",
                            background: "#FFFFFF",
                            border: "1px solid #E3E8EF",
                            fontSize: "12px",
                            color: "#5A6A7E",
                          }}
                        >
                          yourstore.com
                        </span>
                      </div>
                      <div style={{ padding: "18px 22px 26px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <span className={s["d"]} style={{ fontSize: "18px", color: "#0C1E35" }}>
                            Your Brand
                          </span>
                          <span style={{ display: "flex", gap: "14px", fontSize: "13px", color: "#5A6A7E" }}>
                            <span>Shop</span>
                            <span>Gang sheets</span>
                            <span>Contact</span>
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: "16px",
                            height: "110px",
                            borderRadius: "12px",
                            background: "#EAF3FF",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 22px",
                          }}
                        >
                          <div>
                            <div
                              style={{ height: "12px", width: "170px", borderRadius: "6px", background: "#0C1E35" }}
                            ></div>
                            <div
                              style={{
                                marginTop: "10px",
                                height: "8px",
                                width: "110px",
                                borderRadius: "4px",
                                background: "#D5DCE6",
                              }}
                            ></div>
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: "12px",
                                padding: "6px 14px",
                                borderRadius: "8px",
                                background: "#0B66E4",
                                color: "#FFFFFF",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              Shop now
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: "14px",
                            display: "grid",
                            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                height: "78px",
                                borderRadius: "8px",
                                background: "#F6F8FB",
                                border: "1px solid #E3E8EF",
                              }}
                            ></div>
                            <div
                              style={{
                                marginTop: "8px",
                                height: "8px",
                                width: "70%",
                                borderRadius: "4px",
                                background: "#D5DCE6",
                              }}
                            ></div>
                          </div>
                          <div>
                            <div
                              style={{
                                height: "78px",
                                borderRadius: "8px",
                                background: "#F6F8FB",
                                border: "1px solid #E3E8EF",
                              }}
                            ></div>
                            <div
                              style={{
                                marginTop: "8px",
                                height: "8px",
                                width: "55%",
                                borderRadius: "4px",
                                background: "#D5DCE6",
                              }}
                            ></div>
                          </div>
                          <div>
                            <div
                              style={{
                                height: "78px",
                                borderRadius: "8px",
                                background: "#F6F8FB",
                                border: "1px solid #E3E8EF",
                              }}
                            ></div>
                            <div
                              style={{
                                marginTop: "8px",
                                height: "8px",
                                width: "65%",
                                borderRadius: "4px",
                                background: "#D5DCE6",
                              }}
                            ></div>
                          </div>
                        </div>
                        <div style={{ height: "58px" }}></div>
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          right: "16px",
                          bottom: "16px",
                          width: "220px",
                          background: "#FFFFFF",
                          border: "1px solid #E3E8EF",
                          borderRadius: "12px",
                          padding: "12px 14px",
                          boxShadow: "0 24px 60px rgba(12,30,53,0.2)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#0E6B38",
                          }}
                        >
                          <span
                            className={s["live"]}
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "999px",
                              background: "#0E6B38",
                              display: "inline-block",
                            }}
                          ></span>
                          Online now
                        </div>
                        <p style={{ marginTop: "6px", fontSize: "14px", lineHeight: "20px", color: "#0C1E35" }}>
                          Hi, need help picking a sheet size?
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Theme editor.</strong> Change colors, fonts and layout to match
                  your brand.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Website builder.</strong> Build pages and menus without code.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>SEO settings.</strong> Set titles and descriptions for pages and
                  products.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Live chat.</strong> Answer buyer questions while they shop.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Cart, checkout and sign in.</strong> Universal pages that work
                  out of the box.
                </p>
              </li>
            </ul>
          </section>
          <section id="orders" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                04
              </span>
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
                Orders and production
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              One list for every order and job.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Know what is paid, what is printing and what is late.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
              <div
                style={{
                  background: "#F6F8FB",
                  border: "1px solid #E3E8EF",
                  borderRadius: "16px",
                  padding: "40px 32px",
                }}
              >
                <div style={{ maxWidth: "720px", margin: "0 auto" }}>
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
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Real statuses.</strong> Paid, In production, Ready to ship, Late.
                  A job nobody paid for says Draft (unpaid).
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Side panel.</strong> Open an order without leaving the list.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Production tracking.</strong> See each job move through your
                  queue.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Reports.</strong> Sales and order reports without a spreadsheet.
                </p>
              </li>
            </ul>
          </section>
          <section id="customers" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                05
              </span>
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
                Customers and buyer portal
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              Customers, and a buyer portal they will actually use.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Buyers help themselves, so you answer fewer emails.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
                  <div style={{ maxWidth: "620px", margin: "0 auto" }}>
                    <div
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #E3E8EF",
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
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <p className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                          Your account
                        </p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <span
                            style={{
                              padding: "6px 14px",
                              borderRadius: "999px",
                              background: "#EAF3FF",
                              color: "#0A4FB3",
                              fontSize: "13px",
                              fontWeight: "600",
                            }}
                          >
                            Orders
                          </span>
                          <span
                            style={{
                              padding: "6px 14px",
                              borderRadius: "999px",
                              border: "1px solid #D5DCE6",
                              color: "#3A4A5E",
                              fontSize: "13px",
                              fontWeight: "500",
                            }}
                          >
                            Statements
                          </span>
                          <span
                            style={{
                              padding: "6px 14px",
                              borderRadius: "999px",
                              border: "1px solid #D5DCE6",
                              color: "#3A4A5E",
                              fontSize: "13px",
                              fontWeight: "500",
                            }}
                          >
                            Team
                          </span>
                        </div>
                      </div>
                      <div style={{ marginTop: "14px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            padding: "14px 0",
                            borderTop: "1px solid #E3E8EF",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>Order #1042</p>
                            <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>
                              Harbor Tees print run
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                            <span
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid #D5DCE6",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#0C1E35",
                              }}
                            >
                              Reorder
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            padding: "14px 0",
                            borderTop: "1px solid #E3E8EF",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>Order #1038</p>
                            <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>
                              Gang sheet, 22 x 24 in
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                            <span
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid #D5DCE6",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#0C1E35",
                              }}
                            >
                              Reorder
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            padding: "14px 0",
                            borderTop: "1px solid #E3E8EF",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>Statement</p>
                            <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>Balance and invoices</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                              Up to date
                            </span>
                            <span
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid #D5DCE6",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#0C1E35",
                              }}
                            >
                              View
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            padding: "14px 0",
                            borderTop: "1px solid #E3E8EF",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>Team members</p>
                            <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>
                              Add colleagues to the account
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                              1 owner
                            </span>
                            <span
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid #D5DCE6",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#0C1E35",
                              }}
                            >
                              Add user
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Customer profiles and segments.</strong> Group buyers and see
                  their history in one place.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Reorder and track.</strong> Buyers reorder, follow jobs and check
                  statements.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Team members.</strong> Buyers add colleagues to their account.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Two portals.</strong> Default on Starter, Wholesale on the
                  Wholesale and Scale plans.
                </p>
              </li>
            </ul>
          </section>
          <section id="ai" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                06
              </span>
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
                AI analytics agent
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              An AI agent that watches the store around the clock.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              It reads your orders, stock and customers, then tells you what needs you.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
                      <div style={{ marginTop: "18px" }}>
                        <input
                          type="text"
                          readOnly
                          aria-label="Ask the copilot"
                          placeholder="Ask about orders, stock or customers"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            minHeight: "48px",
                            padding: "0 16px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,.2)",
                            background: "rgba(255,255,255,.04)",
                            color: "#FFFFFF",
                            fontSize: "15px",
                            fontFamily: "'Inter',system-ui,sans-serif",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Always on.</strong> Watches the store 24 hours a day.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Flags what needs you.</strong> Late jobs, paid orders not
                  shipped, low stock.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Answers in plain words.</strong> Ask about orders, stock or
                  customers.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>On every page.</strong> One drawer that knows the screen you are
                  on.
                </p>
              </li>
            </ul>
          </section>
          <section id="suppliers" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                07
              </span>
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
                Suppliers and payments
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              Suppliers and payments, already connected.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Bring in catalogs and get paid without extra tools.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
              <div
                style={{
                  background: "#F6F8FB",
                  border: "1px solid #E3E8EF",
                  borderRadius: "16px",
                  padding: "40px 32px",
                }}
              >
                <div style={{ maxWidth: "560px", margin: "0 auto" }}>
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E3E8EF",
                      borderRadius: "16px",
                      padding: "22px",
                      boxShadow: "0 24px 80px rgba(14,114,251,.2)",
                      textAlign: "left",
                    }}
                  >
                    <p
                      className={s["d"]}
                      style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35", paddingBottom: "12px" }}
                    >
                      Connections
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "16px 0",
                        borderTop: "1px solid #E3E8EF",
                      }}
                    >
                      <div>
                        <p className={s["d"]} style={{ fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}>
                          S&amp;S Activewear
                        </p>
                        <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>Blank apparel catalog</p>
                      </div>
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
                        Connected
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "16px 0",
                        borderTop: "1px solid #E3E8EF",
                      }}
                    >
                      <div>
                        <p className={s["d"]} style={{ fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}>
                          SanMar
                        </p>
                        <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>Blank apparel catalog</p>
                      </div>
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
                        Connected
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "16px 0",
                        borderTop: "1px solid #E3E8EF",
                      }}
                    >
                      <div>
                        <p className={s["d"]} style={{ fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}>
                          Stripe
                        </p>
                        <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>
                          Payments and payouts through Stripe Connect
                        </p>
                      </div>
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
                        Connected
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>S&amp;S Activewear.</strong> Bring the blank apparel catalog into
                  your store.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>SanMar.</strong> Connect the SanMar catalog and list products
                  faster.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Stripe Connect.</strong> Card payments and payouts run through
                  Stripe.
                </p>
              </li>
            </ul>
          </section>
          <section id="mobile" style={{ padding: "72px 0", borderBottom: "1px solid #E3E8EF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={s["d"]} style={{ fontSize: "14px", color: "#0B66E4" }}>
                08
              </span>
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
                Mobile app
              </p>
            </div>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", maxWidth: "640px", fontSize: "36px", lineHeight: "42px", color: "#0C1E35" }}
            >
              Your store, in an app.
            </h2>
            <p style={{ marginTop: "12px", maxWidth: "600px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Take PrintCoPilot beyond the browser.
            </p>
            <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
                  <div style={{ maxWidth: "360px", margin: "0 auto" }}>
                    <div
                      style={{
                        width: "250px",
                        margin: "0 auto",
                        border: "8px solid #13294A",
                        borderRadius: "38px",
                        background: "#F6F8FB",
                        overflow: "hidden",
                        boxShadow: "0 24px 80px rgba(14,114,251,.3)",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{ background: "#FFFFFF", padding: "18px 16px 12px", borderBottom: "1px solid #E3E8EF" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span className={s["d"]} style={{ fontSize: "15px", color: "#0C1E35" }}>
                            PrintCoPilot
                          </span>
                          <span
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "999px",
                              background: "#0E72FB",
                              display: "inline-block",
                            }}
                          ></span>
                        </div>
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px 12px",
                            border: "1px solid #D5DCE6",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "#5A6A7E",
                          }}
                        >
                          Search orders
                        </div>
                      </div>
                      <div style={{ padding: "6px 16px 12px", background: "#FFFFFF" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "11px 0",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "13px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>#1042</span>
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
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "11px 0",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "13px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>#1041</span>
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
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "11px 0",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "13px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>#1040</span>
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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "11px 0",
                            borderTop: "1px solid #E3E8EF",
                            fontSize: "13px",
                            color: "#0C1E35",
                          }}
                        >
                          <span style={{ fontWeight: "600" }}>#1039</span>
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
                        </div>
                      </div>
                      <div
                        aria-hidden="true"
                        style={{
                          display: "flex",
                          justifyContent: "space-around",
                          padding: "14px 12px",
                          background: "#FFFFFF",
                          borderTop: "1px solid #E3E8EF",
                        }}
                      >
                        <span
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "6px",
                            background: "#0E72FB",
                            display: "inline-block",
                          }}
                        ></span>
                        <span
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "6px",
                            border: "1.5px solid #D5DCE6",
                            display: "inline-block",
                          }}
                        ></span>
                        <span
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "6px",
                            border: "1.5px solid #D5DCE6",
                            display: "inline-block",
                          }}
                        ></span>
                        <span
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "6px",
                            border: "1.5px solid #D5DCE6",
                            display: "inline-block",
                          }}
                        ></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ul
              style={{
                margin: "32px 0 0",
                padding: "0",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "20px 32px",
              }}
            >
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Included on Scale.</strong> The mobile app comes with the Scale
                  plan.
                </p>
              </li>
              <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    marginTop: "2px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#EAF3FF",
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
                    stroke="#0B66E4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                <p style={{ fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  <strong style={{ color: "#0C1E35" }}>Add-on on Starter and Wholesale.</strong> Add it to either plan
                  when you need it.
                </p>
              </li>
            </ul>
          </section>
        </main>
      </div>
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
            Ready to see it with your own products?
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
            Start the trial, set up your store and take a look around.
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
