/**
 * The blue "What you can try" box from the design's Trial page — the points,
 * and the picture of a store with its chat open — beside the sign-up form.
 */
import Link from "next/link";
import s from "./marketing.module.css";

export default function TrialSidePanel() {
  return (
    <div
      style={{
        flex: "1 1 380px",
        minWidth: "0",
        position: "relative",
        overflow: "hidden",
        background: "#0C1E35",
        borderRadius: "16px",
        padding: "40px",
        color: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
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
          width: "600px",
          height: "400px",
          marginLeft: "-300px",
          background: "radial-gradient(closest-side,rgba(14,114,251,.32),rgba(14,114,251,0))",
          pointerEvents: "none",
        }}
      ></div>
      <div style={{ position: "relative" }}>
        <p className={s["d"]} style={{ fontSize: "28px", lineHeight: "34px", color: "#FFFFFF" }}>
          What you can try
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
            A store you can brand and publish
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
            The Gang Sheet Builder
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
            Orders and production in one list
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
            S&amp;S Activewear and SanMar catalogs
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
            Live chat and the AI copilot
          </li>
        </ul>
        <div aria-hidden="true" style={{ marginTop: "32px" }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
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
                  <div style={{ height: "12px", width: "170px", borderRadius: "6px", background: "#0C1E35" }}></div>
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
                    style={{ height: "78px", borderRadius: "8px", background: "#F6F8FB", border: "1px solid #E3E8EF" }}
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
                    style={{ height: "78px", borderRadius: "8px", background: "#F6F8FB", border: "1px solid #E3E8EF" }}
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
                    style={{ height: "78px", borderRadius: "8px", background: "#F6F8FB", border: "1px solid #E3E8EF" }}
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
        <p
          style={{
            marginTop: "28px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,.16)",
            fontSize: "15px",
            lineHeight: "22px",
            color: "rgba(255,255,255,.78)",
          }}
        >
          Want a person to show you around first?{" "}
          <Link href="/demo" style={{ fontWeight: "600", color: "#FFFFFF", textDecoration: "underline" }}>
            Book a demo
          </Link>
        </p>
      </div>
    </div>
  );
}
