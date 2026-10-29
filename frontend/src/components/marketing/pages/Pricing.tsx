"use client";

/** printcopilot.co/pricing — the design's Pricing page. With the Retail
 *  launch switch on (lib/retailLaunch) it has two tabs: Print and wholesale
 *  (the default, everything below) and Retail brands (RetailPricing, opened
 *  by ?tab=retail). */
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import s from "../marketing.module.css";
import { useFaq, useSavingsCalculator } from "../interactive";
import { RETAIL_LAUNCHED } from "@/lib/retailLaunch";
import RetailPricing from "./RetailPricing";

type Cell = string | boolean;

/** Every feature, plan by plan: a group heading, or a row of Starter / Wholesale / Scale. */
const SPEC: ([string] | [string, Cell, Cell, Cell])[] = [
  ["Limits and pricing"],
  ["Monthly price", "$97", "$297", "$497"],
  ["Orders", "300", "1,500", "Unlimited"],
  ["Staff accounts", "3", "10", "Unlimited"],
  ["Commission on Gang Sheet orders", "2.8%", "1.9%", "1.3%"],
  ["Free trial, no card", "14 days", "14 days", "14 days"],
  ["Storefront and website"],
  ["Branded storefront", true, true, true],
  ["Theme editor and website builder", true, true, true],
  ["SEO settings for pages and products", true, true, true],
  ["Live chat", true, true, true],
  ["Cart, checkout and buyer sign in", true, true, true],
  ["Gang Sheet Builder"],
  ["Gang Sheet Builder", true, true, true],
  ["Upload a print ready file", true, true, true],
  ["Transfers by size", true, true, true],
  ["Wholesale"],
  ["Buyer portal", "Default", "Wholesale", "Wholesale"],
  ["Buyer account approval", false, true, true],
  ["Pricing tiers", false, true, true],
  ["Net terms", false, true, true],
  ["Quick Buy", false, true, true],
  ["Matrix ordering grid", false, true, true],
  ["Orders and customers"],
  ["Orders and production tracking", true, true, true],
  ["Customers and segments", true, true, true],
  ["Reports and analytics", true, true, true],
  ["Suppliers and payments"],
  ["S&S Activewear catalog", true, true, true],
  ["SanMar catalog", true, true, true],
  ["Payments with Stripe Connect", true, true, true],
  ["AI and mobile"],
  ["AI analytics agent", true, true, true],
  ["Mobile app", "Add-on", "Add-on", "Included"],
];

function cellOf(v: Cell, mid: boolean): { yes: boolean; text: string; style: CSSProperties } {
  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    fontSize: "14px",
    lineHeight: "20px",
    background: mid ? "rgba(14,114,251,.05)" : undefined,
  };
  if (v === true) return { yes: true, text: "Included", style: { ...base, color: "#0E6B38", fontWeight: "600" } };
  if (v === false) return { yes: false, text: "Not included", style: { ...base, color: "#5A6A7E" } };
  return { yes: false, text: v, style: { ...base, color: "#0C1E35", fontWeight: "600" } };
}

const compareRows = SPEC.map((r) => {
  if (r.length === 1) return { isGroup: true, isRow: false, name: r[0] };
  const a = cellOf(r[1], false),
    b = cellOf(r[2], true),
    c = cellOf(r[3], false);
  return {
    isGroup: false,
    isRow: true,
    label: r[0],
    aYes: a.yes,
    aText: a.text,
    aStyle: a.style,
    bYes: b.yes,
    bText: b.text,
    bStyle: b.style,
    cYes: c.yes,
    cText: c.text,
    cStyle: c.style,
  };
});

const FAQ = [
  { q: "Do I need a card to start?", a: "No. The trial lasts 14 days and does not ask for a card." },
  {
    q: "What does the commission cover?",
    a: "Only orders placed through the Gang Sheet Builder. Your plan sets the rate: 2.8%, 1.9% or 1.3%. Other orders carry no PrintCoPilot commission.",
  },
  {
    q: "Which plan do I need to sell wholesale?",
    a: "Wholesale or Scale. Account approval, pricing tiers, net terms, Quick Buy and the matrix ordering grid start on the Wholesale plan.",
  },
  { q: "Is the mobile app included?", a: "It is included on Scale. On Starter and Wholesale it is an add-on." },
  {
    q: "Can I talk to someone before I start?",
    a: "Yes. Book a demo and we will walk through your setup and pick a plan with you.",
  },
];

type Audience = "print" | "retail";

export default function PricingPage() {
  const [tab, setTab] = useState<Audience>("print");
  // ?tab=retail opens the Retail brands tab (the /retail page and the home
  // page link to it). Read after the first draw, so it matches the server's.
  useEffect(() => {
    if (RETAIL_LAUNCHED && new URLSearchParams(window.location.search).get("tab") === "retail") setTab("retail");
  }, []);
  if (!RETAIL_LAUNCHED) return <PrintPricing />;

  function choose(next: Audience) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "retail") url.searchParams.set("tab", "retail"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }
  return (
    <>
      <div style={{ background: "#0C1E35", display: "flex", justifyContent: "center", padding: "28px 16px 0" }}>
        <div role="tablist" aria-label="Plans for" style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "14px", padding: "5px", gap: "4px" }}>
          {([["print", "Print and wholesale"], ["retail", "Retail brands"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} data-audience={key} onClick={() => choose(key)}
              style={{ padding: "12px 22px", borderRadius: "10px", fontWeight: 600, fontSize: "15px", border: "none", cursor: "pointer",
                       fontFamily: "'Inter',system-ui,sans-serif", color: tab === key ? "#0C1E35" : "#C8D6EA",
                       background: tab === key ? "#FFFFFF" : "transparent" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "retail" ? <RetailPricing /> : <PrintPricing />}
    </>
  );
}

function PrintPricing() {
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
            padding: "80px 32px 168px",
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
            Pricing
          </div>
          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "24px auto 0", maxWidth: "860px", fontSize: "56px", lineHeight: "60px", color: "#FFFFFF" }}
          >
            One monthly price. <span style={{ color: "#0E72FB" }}>Commission only on gang sheet orders.</span>
          </h1>
          <p
            style={{
              margin: "20px auto 0",
              maxWidth: "620px",
              fontSize: "18px",
              lineHeight: "28px",
              color: "rgba(255,255,255,.78)",
            }}
          >
            Pick a plan by how many orders you run and who you sell to. Every plan starts with 14 days free and no card.
            Prices are in USD.
          </p>
        </div>
      </section>

      {/* PLANS */}
      <section style={{ background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              position: "relative",
              marginTop: "-104px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
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
                boxShadow: "0 24px 60px rgba(12,30,53,0.12)",
              }}
            >
              <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                Starter
              </h2>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#5A6A7E" }}>
                For shops starting to sell online.
              </p>
              <p style={{ marginTop: "20px" }}>
                <span className={s["d"]} style={{ fontSize: "52px", lineHeight: "56px", color: "#0C1E35" }}>
                  $97
                </span>
                <span style={{ fontSize: "16px", color: "#5A6A7E" }}> per month</span>
              </p>
              <Link
                className={s["btn-line"]}
                href="/signup?plan=starter"
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
                Start free trial
              </Link>
              <ul
                style={{
                  listStyle: "none",
                  margin: "28px 0 0",
                  padding: "24px 0 0",
                  borderTop: "1px solid #E3E8EF",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#0C1E35",
                }}
              >
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
                  300 orders
                </li>
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
                  3 staff accounts
                </li>
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
                  2.8% commission on Gang Sheet orders
                </li>
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
                  Default buyer portal
                </li>
              </ul>
            </div>

            <div
              style={{
                position: "relative",
                background: "#0C1E35",
                border: "2px solid #0E72FB",
                borderRadius: "12px",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 70px rgba(14,114,251,0.28)",
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
              <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#FFFFFF" }}>
                Wholesale
              </h2>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "rgba(255,255,255,.78)" }}>
                For shops selling to repeat and trade buyers.
              </p>
              <p style={{ marginTop: "20px" }}>
                <span className={s["d"]} style={{ fontSize: "52px", lineHeight: "56px", color: "#FFFFFF" }}>
                  $297
                </span>
                <span style={{ fontSize: "16px", color: "rgba(255,255,255,.78)" }}> per month</span>
              </p>
              <Link
                className={s["btn-primary"]}
                href="/signup?plan=wholesale"
                style={{
                  marginTop: "24px",
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
              <ul
                style={{
                  listStyle: "none",
                  margin: "28px 0 0",
                  padding: "24px 0 0",
                  borderTop: "1px solid rgba(255,255,255,.16)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#FFFFFF",
                }}
              >
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  1,500 orders
                </li>
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  10 staff accounts
                </li>
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  1.9% commission on Gang Sheet orders
                </li>
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  Wholesale buyer portal
                </li>
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  Account approval, pricing tiers and net terms
                </li>
                <li style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      marginTop: "1px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      background: "rgba(14,114,251,.4)",
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
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </span>
                  Quick Buy and matrix ordering grid
                </li>
              </ul>
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E3E8EF",
                borderRadius: "12px",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 60px rgba(12,30,53,0.12)",
              }}
            >
              <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                Scale
              </h2>
              <p style={{ marginTop: "6px", fontSize: "15px", lineHeight: "22px", color: "#5A6A7E" }}>
                For high volume shops that want the lowest rate.
              </p>
              <p style={{ marginTop: "20px" }}>
                <span className={s["d"]} style={{ fontSize: "52px", lineHeight: "56px", color: "#0C1E35" }}>
                  $497
                </span>
                <span style={{ fontSize: "16px", color: "#5A6A7E" }}> per month</span>
              </p>
              <Link
                className={s["btn-line"]}
                href="/signup?plan=scale"
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
                Start free trial
              </Link>
              <ul
                style={{
                  listStyle: "none",
                  margin: "28px 0 0",
                  padding: "24px 0 0",
                  borderTop: "1px solid #E3E8EF",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  fontSize: "15px",
                  lineHeight: "22px",
                  color: "#0C1E35",
                }}
              >
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
                  Unlimited orders
                </li>
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
                  Unlimited staff accounts
                </li>
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
                  1.3% commission on Gang Sheet orders
                </li>
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
                  Mobile app included
                </li>
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
                  Everything in Wholesale
                </li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: "32px",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "12px 32px",
              fontSize: "14px",
              color: "#3A4A5E",
            }}
          >
            <span>14 day trial on every plan</span>
            <span>No card to start</span>
            <span>Prices in USD</span>
            <span>Commission only on Gang Sheet orders</span>
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <section id="calc" style={{ background: "#FFFFFF" }}>
        <div className={s["sec"]} style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 32px 0" }}>
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
            Work out your plan in ten seconds.
          </h2>
          <p style={{ marginTop: "16px", maxWidth: "640px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
            Set your monthly gang sheet sales. We show the cheapest plan, and if your current app is cheaper at that
            volume, we say so.
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

      {/* COMPARE */}
      <section id="compare" style={{ background: "#FFFFFF" }}>
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
            Compare plans
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Every feature, plan by plan.
          </h2>
          <p style={{ marginTop: "16px", maxWidth: "640px", fontSize: "18px", lineHeight: "28px", color: "#3A4A5E" }}>
            See exactly what you get on each plan before you start. Scroll sideways on a small screen.
          </p>

          <div style={{ marginTop: "40px", border: "1px solid #E3E8EF", borderRadius: "12px", overflowX: "auto" }}>
            <div style={{ minWidth: "780px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.8fr 1fr 1fr 1fr",
                  alignItems: "end",
                  background: "#FFFFFF",
                }}
              >
                <div style={{ padding: "24px" }}></div>
                <div style={{ padding: "24px 16px" }}>
                  <p className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                    Starter
                  </p>
                  <p style={{ marginTop: "4px", fontSize: "14px", color: "#5A6A7E" }}>$97 per month</p>
                  <Link
                    className={s["btn-line"]}
                    href="/signup?plan=starter"
                    style={{
                      marginTop: "14px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "40px",
                      padding: "0 16px",
                      borderRadius: "8px",
                      border: "1px solid #D5DCE6",
                      background: "#FFFFFF",
                      color: "#0C1E35",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Start free trial
                  </Link>
                </div>
                <div style={{ padding: "24px 16px", background: "rgba(14,114,251,.05)" }}>
                  <p className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0A4FB3" }}>
                    Wholesale
                  </p>
                  <p style={{ marginTop: "4px", fontSize: "14px", color: "#5A6A7E" }}>$297 per month</p>
                  <Link
                    className={s["btn-primary"]}
                    href="/signup?plan=wholesale"
                    style={{
                      marginTop: "14px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "40px",
                      padding: "0 16px",
                      borderRadius: "8px",
                      background: "#0B66E4",
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Start free trial
                  </Link>
                </div>
                <div style={{ padding: "24px 16px" }}>
                  <p className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                    Scale
                  </p>
                  <p style={{ marginTop: "4px", fontSize: "14px", color: "#5A6A7E" }}>$497 per month</p>
                  <Link
                    className={s["btn-line"]}
                    href="/signup?plan=scale"
                    style={{
                      marginTop: "14px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "40px",
                      padding: "0 16px",
                      borderRadius: "8px",
                      border: "1px solid #D5DCE6",
                      background: "#FFFFFF",
                      color: "#0C1E35",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Start free trial
                  </Link>
                </div>
              </div>

              {compareRows.map((row, rowi) => (
                <Fragment key={rowi}>
                  {row.isGroup && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.8fr 1fr 1fr 1fr",
                          alignItems: "center",
                          minHeight: "48px",
                          background: "#F6F8FB",
                          borderTop: "1px solid #E3E8EF",
                          borderBottom: "1px solid #E3E8EF",
                        }}
                      >
                        <span className={s["d"]} style={{ padding: "0 24px", fontSize: "16px", color: "#0C1E35" }}>
                          {row.name}
                        </span>
                        <span style={{ padding: "0 16px", fontSize: "13px", fontWeight: "600", color: "#5A6A7E" }}>
                          Starter
                        </span>
                        <span style={{ padding: "0 16px", fontSize: "13px", fontWeight: "600", color: "#0A4FB3" }}>
                          Wholesale
                        </span>
                        <span style={{ padding: "0 16px", fontSize: "13px", fontWeight: "600", color: "#5A6A7E" }}>
                          Scale
                        </span>
                      </div>
                    </>
                  )}
                  {row.isRow && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.8fr 1fr 1fr 1fr",
                          alignItems: "stretch",
                          borderBottom: "1px solid #E3E8EF",
                          background: "#FFFFFF",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "12px 24px",
                            fontSize: "15px",
                            lineHeight: "22px",
                            color: "#0C1E35",
                          }}
                        >
                          {row.label}
                        </span>
                        <span style={row.aStyle}>
                          {row.aYes && (
                            <>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5"></path>
                              </svg>
                            </>
                          )}
                          {row.aText}
                        </span>
                        <span style={row.bStyle}>
                          {row.bYes && (
                            <>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5"></path>
                              </svg>
                            </>
                          )}
                          {row.bText}
                        </span>
                        <span style={row.cStyle}>
                          {row.cYes && (
                            <>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5"></path>
                              </svg>
                            </>
                          )}
                          {row.cText}
                        </span>
                      </div>
                    </>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
          <p style={{ marginTop: "20px", fontSize: "15px", color: "#3A4A5E" }}>
            Not sure which plan fits?{" "}
            <Link href="/demo" style={{ fontWeight: "600", color: "#0B66E4" }}>
              Book a demo
            </Link>{" "}
            and we will pick it with you.
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
            Pricing questions
          </p>
          <h2 className={s["d"]} style={{ marginTop: "12px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}>
            Before you pick a plan.
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
            Start free. Pick a plan when you are sure.
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
            14 days, no card. Set up your store and place a test order before you decide.
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
            Want to talk it through first?{" "}
            <Link href="/demo" style={{ fontWeight: "600", color: "#FFFFFF", textDecoration: "underline" }}>
              Book a demo
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
