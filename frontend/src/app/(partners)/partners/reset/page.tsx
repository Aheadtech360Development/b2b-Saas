"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthFrame, useProgram } from "@/components/partners/AuthFrame";
import { Banner, Field, errorText } from "@/components/partners/ui";
import { papi } from "@/lib/partnerApi";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const program = useProgram();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pw.a !== pw.b) { setError("The two passwords are not the same."); return; }
    setBusy(true); setError(null);
    try {
      await papi("/partners/auth/reset", { body: { token, password: pw.a }, auth: false });
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame support={program?.support_email}>
      {done ? (
        <div className="col">
          <h1>Password changed</h1>
          <Banner tone="ok">Your password is changed, and every other session was signed out.</Banner>
          <Link className="btn pri blk" href="/partners/login">Sign in</Link>
        </div>
      ) : (
        <form className="col" onSubmit={submit}>
          <div>
            <h1>Choose a new password</h1>
            <p className="muted" style={{ marginTop: 4 }}>The link from the email works for one hour.</p>
          </div>
          <Field label="New password" htmlFor="rs-a" hint="At least 8 characters, letters with numbers or symbols.">
            <input id="rs-a" className="input" type="password" autoComplete="new-password" value={pw.a}
                   onChange={(e) => setPw({ ...pw, a: e.target.value })} />
          </Field>
          <Field label="Confirm new password" htmlFor="rs-b">
            <input id="rs-b" className="input" type="password" autoComplete="new-password" value={pw.b}
                   onChange={(e) => setPw({ ...pw, b: e.target.value })} />
          </Field>
          {error ? <span className="errt">{error}</span> : null}
          <button className="btn pri blk" type="submit" disabled={busy || !token || !pw.a || !pw.b}>Save the new password</button>
          <Link className="btn gh" href="/partners/login">Back to sign in</Link>
        </form>
      )}
    </AuthFrame>
  );
}

export default function ResetPage() {
  return <Suspense fallback={null}><ResetForm /></Suspense>;
}
