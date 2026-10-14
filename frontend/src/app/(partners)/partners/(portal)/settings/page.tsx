"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePartner, type Partner } from "@/components/partners/PartnerShell";
import { Banner, Field, Icon, Modal, Switch, errorText, useToast } from "@/components/partners/ui";
import { day, initials, moneyShort, papi, setPartnerToken } from "@/lib/partnerApi";

/** What the program promises before a rate changes (rate_change_notice_days). */
function noticeWords(days: number | undefined): string {
  if (days === undefined) return "";
  return days > 0 ? `Rate changes get ${days} day${days === 1 ? "" : "s"} notice by email.`
    : "Rate changes apply from the day they are made.";
}

export default function SettingsPage() {
  const { partner, reload, signOut } = usePartner();
  // The program's numbers GET /partners/me carries with the partner.
  const deal = partner as Partner & { rate_change_notice_days?: number; w9_required_from_cents?: number };
  const router = useRouter();
  const toast = useToast();
  const ro = partner.read_only;

  const [profile, setProfile] = useState({ name: partner.name, business_name: partner.business_name ?? "", website: partner.website ?? "" });
  const [payout, setPayout] = useState({ method: (partner.payout_method === "wise" ? "wise" : "paypal") as "paypal" | "wise", account: partner.payout_account ?? "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ new_shop: !!partner.email_prefs.new_shop, commission_earned: !!partner.email_prefs.commission_earned });
  const [twoFa, setTwoFa] = useState<null | { secret: string; uri: string; code: string; backup?: string[] }>(null);
  const [offTwoFa, setOffTwoFa] = useState<null | { password: string; code: string }>(null);
  const [leaving, setLeaving] = useState<null | { reason: string }>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  async function run(key: string, work: () => Promise<void>, done: string) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: null }));
    try {
      await work();
      toast.show(done);
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: errorText(e) }));
    } finally {
      setBusy(null);
    }
  }

  const saveProfile = () => run("profile", async () => {
    await papi("/partners/me/profile", { method: "PUT", body: profile });
    await reload();
  }, "Profile saved");

  const savePayout = () => run("payout", async () => {
    await papi("/partners/me/payout", { method: "PUT", body: payout });
    await reload();
  }, "Payout details saved");

  const uploadW9 = (f: File) => run("w9", async () => {
    const form = new FormData();
    form.append("file", f);
    await papi("/partners/me/w9", { form });
    await reload();
  }, "W-9 uploaded");

  const changePassword = () => run("password", async () => {
    if (pw.next !== pw.again) throw new Error("The two new passwords are not the same.");
    const out = await papi<{ access_token: string }>("/partners/me/password", { body: { current: pw.current, new: pw.next } });
    setPartnerToken(out.access_token);
    setPw({ current: "", next: "", again: "" });
  }, "Password changed. Other sessions were signed out.");

  const savePrefs = (next: typeof prefs) => {
    setPrefs(next);
    void run("prefs", async () => { await papi("/partners/me/emails", { method: "PUT", body: next }); }, "Email preferences saved");
  };

  async function startTwoFa() {
    try {
      const r = await papi<{ secret: string; otpauth_uri: string }>("/partners/me/2fa/setup", { method: "POST" });
      setTwoFa({ secret: r.secret, uri: r.otpauth_uri, code: "" });
    } catch (e) {
      toast.show(errorText(e));
    }
  }

  async function confirmTwoFa() {
    if (!twoFa) return;
    try {
      const r = await papi<{ backup_codes: string[] }>("/partners/me/2fa/enable", { body: { code: twoFa.code } });
      setTwoFa({ ...twoFa, backup: r.backup_codes });
      await reload();
    } catch (e) {
      setErrors((x) => ({ ...x, twofa: errorText(e) }));
    }
  }

  async function disableTwoFa() {
    if (!offTwoFa) return;
    try {
      await papi("/partners/me/2fa/disable", { body: offTwoFa });
      setOffTwoFa(null);
      await reload();
      toast.show("Two step sign in is off");
    } catch (e) {
      setErrors((x) => ({ ...x, twofaoff: errorText(e) }));
    }
  }

  async function leave() {
    if (!leaving) return;
    try {
      const r = await papi<{ statement: string }>("/partners/me/leave", { body: { reason: leaving.reason } });
      setPartnerToken(null);
      router.replace(`/partners/login?left=1&statement=${encodeURIComponent(r.statement)}`);
    } catch (e) {
      setErrors((x) => ({ ...x, leave: errorText(e) }));
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Profile and settings</h1>
          <p>Your details, payout setup and sign in security.</p>
        </div>
      </div>
      {ro ? <Banner icon="eye">Viewing as the affiliate. Nothing here can be changed.</Banner> : null}

      <section className="card" id="profile">
        <div className="card-h"><h2>Profile</h2></div>
        <div className="pad col">
          <div className="row">
            <span className="av l">{initials(partner.name)}</span>
            <div>
              <div className="b ink">{partner.name}</div>
              <div className="sm muted">Partner since {day(partner.joined, true)}</div>
            </div>
          </div>
          <div className="g2">
            <Field label="Full name" htmlFor="s-name">
              <input id="s-name" className="input" value={profile.name} disabled={ro}
                     onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="s-email" hint="The email you sign in with. Write to us to change it.">
              <input id="s-email" className="input" type="email" value={partner.email} readOnly />
            </Field>
            <Field label="Business name" htmlFor="s-biz">
              <input id="s-biz" className="input" value={profile.business_name} disabled={ro}
                     onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} />
            </Field>
            <Field label="Website" htmlFor="s-web">
              <input id="s-web" className="input" value={profile.website} disabled={ro} placeholder="https://"
                     onChange={(e) => setProfile({ ...profile, website: e.target.value })} />
            </Field>
          </div>
          {errors.profile ? <span className="errt">{errors.profile}</span> : null}
          <div><button className="btn pri" disabled={ro || busy === "profile"} onClick={saveProfile}>Save profile</button></div>
        </div>
      </section>

      <section className="card" id="payout">
        <div className="card-h">
          <h2>Payout details</h2>
          {partner.has_w9 ? <span className="chip ok"><Icon name="check" size="s" />W-9 on file</span>
            : <span className="chip warn"><Icon name="alert" size="s" />W-9 missing</span>}
        </div>
        <div className="pad col">
          <div className="g2">
            <Field label="Payout method" htmlFor="s-method" hint="All partners are paid through one method at a time.">
              <select id="s-method" className="select" value={payout.method} disabled={ro}
                      onChange={(e) => setPayout({ ...payout, method: e.target.value as "paypal" | "wise" })}>
                <option value="paypal">PayPal</option>
                <option value="wise">Wise</option>
              </select>
            </Field>
            <Field label={payout.method === "wise" ? "Wise email" : "PayPal email"} htmlFor="s-account">
              <input id="s-account" className="input" type="email" value={payout.account} disabled={ro}
                     onChange={(e) => setPayout({ ...payout, account: e.target.value })} />
            </Field>
          </div>
          <div className="opt" id="w9" style={{ alignItems: "center" }}>
            <Icon name="file" />
            <div style={{ flex: 1 }}>
              <div className="b ink">{partner.w9_uploaded_at ? `W-9, uploaded ${day(partner.w9_uploaded_at, true)}` : "W-9"}</div>
              <div className="sm muted">
                {deal.w9_required_from_cents
                  ? `Needed once your payouts in a year reach ${moneyShort(deal.w9_required_from_cents)}.`
                  : "Needed before the first payout."} Stored encrypted, only visible to the PrintCoPilot team.
              </div>
            </div>
            <input ref={file} type="file" accept="application/pdf,image/png,image/jpeg" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadW9(f); e.target.value = ""; }} />
            <button className="btn sm" disabled={ro || busy === "w9"} onClick={() => file.current?.click()}>
              <Icon name="upload" size="s" />{partner.has_w9 ? "Replace" : "Upload W-9"}
            </button>
          </div>
          {errors.w9 ? <span className="errt">{errors.w9}</span> : null}
          {errors.payout ? <span className="errt">{errors.payout}</span> : null}
          <div><button className="btn pri" disabled={ro || busy === "payout"} onClick={savePayout}>Save payout details</button></div>
        </div>
      </section>

      <section className="card" id="security">
        <div className="card-h"><h2>Password and sign in</h2></div>
        <div className="pad col">
          <div className="g3">
            <Field label="Current password" htmlFor="s-cur">
              <input id="s-cur" className="input" type="password" autoComplete="current-password" value={pw.current} disabled={ro}
                     onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="s-new" hint="At least 8 characters, letters with numbers or symbols.">
              <input id="s-new" className="input" type="password" autoComplete="new-password" value={pw.next} disabled={ro}
                     onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password" htmlFor="s-again">
              <input id="s-again" className="input" type="password" autoComplete="new-password" value={pw.again} disabled={ro}
                     onChange={(e) => setPw({ ...pw, again: e.target.value })} />
            </Field>
          </div>
          {errors.password ? <span className="errt">{errors.password}</span> : null}
          <div><button className="btn" disabled={ro || busy === "password" || !pw.current || !pw.next} onClick={changePassword}>Change password</button></div>
        </div>
        <div className="setrow">
          <div className="l">
            <b>Two step sign in</b>
            <span>Ask for a code from an authenticator app when you sign in.</span>
          </div>
          <div className="r">
            <Switch label="Two step sign in" checked={partner.two_factor_enabled} disabled={ro}
                    onChange={(on) => (on ? void startTwoFa() : setOffTwoFa({ password: "", code: "" }))} />
          </div>
        </div>
      </section>

      <section className="card" id="emails">
        <div className="card-h"><h2>Email preferences</h2></div>
        {([
          ["new_shop", "New shop signed up", "When a shop starts a trial through your link or code.", false],
          ["commission_earned", "Commission earned", "When a first or monthly invoice creates a commission line.", false],
          ["payout", "Payout recorded", "When we pay you. The statement is attached.", true],
          ["terms", "Program news and terms changes", noticeWords(deal.rate_change_notice_days), true],
        ] as const).map(([key, title, text, always]) => (
          <div className="setrow" key={key}>
            <div className="l"><b>{title}</b><span>{text}</span></div>
            <div className="r">
              {always ? <span className="sm muted">Always on</span> : null}
              <Switch label={always ? `${title}, always on` : title} disabled={always || ro}
                      checked={always ? true : prefs[key as "new_shop" | "commission_earned"]}
                      onChange={(v) => savePrefs({ ...prefs, [key]: v })} />
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-h"><h2>More</h2></div>
        <div className="pad row">
          <Link className="btn sm" href="/partners/payouts"><Icon name="wallet" size="s" />Payouts and statements</Link>
          <Link className="btn sm" href="/partners/terms"><Icon name="file" size="s" />Partner terms</Link>
          {!ro ? <button className="btn sm" onClick={() => void signOut()}><Icon name="logout" size="s" />Sign out</button> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Leave the program</h2></div>
        <div className="pad col">
          <p className="sm">You can end the partnership at any time. Commission you already earned is still paid. Your link stops tracking new shops.</p>
          <div><button className="btn dng" disabled={ro} onClick={() => setLeaving({ reason: "" })}>Leave program</button></div>
        </div>
      </section>

      {twoFa ? (
        <Modal title={twoFa.backup ? "Save your backup codes" : "Turn on two step sign in"} onClose={() => setTwoFa(null)}
               footer={twoFa.backup
                 ? <button className="btn pri" onClick={() => setTwoFa(null)}>I saved them</button>
                 : <><button className="btn" onClick={() => setTwoFa(null)}>Cancel</button>
                     <button className="btn pri" disabled={twoFa.code.trim().length < 6} onClick={confirmTwoFa}>Turn on</button></>}>
          {twoFa.backup ? (
            <>
              <p className="sm">Each code works once, if you lose your phone. They are not shown again.</p>
              <div className="diff">{twoFa.backup.join("\n")}</div>
            </>
          ) : (
            <>
              <p className="sm">Add this account to your authenticator app, then type the six digit code it shows.</p>
              <a className="btn sm" href={twoFa.uri} style={{ alignSelf: "flex-start" }}>Open in authenticator app</a>
              <Field label="Or enter this key by hand" htmlFor="tf-key"><input id="tf-key" className="input mono" readOnly value={twoFa.secret} /></Field>
              <Field label="Code from the app" htmlFor="tf-code" error={errors.twofa}>
                <input id="tf-code" className="input mono" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
                       value={twoFa.code} onChange={(e) => setTwoFa({ ...twoFa, code: e.target.value })} />
              </Field>
            </>
          )}
        </Modal>
      ) : null}

      {offTwoFa ? (
        <Modal title="Turn off two step sign in" onClose={() => setOffTwoFa(null)}
               footer={<><button className="btn" onClick={() => setOffTwoFa(null)}>Cancel</button>
                 <button className="btn dng fill" onClick={disableTwoFa}>Turn off</button></>}>
          <Field label="Password" htmlFor="tfo-pw">
            <input id="tfo-pw" className="input" type="password" value={offTwoFa.password}
                   onChange={(e) => setOffTwoFa({ ...offTwoFa, password: e.target.value })} />
          </Field>
          <Field label="Code from the app, or a backup code" htmlFor="tfo-code" error={errors.twofaoff}>
            <input id="tfo-code" className="input mono" value={offTwoFa.code}
                   onChange={(e) => setOffTwoFa({ ...offTwoFa, code: e.target.value })} />
          </Field>
        </Modal>
      ) : null}

      {leaving ? (
        <Modal title="Leave the partner program?" sub="Commission you already earned is still paid. Your link stops tracking new shops, and you can no longer sign in."
               onClose={() => setLeaving(null)}
               footer={<><button className="btn" onClick={() => setLeaving(null)}>Stay</button>
                 <button className="btn dng fill" disabled={!leaving.reason.trim()} onClick={leave}>Leave program</button></>}>
          <Field label="Why are you leaving?" htmlFor="lv-why" error={errors.leave}>
            <textarea id="lv-why" className="area" value={leaving.reason} onChange={(e) => setLeaving({ reason: e.target.value })} />
          </Field>
          <p className="xs muted">After you leave, your final statement can be downloaded from the sign in page.</p>
        </Modal>
      ) : null}
      {toast.node}
    </>
  );
}
