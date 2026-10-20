"use client";

/**
 * The other half of "forgot your password" (design screen 3, second half).
 *
 * The email has been sending people here for as long as there has been a reset
 * link; there was no page at the end of it, so the link 404'd and the only way
 * back into an account was to ask someone with database access. The token is
 * good for an hour and can be used once.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authService } from "@/services/auth.service";
import { ApiClientError } from "@/lib/api-client";
import { PasswordField } from "@/components/ui/PasswordField";
import { PASSWORD_HINT, PASSWORD_MIN, passwordTooShort } from "@/lib/passwordRule";
import { AuthPage, ui } from "@/components/auth/AuthPage";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPage title="Choose a new password"><p className={ui.foot}>Loading…</p></AuthPage>}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = passwordTooShort(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= PASSWORD_MIN && confirm === password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 429) {
          setError("Too many attempts. Wait a few minutes and try again.");
        } else if (err.status >= 500) {
          setError("The server had a problem. Try again in a moment.");
        } else {
          // What the server actually said — "expired", "already used" — because
          // "something went wrong" sends people back to the same dead link.
          setError(err.message || "That reset link is no longer valid.");
        }
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthPage title="Link incomplete"
        sub="This reset link is missing its code. Open the link in the email exactly as it was sent, or ask for a new one.">
        <Link href="/forgot-password" className={`${ui.btn} ${ui.primary} ${ui.block}`}>Send a new link</Link>
        <p className={ui.foot}><Link href="/login" className={ui.link}>← Back to sign in</Link></p>
      </AuthPage>
    );
  }

  if (done) {
    return (
      <AuthPage title="Password changed" sub="You can sign in with your new password now. Taking you to the sign-in page…">
        <Link href="/login" className={`${ui.btn} ${ui.primary} ${ui.block}`}>Go to sign in</Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password" sub="Pick something you have not used here before.">
      <form onSubmit={submit}>
        {error && (
          <div className={ui.error} role="alert">
            {error} <Link href="/forgot-password">Send a new link</Link>
          </div>
        )}

        <div className={ui.field}>
          <label htmlFor="password" className={ui.label}>New password</label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={PASSWORD_MIN}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={ui.input}
          />
          <p className={`${ui.hint} ${tooShort ? ui.hintBad : ""}`}>{PASSWORD_HINT}</p>
        </div>

        <div className={ui.field}>
          <label htmlFor="confirm" className={ui.label}>Confirm new password</label>
          <PasswordField
            id="confirm"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={ui.input}
          />
          {mismatch && <p className={`${ui.hint} ${ui.hintBad}`}>These two do not match yet.</p>}
        </div>

        <button type="submit" disabled={!ready} className={`${ui.btn} ${ui.primary} ${ui.block}`}>
          {busy ? "Saving…" : "Set new password"}
        </button>

        <p className={ui.foot}>
          <Link href="/login" className={ui.link}>← Back to sign in</Link>
        </p>
      </form>
    </AuthPage>
  );
}
