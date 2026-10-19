"use client";

/** printcopilot.co/ — the design's Home page. */
import { Fragment } from "react";
import Link from "next/link";
import s from "../marketing.module.css";
import { useFaq, useSavingsCalculator } from "../interactive";

const FAQ = [
  { q: "Do I need a card to start?", a: "No. The trial lasts 14 days and does not ask for a card." },
  {
    q: "What does the commission cover?",
    a: "Only orders placed through the Gang Sheet Builder. Your plan sets the rate: 2.8%, 1.9% or 1.3%. Other orders carry no PrintCoPilot commission.",
  },
  {
    q: "Is this only a gang sheet builder?",
    a: "No. The builder is one part. You also get a storefront, wholesale ordering, production tracking, customers, reports and the AI copilot.",
  },
  {
    q: "Can I bring in supplier catalogs?",
    a: "Catalogs from S&S Activewear and SanMar connect directly to your store.",
  },
  {
    q: "Who is it built for?",
    a: "Print shops, DTF operators, screen printers, embroiderers, blank suppliers, wholesale apparel sellers and custom apparel brands.",
  },
  { q: "Can I talk to someone before I start?", a: "Yes. Book a demo and we will walk through your setup with you." },
];

/** Every point on each plan card — the same list as the Pricing page's cards. */
const PLAN_POINTS = {
  starter: ["300 orders", "3 staff accounts", "2.8% commission on Gang Sheet orders", "Default buyer portal"],
  wholesale: [
    "1,500 orders",
    "10 staff accounts",
    "1.9% commission on Gang Sheet orders",
    "Wholesale buyer portal",
    "Account approval, pricing tiers and net terms",
    "Quick Buy and matrix ordering grid",
  ],
  scale: [
    "Unlimited orders",
    "Unlimited staff accounts",
    "1.3% commission on Gang Sheet orders",
    "Mobile app included",
    "Everything in Wholesale",
  ],
};

/** A plan card's point, with the Pricing page's check mark. */
function PlanPoint({ children }: { children: string }) {
  return (
    <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          marginTop: "1px",
          width: "20px",
          height: "20px",
          borderRadius: "999px",
          background: "#EAF3FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="11"
          height="11"
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
      {children}
    </li>
  );
}

export default function HomePage() {
  const { salesLabel, salesValue, onSales, rates, currentCost, bestName, bestCost, verdict, plans } =
    useSavingsCalculator();
  const faqs = useFaq(FAQ);

  return (
    <>
      {/* HERO */}
      <section style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
        <div
          className={s["grid-bg"]}
          style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "-140px",
            width: "960px",
            height: "600px",
            marginLeft: "-480px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.34),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "88px 32px 0",
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
            Commerce and production for print and apparel businesses
          </div>

          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "28px auto 0", maxWidth: "900px", fontSize: "64px", lineHeight: "68px", color: "#FFFFFF" }}
          >
            One platform for orders, <span style={{ color: "#0E72FB" }}>gang sheets and production.</span>
          </h1>

          <p
            style={{
              margin: "24px auto 0",
              maxWidth: "680px",
              fontSize: "18px",
              lineHeight: "28px",
              color: "rgba(255,255,255,.78)",
            }}
          >
            PrintCoPilot gives print shops, DTF operators and apparel brands a storefront, a gang sheet builder,
            wholesale ordering and an AI copilot that watches the store for you.
          </p>

          <div style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px" }}>
            <Link
              className={s["btn-primary"]}
              href="/signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M12 5l7 7-7 7"></path>
              </svg>
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

          {/* Product window */}
          <div style={{ position: "relative", maxWidth: "1080px", margin: "64px auto 0" }}>
            <div
              className={s["float-chip"]}
              style={{
                position: "absolute",
                right: "-24px",
                top: "132px",
                zIndex: "2",
                width: "260px",
                textAlign: "left",
                background: "#FFFFFF",
                borderRadius: "12px",
                padding: "14px 16px",
                boxShadow: "0 24px 60px rgba(12,30,53,0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#0A4FB3",
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
              <p
                style={{ marginTop: "8px", fontSize: "14px", lineHeight: "20px", fontWeight: "600", color: "#0C1E35" }}
              >
                Paid orders not shipped after 3+ days
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: "10px",
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
              className={s["float-chip"]}
              style={{
                position: "absolute",
                left: "-24px",
                top: "330px",
                zIndex: "2",
                width: "240px",
                textAlign: "left",
                background: "#FFFFFF",
                borderRadius: "12px",
                padding: "14px 16px",
                boxShadow: "0 24px 60px rgba(12,30,53,0.35)",
              }}
            >
              <p style={{ fontSize: "12px", fontWeight: "600", color: "#5A6A7E" }}>Gang sheet builder</p>
              <p
                style={{ marginTop: "6px", fontSize: "14px", lineHeight: "20px", fontWeight: "600", color: "#0C1E35" }}
              >
                New job added to production
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: "10px",
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
            </div>

            <div
              style={{
                display: "flex",
                textAlign: "left",
                background: "#F6F8FB",
                border: "1px solid rgba(255,255,255,.18)",
                borderBottom: "0",
                borderRadius: "16px 16px 0 0",
                overflow: "hidden",
                boxShadow: "0 -10px 90px rgba(14,114,251,.28)",
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
                    minHeight: "56px",
                    background: "#FFFFFF",
                    borderBottom: "1px solid #E3E8EF",
                    padding: "0 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      width: "300px",
                      maxWidth: "100%",
                      border: "1px solid #D5DCE6",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: "#5A6A7E",
                    }}
                  >
                    <span>Search orders, buyers, products</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#5A6A7E" }}>Cmd K</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
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
                        width: "28px",
                        height: "28px",
                        borderRadius: "999px",
                        background: "#0C1E35",
                        display: "inline-block",
                      }}
                    ></span>
                  </div>
                </div>
                <div style={{ padding: "24px" }}>
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
                      <h3 className={s["d"]} style={{ fontSize: "28px", lineHeight: "34px", color: "#0C1E35" }}>
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
                  <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
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
                      All
                    </span>
                    <span
                      style={{
                        padding: "6px 14px",
                        borderRadius: "999px",
                        border: "1px solid #D5DCE6",
                        color: "#3A4A5E",
                        fontSize: "13px",
                        fontWeight: "500",
                        background: "#FFFFFF",
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
                        fontSize: "13px",
                        fontWeight: "500",
                        background: "#FFFFFF",
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
                        fontSize: "13px",
                        fontWeight: "500",
                        background: "#FFFFFF",
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
                        fontSize: "13px",
                        fontWeight: "500",
                        background: "#FFFFFF",
                      }}
                    >
                      Draft (unpaid)
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: "16px",
                      background: "#FFFFFF",
                      border: "1px solid #E3E8EF",
                      borderRadius: "12px",
                      overflowX: "auto",
                    }}
                  >
                    <div style={{ minWidth: "560px" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1.5fr 1.3fr 1fr",
                          gap: "16px",
                          padding: "12px 20px",
                          borderBottom: "1px solid #E3E8EF",
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
                          borderBottom: "1px solid #E3E8EF",
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
                          borderBottom: "1px solid #E3E8EF",
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
                          borderBottom: "1px solid #E3E8EF",
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
                          borderBottom: "1px solid #E3E8EF",
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

      {/* CAPABILITIES */}
      <section id="capabilities" style={{ background: "#FFFFFF", borderBottom: "1px solid #E3E8EF" }}>
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
            Everything built in
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "820px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Everything you need to sell, produce and manage, in one platform.
          </h2>
          <p style={{ marginTop: "16px", maxWidth: "640px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
            Not a pile of separate apps. Your store, builder, suppliers, chat and AI all work from the same orders and
            customers.
          </p>

          <div
            style={{
              marginTop: "48px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
              gap: "20px",
            }}
          >
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                  <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Gang Sheet Builder
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Buyers build gang sheets right on your store.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <path d="M3 9l1-5h16l1 5"></path>
                  <path d="M4 9v11h16V9"></path>
                  <path d="M9 20v-6h6v6"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Storefront and website builder
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                A branded store with pages, menus and themes you control.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Live chat
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Talk to buyers on your store while they shop.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                AI analytics agent
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Watches orders, stock and customers around the clock.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"></path>
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Supplier integrations
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                S&amp;S Activewear and SanMar catalogs, connected.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <path d="M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1z"></path>
                  <path d="M19 9a4 4 0 0 1 0 6"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Marketing and SEO
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                SEO tools and customer segments to reach the right buyers.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Orders and production
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                One list for every order and job.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Wholesale tools
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Approval, pricing tiers, net terms, Quick Buy and matrix ordering.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M4 21a8 8 0 0 1 16 0"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Buyer portal
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Buyers reorder, track jobs and check statements.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Customers and segments
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Profiles, groups and order history in one place.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
                  <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                  <path d="M2 10h20"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Payments with Stripe
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Card payments and payouts through Stripe Connect.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "24px" }}>
              <span
                aria-hidden="true"
                style={{
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
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "18px", lineHeight: "24px", color: "#0C1E35" }}
              >
                Reports
              </h3>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#3A4A5E" }}>
                Sales and order reports without a spreadsheet.
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: "32px",
              background: "#F6F8FB",
              border: "1.5px dashed #D5DCE6",
              borderRadius: "12px",
              padding: "20px 24px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px 24px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "#5A6A7E",
              }}
            >
              Placeholder
            </span>
            <p style={{ fontSize: "15px", lineHeight: "22px", color: "#5A6A7E" }}>
              [REAL CUSTOMER LOGOS GO HERE. Add only logos we have permission to show.]
            </p>
          </div>
        </div>
      </section>

      {/* GANG SHEET SPOTLIGHT */}
      <section id="gang" style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
        <div
          style={{
            position: "absolute",
            right: "-200px",
            top: "40px",
            width: "720px",
            height: "520px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.26),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          className={s["sec"]}
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "96px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "56px",
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
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: "#0E72FB",
                  display: "inline-block",
                }}
              ></span>
              Gang Sheet Builder
            </p>
            <h2
              className={s["d"]}
              style={{ marginTop: "16px", fontSize: "40px", lineHeight: "44px", color: "#FFFFFF" }}
            >
              A gang sheet builder that costs less as you grow.
            </h2>
            <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "rgba(255,255,255,.78)" }}>
              Commission applies only to Gang Sheet Builder orders, and the rate drops as your plan grows. Other orders
              carry no PrintCoPilot commission.
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
                Buyers build and arrange their designs in the browser
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
                Sizes and products are set up by you in the backend
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
                Upload a print ready file or order transfers by size from the product page
              </li>
            </ul>
            <div style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
              <Link
                className={s["btn-primary"]}
                href="/signup"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "52px",
                  padding: "0 28px",
                  borderRadius: "8px",
                  background: "#0B66E4",
                  color: "#FFFFFF",
                  fontSize: "16px",
                  fontWeight: "600",
                }}
              >
                Start free trial
              </Link>
              <a
                className={s["btn-ghost"]}
                href="#calc"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "52px",
                  padding: "0 24px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,.28)",
                  color: "#FFFFFF",
                  fontSize: "16px",
                  fontWeight: "600",
                }}
              >
                Try the calculator
              </a>
            </div>
          </div>

          <div aria-hidden="true" style={{ flex: "1.1 1 460px", minWidth: "0" }}>
            <div
              style={{
                background: "#F6F8FB",
                borderRadius: "16px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.18)",
                boxShadow: "0 24px 90px rgba(14,114,251,.25)",
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
              <div style={{ padding: "24px" }}>
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #D5DCE6",
                    borderRadius: "8px",
                    padding: "16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                    gridTemplateRows: "repeat(5,44px)",
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
      </section>

      {/* CALCULATOR */}
      <section id="calc" style={{ background: "#FFFFFF" }}>
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
            Commission calculator
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            See what you would pay at your volume.
          </h2>
          <p style={{ marginTop: "16px", maxWidth: "640px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
            Move the slider to your monthly gang sheet sales. We show the cheapest plan, and when it is not cheaper, we
            say so.
          </p>

          <div
            style={{
              marginTop: "48px",
              background: "#F6F8FB",
              border: "1px solid #E3E8EF",
              borderRadius: "16px",
              padding: "40px",
              display: "flex",
              flexWrap: "wrap",
              gap: "40px",
            }}
          >
            <div style={{ flex: "1 1 360px", minWidth: "0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <label htmlFor="sales" style={{ fontSize: "15px", fontWeight: "600", color: "#0C1E35" }}>
                  Monthly gang sheet sales
                </label>
                <span className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}>
                  {salesLabel}
                </span>
              </div>
              <input
                id="sales"
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={salesValue}
                onChange={onSales}
                style={{ marginTop: "16px", width: "100%", height: "44px" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#5A6A7E" }}>
                <span>$1,000</span>
                <span>$100,000</span>
              </div>

              <p style={{ marginTop: "32px", fontSize: "15px", fontWeight: "600", color: "#0C1E35" }}>
                What your current gang sheet app charges per order
              </p>
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {rates.map((r, ri) => (
                  <Fragment key={ri}>
                    <button type="button" onClick={r.pick} aria-pressed={r.pressed} style={r.style}>
                      {r.label}
                    </button>
                  </Fragment>
                ))}
              </div>
              <p style={{ marginTop: "12px", fontSize: "14px", lineHeight: "20px", color: "#5A6A7E" }}>
                Gang sheet apps typically charge 3 to 5% per order.
              </p>
            </div>

            <div
              style={{
                flex: "1.1 1 400px",
                minWidth: "0",
                background: "#0C1E35",
                borderRadius: "12px",
                padding: "32px",
                color: "#FFFFFF",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>Your current app fee</p>
                  <p
                    className={s["d"]}
                    style={{ marginTop: "6px", fontSize: "40px", lineHeight: "44px", color: "#FFFFFF" }}
                  >
                    {currentCost}
                  </p>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>per month</p>
                </div>
                <div style={{ flex: "1 1 160px" }}>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>PrintCoPilot, {bestName} plan</p>
                  <p
                    className={s["d"]}
                    style={{ marginTop: "6px", fontSize: "40px", lineHeight: "44px", color: "#FFFFFF" }}
                  >
                    {bestCost}
                  </p>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>plan plus commission</p>
                </div>
              </div>
              <p
                style={{
                  marginTop: "24px",
                  padding: "16px",
                  borderRadius: "8px",
                  background: "rgba(14,114,251,.22)",
                  border: "1px solid rgba(14,114,251,.5)",
                  fontSize: "16px",
                  lineHeight: "24px",
                  fontWeight: "600",
                  color: "#FFFFFF",
                }}
              >
                {verdict}
              </p>

              <div style={{ marginTop: "24px", display: "flex", flexDirection: "column" }}>
                {plans.map((p, pi) => (
                  <Fragment key={pi}>
                    <div style={p.rowStyle}>
                      <span style={{ fontSize: "15px", fontWeight: "600", color: "#FFFFFF" }}>{p.name}</span>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>{p.be}</span>
                      <span className={s["d"]} style={{ fontSize: "18px", color: "#FFFFFF" }}>
                        {p.cost}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <p style={{ marginTop: "16px", fontSize: "13px", lineHeight: "18px", color: "rgba(255,255,255,.72)" }}>
                The plan price covers the whole platform, not only the builder. The comparison counts gang sheet fees
                only.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHOLESALE */}
      <section id="wholesale" style={{ background: "#F6F8FB" }}>
        <div
          className={s["sec"]}
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "96px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "56px",
          }}
        >
          <div aria-hidden="true" style={{ flex: "1.1 1 460px", minWidth: "0" }}>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "16px",
                padding: "24px",
                boxShadow: "0 24px 60px rgba(12,30,53,0.10)",
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
                  <p style={{ marginTop: "2px", fontSize: "13px", color: "#5A6A7E" }}>Classic tee, by color and size</p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
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
              <div style={{ marginTop: "20px", overflowX: "auto", border: "1px solid #E3E8EF", borderRadius: "12px" }}>
                <div style={{ minWidth: "420px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr repeat(5,minmax(0,1fr))",
                      gap: "8px",
                      padding: "10px 16px",
                      borderBottom: "1px solid #E3E8EF",
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
                      borderBottom: "1px solid #E3E8EF",
                      fontSize: "14px",
                      color: "#0C1E35",
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>Black</span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      12
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      24
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      24
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      12
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
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
                      borderBottom: "1px solid #E3E8EF",
                      fontSize: "14px",
                      color: "#0C1E35",
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>Navy</span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
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
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
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
                      fontSize: "14px",
                      color: "#0C1E35",
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>White</span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                    <span
                      style={{ padding: "8px", border: "1px solid #D5DCE6", borderRadius: "8px", textAlign: "center" }}
                    >
                      0
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
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

          <div style={{ flex: "1 1 420px", minWidth: "0" }}>
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
              Wholesale
            </p>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
            >
              Wholesale that does not run on email.
            </h2>
            <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Repeat buyers order the way they already think: by color and size, in one grid. You decide who gets in and
              what they pay.
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
                color: "#0C1E35",
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
                Approve buyer accounts
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
                Pricing tiers and net terms per buyer
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
                Quick Buy for repeat orders
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
                Matrix ordering grid for size and color runs
              </li>
            </ul>
            <Link
              className={s["btn-primary"]}
              href="/signup"
              style={{
                marginTop: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "52px",
                padding: "0 28px",
                borderRadius: "8px",
                background: "#0B66E4",
                color: "#FFFFFF",
                fontSize: "16px",
                fontWeight: "600",
              }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* STOREFRONT AND LIVE CHAT */}
      <section id="storefront" style={{ background: "#FFFFFF" }}>
        <div
          className={s["sec"]}
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "96px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "56px",
          }}
        >
          <div style={{ flex: "1 1 420px", minWidth: "0" }}>
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
              Storefront and live chat
            </p>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
            >
              A store in your brand that talks to your buyers.
            </h2>
            <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
              Launch a store that looks like yours, not ours. When a buyer has a question, live chat answers it while
              they are still on the page.
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
                color: "#0C1E35",
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
                Edit your theme and build pages in the website builder
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
                Live chat on your store, so buyers can ask before they leave
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
                SEO settings for your pages and products
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
                Sign in, cart and checkout included
              </li>
            </ul>
            <Link
              className={s["btn-primary"]}
              href="/signup"
              style={{
                marginTop: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "52px",
                padding: "0 28px",
                borderRadius: "8px",
                background: "#0B66E4",
                color: "#FFFFFF",
                fontSize: "16px",
                fontWeight: "600",
              }}
            >
              Start free trial
            </Link>
          </div>

          <div aria-hidden="true" style={{ flex: "1.1 1 460px", minWidth: "0" }}>
            <div
              style={{
                position: "relative",
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow: "0 24px 60px rgba(12,30,53,0.12)",
              }}
            >
              <div
                style={{
                  background: "#F6F8FB",
                  borderBottom: "1px solid #E3E8EF",
                  padding: "12px 16px",
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
                    maxWidth: "260px",
                    padding: "5px 12px",
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
              <div style={{ padding: "20px 24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <span className={s["d"]} style={{ fontSize: "18px", color: "#0C1E35" }}>
                    Your Brand
                  </span>
                  <span style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#5A6A7E" }}>
                    <span>Shop</span>
                    <span>Gang sheets</span>
                    <span>Contact</span>
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "20px",
                    height: "120px",
                    borderRadius: "12px",
                    background: "#EAF3FF",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 24px",
                  }}
                >
                  <div>
                    <div style={{ height: "12px", width: "180px", borderRadius: "6px", background: "#0C1E35" }}></div>
                    <div
                      style={{
                        marginTop: "10px",
                        height: "8px",
                        width: "120px",
                        borderRadius: "4px",
                        background: "#D5DCE6",
                      }}
                    ></div>
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "14px",
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
                    marginTop: "16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        height: "84px",
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
                        height: "84px",
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
                        height: "84px",
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
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "20px",
                  bottom: "20px",
                  width: "230px",
                  background: "#FFFFFF",
                  border: "1px solid #E3E8EF",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  boxShadow: "0 24px 60px rgba(12,30,53,0.14)",
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
                <p style={{ marginTop: "8px", fontSize: "14px", lineHeight: "20px", color: "#0C1E35" }}>
                  Hi, need help picking a sheet size?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI COPILOT */}
      <section id="ai" style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
        <div
          style={{
            position: "absolute",
            left: "-220px",
            top: "60px",
            width: "720px",
            height: "520px",
            background: "radial-gradient(closest-side,rgba(14,114,251,.26),rgba(14,114,251,0))",
            pointerEvents: "none",
          }}
        ></div>
        <div
          className={s["sec"]}
          style={{
            position: "relative",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "96px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "56px",
          }}
        >
          <div style={{ flex: "1.1 1 440px", minWidth: "0" }}>
            <div
              style={{
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.16)",
                borderRadius: "16px",
                padding: "24px",
                boxShadow: "0 24px 90px rgba(14,114,251,.2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  paddingBottom: "16px",
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
              <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                <p
                  style={{
                    maxWidth: "80%",
                    padding: "12px 16px",
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
                  marginTop: "16px",
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <p style={{ fontSize: "15px", lineHeight: "22px", color: "#FFFFFF" }}>
                  Three things are waiting on you.
                </p>
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
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
              <div style={{ marginTop: "20px" }}>
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
              AI copilot
            </p>
            <h2
              className={s["d"]}
              style={{ marginTop: "16px", fontSize: "40px", lineHeight: "44px", color: "#FFFFFF" }}
            >
              A copilot that watches the store while you work.
            </h2>
            <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "rgba(255,255,255,.78)" }}>
              The 24/7 AI Data Analytics Agent reads your orders, stock and customers. It tells you what needs attention
              and answers questions in plain words.
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
                Flags late jobs and paid orders that have not shipped
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
                Open it on any page, and it knows the screen you are on
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
                Ask about orders, stock or customers without building a report
              </li>
            </ul>
            <Link
              className={s["btn-primary"]}
              href="/signup"
              style={{
                marginTop: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "52px",
                padding: "0 28px",
                borderRadius: "8px",
                background: "#0B66E4",
                color: "#FFFFFF",
                fontSize: "16px",
                fontWeight: "600",
              }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* WHO IT IS FOR */}
      <section id="who" style={{ background: "#FFFFFF" }}>
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
            Who it is for
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Built for the way print and apparel businesses sell.
          </h2>

          <div
            style={{
              marginTop: "48px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
              gap: "24px",
            }}
          >
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                Print shops
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Take orders online and move every job through production from one list.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                DTF and gang sheet shops
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Sell sheets and transfers by size with the builder inside your own store.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                Screen printers
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Bulk orders, reorders and buyer accounts without the email back and forth.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                Embroiderers
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Product pages, orders and job status for stitched work, all in one place.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                Blank and wholesale suppliers
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Account approval, pricing tiers, net terms and matrix ordering for repeat buyers.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                Custom apparel brands
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                A store, catalogs from S&amp;S Activewear and SanMar, and a copilot that keeps watch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT STARTS */}
      <section id="how" style={{ background: "#F6F8FB" }}>
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
            How it starts
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Try it with your own products before you pay.
          </h2>
          <div
            style={{
              marginTop: "48px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "32px",
            }}
          >
            <div>
              <p className={s["d"]} style={{ fontSize: "56px", lineHeight: "60px", color: "#0E72FB" }}>
                1
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "8px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Start your trial
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                14 days, no card. Create your store with an email and a store name.
              </p>
            </div>
            <div>
              <p className={s["d"]} style={{ fontSize: "56px", lineHeight: "60px", color: "#0E72FB" }}>
                2
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "8px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Set up your store
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Add products, connect S&amp;S Activewear or SanMar, and set your gang sheet sizes.
              </p>
            </div>
            <div>
              <p className={s["d"]} style={{ fontSize: "56px", lineHeight: "60px", color: "#0E72FB" }}>
                3
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "8px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Take a test order
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Place one yourself and watch it move through production. Then decide.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: "#FFFFFF" }}>
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
            Pricing
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            One monthly price. Commission only on gang sheet orders.
          </h2>
          <p style={{ marginTop: "16px", maxWidth: "640px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
            Prices are in USD. Every plan starts with a 14 day trial and no card.
          </p>

          <div
            style={{
              marginTop: "48px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "24px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <h3 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                Starter
              </h3>
              <p style={{ marginTop: "16px" }}>
                <span className={s["d"]} style={{ fontSize: "48px", lineHeight: "52px", color: "#0C1E35" }}>
                  $97
                </span>
                <span style={{ fontSize: "16px", color: "#5A6A7E" }}> per month</span>
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: "24px 0 0",
                  padding: "0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#0C1E35",
                }}
              >
                {PLAN_POINTS.starter.map((point) => (
                  <PlanPoint key={point}>{point}</PlanPoint>
                ))}
              </ul>
              <Link
                className={s["btn-line"]}
                href="/signup?plan=starter"
                style={{
                  marginTop: "32px",
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
                Start free trial
              </Link>
            </div>

            <div
              style={{
                position: "relative",
                background: "#FFFFFF",
                border: "2px solid #0E72FB",
                borderRadius: "12px",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 60px rgba(14,114,251,0.14)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-14px",
                  left: "32px",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  background: "#0B66E4",
                  color: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: "600",
                  lineHeight: "16px",
                }}
              >
                Most popular
              </span>
              <h3 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                Wholesale
              </h3>
              <p style={{ marginTop: "16px" }}>
                <span className={s["d"]} style={{ fontSize: "48px", lineHeight: "52px", color: "#0C1E35" }}>
                  $297
                </span>
                <span style={{ fontSize: "16px", color: "#5A6A7E" }}> per month</span>
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: "24px 0 0",
                  padding: "0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#0C1E35",
                }}
              >
                {PLAN_POINTS.wholesale.map((point) => (
                  <PlanPoint key={point}>{point}</PlanPoint>
                ))}
              </ul>
              <Link
                className={s["btn-primary"]}
                href="/signup?plan=wholesale"
                style={{
                  marginTop: "32px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "48px",
                  padding: "0 24px",
                  borderRadius: "8px",
                  background: "#0B66E4",
                  color: "#FFFFFF",
                  fontSize: "15px",
                  fontWeight: "600",
                }}
              >
                Start free trial
              </Link>
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <h3 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                Scale
              </h3>
              <p style={{ marginTop: "16px" }}>
                <span className={s["d"]} style={{ fontSize: "48px", lineHeight: "52px", color: "#0C1E35" }}>
                  $497
                </span>
                <span style={{ fontSize: "16px", color: "#5A6A7E" }}> per month</span>
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: "24px 0 0",
                  padding: "0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#0C1E35",
                }}
              >
                {PLAN_POINTS.scale.map((point) => (
                  <PlanPoint key={point}>{point}</PlanPoint>
                ))}
              </ul>
              <Link
                className={s["btn-line"]}
                href="/signup?plan=scale"
                style={{
                  marginTop: "32px",
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
                Start free trial
              </Link>
            </div>
          </div>
          <p style={{ marginTop: "24px", fontSize: "15px", color: "#3A4A5E" }}>
            <Link href="/pricing#compare" style={{ fontWeight: "600", color: "#0B66E4" }}>
              Compare all plans
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background: "#F6F8FB" }}>
        <div className={s["sec"]} style={{ maxWidth: "840px", margin: "0 auto", padding: "96px 32px" }}>
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
            Questions
          </p>
          <h2 className={s["d"]} style={{ marginTop: "12px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}>
            Before you start.
          </h2>
          <div
            style={{
              marginTop: "40px",
              background: "#FFFFFF",
              border: "1px solid #E3E8EF",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {faqs.map((f, fi) => (
              <Fragment key={fi}>
                <div style={{ borderBottom: "1px solid #E3E8EF" }}>
                  <button
                    type="button"
                    onClick={f.toggle}
                    aria-expanded={f.open}
                    style={{
                      width: "100%",
                      minHeight: "64px",
                      padding: "16px 24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      background: "#FFFFFF",
                      border: "0",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "'Inter',system-ui,sans-serif",
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#0C1E35",
                    }}
                  >
                    <span>{f.q}</span>
                    <span className={s["d"]} style={{ flex: "none", fontSize: "24px", color: "#0B66E4" }}>
                      {f.sign}
                    </span>
                  </button>
                  {f.open && (
                    <>
                      <p style={{ padding: "0 24px 20px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                        {f.a}
                      </p>
                    </>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="trial" style={{ position: "relative", overflow: "hidden", background: "#0C1E35", color: "#FFFFFF" }}>
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
            Start your 14 day trial.
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
            No card needed. Bring your own products and see how it feels before you decide.
          </p>
          {/* Goes on to sign-up, carrying the address along as ?email=. */}
          <form
            action="/signup"
            method="get"
            style={{
              margin: "36px auto 0",
              maxWidth: "560px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "center",
            }}
          >
            <label
              htmlFor="trial-email"
              style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)" }}
            >
              Work email
            </label>
            <input
              id="trial-email"
              name="email"
              type="email"
              placeholder="Work email"
              style={{
                flex: "1 1 280px",
                boxSizing: "border-box",
                minHeight: "56px",
                padding: "0 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,.28)",
                background: "rgba(255,255,255,.06)",
                color: "#FFFFFF",
                fontSize: "16px",
                fontFamily: "'Inter',system-ui,sans-serif",
              }}
            />
            <button
              type="submit"
              className={s["btn-primary"]}
              style={{
                flex: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "56px",
                padding: "0 28px",
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
              Start free trial
            </button>
          </form>
          <p style={{ marginTop: "20px", fontSize: "15px", color: "rgba(255,255,255,.78)" }}>
            Want to see it with someone first?{" "}
            <Link href="/demo" style={{ fontWeight: "600", color: "#FFFFFF", textDecoration: "underline" }}>
              Book a demo
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
