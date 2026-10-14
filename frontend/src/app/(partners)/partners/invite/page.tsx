"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthFrame, useProgram } from "@/components/partners/AuthFrame";
import { Banner, Field, errorText } from "@/components/partners/ui";
import { papi, setPartnerToken } from "@/lib/partnerApi";

type Invite = { name: string; email: string; code: string; terms: { version: number; clauses: { title: string; text: string }[] } | null };

function InviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const program = useProgram();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setGone("This invite link is not complete. Open it again from the email."); return; }
    papi<Invite>(`/partners/auth/invite?token=${encodeURIComponent(token)}`, { auth: false })
      .then(setInvite).catch((e) => setGone(errorText(e)));
  }, [token]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pw.a !== pw.b) { setError("The two passwords are not the same."); return; }
    setBusy(true); setError(null);
    try {
      const r = await papi<{ access_token: string }>("/partners/auth/invite",
        { body: { token, password: pw.a, accept_terms: agree }, auth: false });
      setPartnerToken(r.access_token);
      router.replace("/partners/dashboard");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame support={program?.support_email}>
      {gone ? (
        <div className="col">
          <h1>This link does not work</h1>
          <Banner tone="warn">{gone}</Banner>
          <Link className="btn blk" href="/partners/login">Go to sign in</Link>
        </div>
      ) : !invite ? (
        <p className="muted">Opening your invite...</p>
      ) : (
        <form className="col" onSubmit={submit}>
          <div>
            <h1>Welcome, {invite.name.split(" ")[0]}</h1>
            <p className="muted" style={{ marginTop: 4 }}>Set a password for {invite.email}. Your code is <b className="ink">{invite.code}</b>.</p>
          </div>
          <Field label="Password" htmlFor="iv-a" hint="At least 8 characters, letters with numbers or symbols.">
            <input id="iv-a" className="input" type="password" autoComplete="new-password" value={pw.a}
                   onChange={(e) => setPw({ ...pw, a: e.target.value })} />
          </Field>
          <Field label="Confirm password" htmlFor="iv-b">
            <input id="iv-b" className="input" type="password" autoComplete="new-password" value={pw.b}
                   onChange={(e) => setPw({ ...pw, b: e.target.value })} />
          </Field>
          {invite.terms ? (
            <div className="col" style={{ gap: 8 }}>
              <span className="lbl">Partner terms, version {invite.terms.version}</span>
              <div className="card pad-s" style={{ maxHeight: 220, overflowY: "auto" }}>
                {invite.terms.clauses.map((c, i) => (
                  <p className="sm" key={i} style={{ marginBottom: 8 }}><b className="ink">{i + 1}. {c.title}.</b> {c.text}</p>
                ))}
              </div>
              <label className="chk">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                I have read and accept the partner terms, version {invite.terms.version}.
              </label>
            </div>
          ) : null}
          {error ? <span className="errt">{error}</span> : null}
          <button className="btn pri blk" type="submit" disabled={busy || !pw.a || !pw.b || (!!invite.terms && !agree)}>
            Set password and open the portal
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

export default function InvitePage() {
  return <Suspense fallback={null}><InviteForm /></Suspense>;
}
