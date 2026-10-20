"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthFrame, safeNext, useProgram } from "@/components/partners/AuthFrame";
import { Banner, Field, Icon } from "@/components/partners/ui";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import { PartnerApiError, apiUrl, papi, setPartnerToken } from "@/lib/partnerApi";

type Stage = "signin" | "code" | "forgot" | "sent" | "blocked";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const program = useProgram();
  const [stage, setStage] = useState<Stage>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; text: string; statement?: string; support?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const left = params.get("statement");

  function done(token: string) {
    setPartnerToken(token);
    router.replace(safeNext(params.get("next")));
  }

  function refused(e: unknown) {
    if (e instanceof PartnerApiError) {
      if (e.code === "LOCKED") { setLocked(e.message); return; }
      if (e.code === "SUSPENDED" || e.code === "TERMINATED") {
        setBlocked({
          title: e.code === "SUSPENDED" ? "Suspended" : "Terminated", text: e.message,
          statement: typeof e.data.statement === "string" ? e.data.statement : undefined,
          support: typeof e.data.support === "string" ? e.data.support : undefined,
        });
        setStage("blocked");
        return;
      }
      setError(e.message);
      return;
    }
    setError("Could not reach the server. Try again.");
  }

  async function signIn(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null); setLocked(null);
    try {
      const r = await papi<{ access_token?: string; two_factor_required?: boolean; challenge?: string }>(
        "/partners/auth/login", { body: { email, password }, auth: false });
      if (r.two_factor_required && r.challenge) { setChallenge(r.challenge); setStage("code"); }
      else if (r.access_token) done(r.access_token);
    } catch (e) { refused(e); } finally { setBusy(false); }
  }

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await papi<{ access_token: string }>("/partners/auth/2fa", { body: { challenge, code }, auth: false });
      done(r.access_token);
    } catch (e) {
      if (e instanceof PartnerApiError && e.code === "SESSION_ENDED") { setStage("signin"); setError(e.message); }
      else refused(e);
    } finally { setBusy(false); }
  }

  async function forgot(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null);
    try {
      await papi("/partners/auth/forgot", { body: { email }, auth: false });
      setStage("sent");
    } catch (e) { refused(e); } finally { setBusy(false); }
  }

  const support = program?.support_email ?? null;
  return (
    <AuthFrame support={support}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, font: "600 18px var(--pcp-display), Inter, sans-serif", color: "var(--ink)" }}>
        <PlatformLogo /><span className="muted" style={{ fontWeight: 500 }}>Partners</span>
      </div>

      {params.get("ended") ? <Banner icon="clock">You were signed out. For your security the session ended after a period without activity.</Banner> : null}
      {params.get("signed_out") ? <Banner tone="ok">You are signed out.</Banner> : null}
      {left ? (
        <Banner tone="ok" action={<a className="btn sm" href={apiUrl(`/partners/auth/final-statement?ticket=${encodeURIComponent(left)}`)}>Final statement</a>}>
          You left the partner program. Commission you earned is still paid.
        </Banner>
      ) : null}

      {stage === "signin" ? (
        <form className="col" onSubmit={signIn} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: 4 }}>Use the email you applied with.</p>
          </div>
          {locked ? <Banner tone="bad" icon="lock">{locked}</Banner> : null}
          <Field label="Email" htmlFor="li-email">
            <input id="li-email" className="input" type="email" autoComplete="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="li-pw" error={error}>
            <input id="li-pw" className={`input${error ? " err" : ""}`} type="password" autoComplete="current-password" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn pri blk" type="submit" disabled={busy || !email || !password}>Sign in</button>
          <button className="btn gh" type="button" onClick={() => { setStage("forgot"); setError(null); }}>Forgot password</button>
          <p className="sm muted tc">Partner logins are separate from shop owner logins.</p>
          <p className="sm tc">Not a partner yet? <Link href="/partners">Apply to the program</Link></p>
        </form>
      ) : null}

      {stage === "code" ? (
        <form className="col" onSubmit={verify}>
          <div>
            <h1>Two step sign in</h1>
            <p className="muted" style={{ marginTop: 4 }}>Type the code from your authenticator app, or a backup code.</p>
          </div>
          <Field label="Code" htmlFor="li-code" error={error}>
            <input id="li-code" className="input mono" inputMode="numeric" autoComplete="one-time-code" maxLength={12}
                   value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <button className="btn pri blk" type="submit" disabled={busy || code.trim().length < 6}>Continue</button>
          <button className="btn gh" type="button" onClick={() => { setStage("signin"); setCode(""); }}>Back</button>
        </form>
      ) : null}

      {stage === "forgot" ? (
        <form className="col" onSubmit={forgot}>
          <div>
            <h1>Reset your password</h1>
            <p className="muted" style={{ marginTop: 4 }}>We email you a link to choose a new one.</p>
          </div>
          <Field label="Email" htmlFor="fg-email" error={error}>
            <input id="fg-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn pri blk" type="submit" disabled={busy || !email}>Send the link</button>
          <button className="btn gh" type="button" onClick={() => setStage("signin")}>Back to sign in</button>
        </form>
      ) : null}

      {stage === "sent" ? (
        <div className="col">
          <span style={{ color: "var(--ok)" }}><Icon name="mail" size="xl" /></span>
          <h1>Check your email</h1>
          <p className="muted">If {email} has a partner account, a link to reset the password is on its way. It works for one hour.</p>
          <button className="btn blk" onClick={() => setStage("signin")}>Back to sign in</button>
        </div>
      ) : null}

      {stage === "blocked" && blocked ? (
        <div className="col">
          <h1>{blocked.title}</h1>
          <Banner tone={blocked.title === "Suspended" ? "bad" : "warn"} icon={blocked.title === "Suspended" ? "ban" : "info"}>
            {blocked.text}{blocked.support ? <> Write to <a href={`mailto:${blocked.support}`}>{blocked.support}</a>.</> : null}
          </Banner>
          {blocked.statement ? (
            <a className="btn pri blk" href={apiUrl(`/partners/auth/final-statement?ticket=${encodeURIComponent(blocked.statement)}`)}>
              <Icon name="download" />Download final statement
            </a>
          ) : null}
          <button className="btn gh" onClick={() => { setStage("signin"); setBlocked(null); }}>Back</button>
        </div>
      ) : null}
    </AuthFrame>
  );
}

export default function PartnerLoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
