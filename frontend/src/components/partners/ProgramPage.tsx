"use client";

/**
 * The program's public page and its application form. Not one of the
 * designs: it is drawn in their style, and asks for what the super admin's
 * application screen shows (name, email, business, website, how they
 * promote, audience, the terms).
 */
import Link from "next/link";
import { useState } from "react";

import { useProgram, type ProgramInfo } from "./AuthFrame";
import { Banner, Field, Icon, ROOT, Skeleton, errorText } from "./ui";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import { money, moneyShort, papi } from "@/lib/partnerApi";

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** 2 -> "two working days", the way the promise has always been worded (as in the email). */
function workingDays(n: number): string {
  return `${NUMBER_WORDS[n] ?? n} working day${n === 1 ? "" : "s"}`;
}

export function ProgramPage() {
  // The program's own numbers: how long a shop earns, how soon applications are answered.
  const program = useProgram() as (ProgramInfo & { earning_months?: number; application_response_days?: number }) | null;
  const days = program?.application_response_days;
  const months = program?.earning_months ?? 0;
  // Said once the numbers are in: nothing here may promise more than the program gives.
  const lasting = !program ? ""
    : months ? `, for ${months} month${months === 1 ? "" : "s"} from the day it signs up, while it stays on a paid plan`
      : ", for as long as it stays on a paid plan";
  const [form, setForm] = useState({ name: "", email: "", business_name: "", website: "", promote_how: "", audience_size: "", company: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"waiting" | "approved" | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(ev: React.FormEvent) {
    ev.preventDefault();
    if (!program?.terms) return;
    setBusy(true); setError(null);
    try {
      const r = await papi<{ status: "waiting" | "approved" }>("/partners/apply", {
        auth: false,
        body: { ...form, business_name: form.business_name || null, website: form.website || null,
                audience_size: form.audience_size || null, company: form.company || null,
                terms_version: program.terms.version, accept_terms: agree },
      });
      setSent(r.status);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className={ROOT} style={{ minHeight: "100vh" }}>
      <header className="top" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, font: "600 18px var(--pcp-display), Inter, sans-serif", color: "var(--ink)" }}>
          <PlatformLogo /><span className="muted" style={{ fontWeight: 500 }}>Partners</span>
        </span>
        <Link className="btn sm" href="/partners/login">Partner sign in</Link>
      </header>
      <main className="content" style={{ margin: "0 auto" }}>
        <section className="card" style={{ background: "var(--navy-900)", borderColor: "var(--navy-900)" }}>
          <div className="pad col" style={{ gap: 14, padding: "40px 32px" }}>
            <span className="eyebrow" style={{ color: "#8FA3BD" }}>Partner program</span>
            <h1 style={{ color: "#fff", fontSize: 34, lineHeight: "42px", maxWidth: 640 }}>
              Bring print shops to PrintCoPilot. Earn every month they stay{months ? `, for up to ${months} month${months === 1 ? "" : "s"}` : ""}.
            </h1>
            <p style={{ color: "#C9D5E6", maxWidth: 640 }}>
              {program?.standard_rate
                ? `Earn ${program.standard_rate} of a shop's plan fee on every paid invoice${lasting}.`
                : `Earn a share of a shop's plan fee on every paid invoice${lasting}.`}
            </p>
            <div><a className="btn pri" href="#apply">Apply now</a></div>
          </div>
        </section>

        <div className="g3">
          {[["send", "Apply", `Tell us how you would share PrintCoPilot.${days ? ` We answer within ${workingDays(days)}.` : ""}`],
            ["link", "Share your link", "Your own link, code, captions, banners and a QR code, in one portal."],
            ["dollar", "Earn every month", "Commission on each paid plan invoice, paid out by PayPal or Wise."]].map(([icon, title, text]) => (
            <div className="card pad col" key={title} style={{ gap: 8 }}>
              <span style={{ color: "var(--blue-600)" }}><Icon name={icon as "send"} size="l" /></span>
              <h3>{title}</h3>
              <p className="sm muted">{text}</p>
            </div>
          ))}
        </div>

        {program && program.examples.length ? (
          <section className="card">
            <div className="card-h"><h2>What one shop earns you</h2><span className="sm muted">At the standard {program.standard_rate} rate</span></div>
            <div className="tw">
              <table className="tbl">
                <thead><tr><th>Plan</th><th className="num">Shop pays</th><th className="num">You earn, every month</th></tr></thead>
                <tbody>
                  {program.examples.map((x) => (
                    <tr key={x.plan}><td className="ink">{x.name}</td><td className="num">{money(x.price_cents)}</td><td className="num b">{money(x.earns_cents)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              <span>Paid after a {program.hold_days} day hold, once you pass {moneyShort(program.minimum_payout_cents)}. A shop is saved to you for {program.cookie_days} days after it clicks your link.</span>
            </div>
          </section>
        ) : null}

        <section className="card" id="apply">
          <div className="card-h"><h2>Apply to the partner program</h2></div>
          <div className="pad">
            {!program ? (
              <div className="col">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
            ) : sent ? (
              <Banner tone="ok">
                {sent === "approved"
                  ? "You are in. Check your email for the link that sets your password."
                  : `Thanks, your application is in. We read every application ourselves${days ? ` and usually answer within ${workingDays(days)}` : ""}.`}
              </Banner>
            ) : !program.accepting_applications ? (
              <Banner tone="warn">We are not taking applications right now. Please check back later.</Banner>
            ) : (
              <form className="col" onSubmit={apply}>
                <div className="g2">
                  <Field label="Full name" htmlFor="ap-name"><input id="ap-name" className="input" autoComplete="name" required value={form.name} onChange={set("name")} /></Field>
                  <Field label="Email" htmlFor="ap-email" hint="You sign in to the portal with it.">
                    <input id="ap-email" className="input" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
                  </Field>
                  <Field label={<>Business name <span className="muted" style={{ fontWeight: 400 }}>Optional</span></>} htmlFor="ap-biz">
                    <input id="ap-biz" className="input" autoComplete="organization" value={form.business_name} onChange={set("business_name")} />
                  </Field>
                  <Field label={<>Website <span className="muted" style={{ fontWeight: 400 }}>Optional</span></>} htmlFor="ap-web">
                    <input id="ap-web" className="input" placeholder="https://" value={form.website} onChange={set("website")} />
                  </Field>
                </div>
                <Field label="How will you share PrintCoPilot?" htmlFor="ap-how" hint="Your newsletter, channel, clients, events: whatever you would use.">
                  <textarea id="ap-how" className="area" required minLength={10} value={form.promote_how} onChange={set("promote_how")} />
                </Field>
                <Field label={<>Audience size <span className="muted" style={{ fontWeight: 400 }}>Optional</span></>} htmlFor="ap-aud">
                  <input id="ap-aud" className="input" placeholder="For example, 4,000 newsletter readers" value={form.audience_size} onChange={set("audience_size")} />
                </Field>
                <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
                  <label htmlFor="ap-company">Company</label>
                  <input id="ap-company" tabIndex={-1} autoComplete="off" value={form.company} onChange={set("company")} />
                </div>
                {program.terms ? (
                  <div className="col" style={{ gap: 8 }}>
                    <span className="lbl">Partner terms, version {program.terms.version}</span>
                    <div className="card pad-s" style={{ maxHeight: 240, overflowY: "auto" }}>
                      {program.terms.clauses.map((c, i) => (
                        <p className="sm" key={i} style={{ marginBottom: 8 }}><b className="ink">{i + 1}. {c.title}.</b> {c.text}</p>
                      ))}
                    </div>
                    <label className="chk">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                      I have read and accept the partner terms, version {program.terms.version}.
                    </label>
                  </div>
                ) : null}
                {error ? <span className="errt">{error}</span> : null}
                <div>
                  <button className="btn pri" type="submit"
                          disabled={busy || !agree || !form.name.trim() || !form.email.trim() || form.promote_how.trim().length < 10}>
                    Send my application
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
        {program?.support_email ? (
          <p className="sm muted tc">Questions: <a href={`mailto:${program.support_email}`}>{program.support_email}</a></p>
        ) : null}
      </main>
    </div>
  );
}
