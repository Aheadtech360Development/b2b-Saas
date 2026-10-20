"use client";

/**
 * printcopilot.co/affiliate — the design's Partners page, connected to the
 * partner program itself: the form is the program's application (the same one
 * /partners takes, reviewed in the platform console's Affiliates tab), with the
 * program's current terms to accept; a partner already in signs in at
 * /partners/login.
 */
import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import s from "../marketing.module.css";
import { useEarningsCalculator } from "../interactive";
import { papi } from "@/lib/partnerApi";
import type { ProgramInfo } from "@/components/partners/AuthFrame";

type Applied = "waiting" | "info_requested" | "approved";
type Program = ProgramInfo & { application_response_days?: number };

/** The program as it stands: whether it takes applications, and its terms. */
function useProgramInfo(): Program | null {
  const [info, setInfo] = useState<Program | null>(null);
  useEffect(() => {
    papi<Program>("/partners/program", { auth: false }).then(setInfo).catch(() => setInfo(null));
  }, []);
  return info;
}

export default function PartnersPage() {
  const { shopsLabel, shopsValue, onShops, planBtns, perShop, planName, monthly, yearly } = useEarningsCalculator();
  const program = useProgramInfo();
  const open = Boolean(program?.accepting_applications && program.terms);
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const done = applied !== null;
  const notDone = !done;
  const days = program?.application_response_days;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending || !program?.terms) return;
    const f: Record<string, string> = {};
    new FormData(e.currentTarget).forEach((v, k) => { f[k] = String(v).trim(); });
    setSending(true);
    setError(null);
    try {
      const r = await papi<{ status: Applied }>("/partners/apply", {
        auth: false,
        body: {
          name: f.name,
          email: f.email,
          website: f.site || null,
          business_name: null,
          // How they would refer shops (the design's question) and how they
          // will share it (the program's), as one answer for the review.
          promote_how: [f.how, f.promote].filter(Boolean).join(". "),
          audience_size: null,
          company: f.company_hp || null,
          terms_version: program.terms.version,
          accept_terms: agree,
        },
      });
      setApplied(r.status);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message
        : "We could not send that. Please try again, or email support@printcopilot.co.");
    } finally {
      setSending(false);
    }
  }

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
            Affiliate and Partners
          </div>
          <h1
            className={`${s["d"]} ${s["hero-h1"]}`}
            style={{ margin: "24px auto 0", maxWidth: "860px", fontSize: "56px", lineHeight: "60px", color: "#FFFFFF" }}
          >
            Earn 20% for every shop you refer.
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
            Share your link. When a shop you referred subscribes to PrintCoPilot, you earn every month they stay.
          </p>
          <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px" }}>
            {/* Open when the program takes applications (Platform console, Affiliates, settings). */}
            {open ? (
              <a
                href="#apply"
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
                  textDecoration: "none",
                }}
              >
                Apply to join
              </a>
            ) : (
              <span
                aria-disabled="true"
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
                  cursor: "default",
                }}
              >
                Coming Soon
              </span>
            )}
            <a
              className={s["btn-ghost"]}
              href="#earn"
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
              Try the earnings calculator
            </a>
          </div>
          <p style={{ marginTop: "18px", fontSize: "15px", color: "rgba(255,255,255,.78)" }}>
            Already a partner?{" "}
            <Link href="/partners/login" style={{ color: "#FFFFFF", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
          <div
            aria-hidden="true"
            style={{
              margin: "56px auto 0",
              maxWidth: "760px",
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              justifyContent: "center",
              textAlign: "left",
            }}
          >
            <div
              style={{
                flex: "1 1 340px",
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: "16px",
                padding: "20px",
                color: "#FFFFFF",
              }}
            >
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>Your referral link</p>
              <div
                style={{
                  marginTop: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.14)",
                }}
              >
                <span style={{ fontSize: "14px", color: "#FFFFFF" }}>printcopilot.co/ref/your-name</span>
                <span
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    background: "#0B66E4",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Copy
                </span>
              </div>
            </div>
            <div
              style={{
                flex: "1 1 220px",
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: "16px",
                padding: "20px",
                color: "#FFFFFF",
              }}
            >
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>Example month</p>
              <p
                className={s["d"]}
                style={{ marginTop: "6px", fontSize: "36px", lineHeight: "40px", color: "#FFFFFF" }}
              >
                $59.40
              </p>
              <p style={{ marginTop: "4px", fontSize: "13px", color: "rgba(255,255,255,.72)" }}>
                1 Wholesale shop at 20%
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
            How it works
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Three steps to your first commission.
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
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M4 21a8 8 0 0 1 16 0"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  1. Apply
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  Tell us how you would refer shops. We review and approve you.
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
                  <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"></path>
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  2. Share your link
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  Your link tracks every shop you send, automatically.
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
                  <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                  <path d="M2 10h20"></path>
                </svg>
              </span>
              <div>
                <h3 className={s["d"]} style={{ fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}>
                  3. Get paid monthly
                </h3>
                <p style={{ marginTop: "6px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                  Commission is paid one month after the shop pays.
                </p>
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
            The terms, in plain words
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Simple, and it keeps paying.
          </h2>
          <div
            style={{
              marginTop: "40px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
              gap: "24px",
            }}
          >
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <p className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0B66E4" }}>
                20%
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "12px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Commission
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                You earn 20% of the plan price your referred shop pays.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <p className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0B66E4" }}>
                Recurring
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "12px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                For the life of the shop
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                You keep earning for as long as the shop you referred stays subscribed.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <p className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0B66E4" }}>
                Base plan
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "12px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Price only
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Commission is on the monthly plan price. It does not include the Gang Sheet commission.
              </p>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: "12px", padding: "28px" }}>
              <p className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0B66E4" }}>
                1 month
              </p>
              <h3
                className={s["d"]}
                style={{ marginTop: "12px", fontSize: "20px", lineHeight: "26px", color: "#0C1E35" }}
              >
                Paid in arrears
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                October commission is paid when the November subscription arrives.
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
            Earnings calculator
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            See what referrals could earn.
          </h2>
          <div style={{ marginTop: "40px" }}>
            <div
              id="earn"
              style={{
                background: "#F6F8FB",
                border: "1px solid #E3E8EF",
                borderRadius: "16px",
                padding: "40px",
                display: "flex",
                flexWrap: "wrap",
                gap: "40px",
              }}
            >
              <div style={{ flex: "1 1 340px", minWidth: "0" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <label htmlFor="shops" style={{ fontSize: "15px", fontWeight: "600", color: "#0C1E35" }}>
                    Shops you refer
                  </label>
                  <span className={s["d"]} style={{ fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}>
                    {shopsLabel}
                  </span>
                </div>
                <input
                  id="shops"
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={shopsValue}
                  onChange={onShops}
                  style={{ marginTop: "16px", width: "100%", height: "44px", accentColor: "#0B66E4" }}
                />
                <p style={{ marginTop: "28px", fontSize: "15px", fontWeight: "600", color: "#0C1E35" }}>
                  Plan they choose
                </p>
                <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {planBtns.map((b, bi) => (
                    <Fragment key={bi}>
                      <button type="button" onClick={b.pick} aria-pressed={b.pressed} style={b.style}>
                        {b.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
              <div
                style={{
                  flex: "1.1 1 380px",
                  minWidth: "0",
                  background: "#0C1E35",
                  borderRadius: "12px",
                  padding: "32px",
                  color: "#FFFFFF",
                }}
              >
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,.72)" }}>You earn per shop</p>
                <p
                  className={s["d"]}
                  style={{ marginTop: "4px", fontSize: "28px", lineHeight: "34px", color: "#FFFFFF" }}
                >
                  {perShop} a month
                </p>
                <p style={{ marginTop: "20px", fontSize: "13px", color: "rgba(255,255,255,.72)" }}>
                  Your monthly earnings on {planName}
                </p>
                <p
                  className={s["d"]}
                  style={{ marginTop: "4px", fontSize: "48px", lineHeight: "52px", color: "#FFFFFF" }}
                >
                  {monthly}
                </p>
                <p style={{ marginTop: "12px", fontSize: "15px", color: "rgba(255,255,255,.78)" }}>
                  That is {yearly} a year while they stay.
                </p>
                <p style={{ marginTop: "20px", fontSize: "13px", lineHeight: "18px", color: "rgba(255,255,255,.72)" }}>
                  Example only. Based on 20% of the monthly plan price.
                </p>
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
            Who it is for
          </p>
          <h2
            className={s["d"]}
            style={{ marginTop: "12px", maxWidth: "760px", fontSize: "40px", lineHeight: "44px", color: "#0C1E35" }}
          >
            Anyone who knows a print business.
          </h2>
          <div
            style={{
              marginTop: "40px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
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
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M4 21a8 8 0 0 1 16 0"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                Existing customers
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Already using PrintCoPilot? Refer other shops you know.
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
                  <circle cx="9" cy="8" r="3.5"></circle>
                  <path d="M2 20a7 7 0 0 1 14 0"></path>
                  <path d="M17 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                Agencies and consultants
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Recommend a platform to the print and apparel brands you advise.
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </span>
              <h3
                className={s["d"]}
                style={{ marginTop: "16px", fontSize: "22px", lineHeight: "28px", color: "#0C1E35" }}
              >
                Creators and communities
              </h3>
              <p style={{ marginTop: "8px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                Share it with an audience of print and apparel owners.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section id="apply" style={{ position: "relative", overflow: "hidden", background: "#0C1E35" }}>
        <div
          className={s["grid-bg"]}
          style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
        ></div>
        <div
          style={{
            position: "absolute",
            right: "-200px",
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
            padding: "96px 32px",
            display: "flex",
            flexWrap: "wrap",
            gap: "56px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "1 1 380px", minWidth: "0", color: "#FFFFFF" }}>
            <p
              style={{
                fontSize: "12px",
                lineHeight: "16px",
                fontWeight: "600",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.78)",
              }}
            >
              Join the program
            </p>
            <h2
              className={s["d"]}
              style={{ marginTop: "12px", fontSize: "40px", lineHeight: "44px", color: "#FFFFFF" }}
            >
              Start earning from shops you already know.
            </h2>
            <p style={{ marginTop: "16px", fontSize: "18px", lineHeight: "28px", color: "rgba(255,255,255,.78)" }}>
              Apply in a minute. We review every application and email you a decision.
            </p>
          </div>
          <div style={{ flex: "1 1 440px", minWidth: "0" }}>
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
              {notDone && !open && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                    {program ? "Applications are closed right now" : "Apply to join"}
                  </h2>
                  <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                    {program ? "We are not taking applications right now. Please check back soon." : "Loading the program…"}
                  </p>
                </div>
              )}
              {notDone && open && (
                <form onSubmit={submit}>
                  <h2 className={s["d"]} style={{ fontSize: "24px", lineHeight: "30px", color: "#0C1E35" }}>
                    Apply to join
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
                          <label htmlFor="a-name" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Full name
                          </label>
                          <input
                            id="a-name"
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
                          <label htmlFor="a-email" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Email
                          </label>
                          <input
                            id="a-email"
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
                        <label htmlFor="a-site" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          Website or social profile
                        </label>
                        <input
                          id="a-site"
                          name="site"
                          type="text"
                          placeholder="https://"
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
                        <label htmlFor="a-how" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          How would you refer shops?
                        </label>
                        <select
                          id="a-how"
                          name="how"
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
                          <option>I am a PrintCoPilot customer</option>
                          <option>Agency or consultant</option>
                          <option>Creator or community</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label htmlFor="a-promote" style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                          How will you share PrintCoPilot?
                        </label>
                        <textarea
                          id="a-promote"
                          name="promote"
                          required
                          minLength={10}
                          maxLength={1800}
                          rows={3}
                          placeholder="Your newsletter, channel, clients, events"
                          style={{ ...{
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
                          }, minHeight: "96px", padding: "12px", resize: "vertical" }}
                        />
                      </div>
                      {/* Left empty by people; a form-filling bot fills it. */}
                      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>
                        <label htmlFor="a-company-hp">Company</label>
                        <input id="a-company-hp" name="company_hp" tabIndex={-1} autoComplete="off" />
                      </div>
                      {program?.terms && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "600", color: "#0C1E35" }}>
                            Partner terms, version {program.terms.version}
                          </span>
                          <div
                            style={{
                              maxHeight: "160px",
                              overflowY: "auto",
                              border: "1px solid #E3E8EF",
                              borderRadius: "8px",
                              padding: "12px 14px",
                              fontSize: "13px",
                              lineHeight: "19px",
                              color: "#3A4A5E",
                            }}
                          >
                            {program.terms.clauses.map((c, i) => (
                              <p key={i} style={{ margin: "0 0 8px" }}>
                                <b style={{ color: "#0C1E35" }}>{i + 1}. {c.title}.</b> {c.text}
                              </p>
                            ))}
                          </div>
                          <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "14px", lineHeight: "20px", color: "#0C1E35", cursor: "pointer" }}>
                            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: "3px" }} />
                            I have read and accept the partner terms, version {program.terms.version}.
                          </label>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={sending || !agree}
                        style={{
                          width: "100%",
                          minHeight: "56px",
                          border: "0",
                          borderRadius: "8px",
                          background: "#0B66E4",
                          color: "#FFFFFF",
                          fontSize: "17px",
                          fontWeight: "600",
                          cursor: sending || !agree ? "not-allowed" : "pointer",
                          opacity: sending || !agree ? 0.6 : 1,
                          fontFamily: "'Inter',system-ui,sans-serif",
                        }}
                      >
                        {sending ? "Sending…" : "Apply to join"}
                      </button>
                      {error && (
                        <p
                          role="alert"
                          style={{ fontSize: "14px", lineHeight: "20px", color: "#B42318", textAlign: "center" }}
                        >
                          {error}
                        </p>
                      )}
                      <p style={{ fontSize: "14px", lineHeight: "20px", color: "#5A6A7E", textAlign: "center", margin: "0" }}>
                        Already a partner?{" "}
                        <Link href="/partners/login" style={{ color: "#0B66E4", fontWeight: 600 }}>
                          Sign in
                        </Link>
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
                      {applied === "approved" ? "You are in." : "Application received."}
                    </h2>
                    <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: "24px", color: "#3A4A5E" }}>
                      {applied === "approved"
                        ? "Check your email for the link that sets your password."
                        : `We read every application ourselves${days ? ` and usually answer within ${days} working ${days === 1 ? "day" : "days"}` : ""}.`}
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
