"use client";

/**
 * Ask for a reset link (design screen 3: Forgot and reset password).
 *
 * The answer is deliberately the same whether or not the address has an
 * account — saying "no such account" would let anyone test which addresses
 * are registered here. A failure that is ours, though (rate limit, server,
 * no connection), is said plainly, because the old page claimed the email had
 * been sent no matter what happened.
 */
import { useState } from "react";
import Link from "next/link";
import { authService } from "@/services/auth.service";
import { ApiClientError } from "@/lib/api-client";
import { AuthPage, ui } from "@/components/auth/AuthPage";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.status === 429
          ? "That's a few too many requests. Wait an hour and try again."
          : err.message || "Could not send the link. Please try again.");
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Reset your password" sub="Enter your email and we will send a link.">
      <form onSubmit={handleSubmit}>
        <div className={ui.field}>
          <label htmlFor="email" className={ui.label}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSent(false); }}
            placeholder="you@company.com"
            className={ui.input}
          />
        </div>

        {error && <div className={ui.error} role="alert">{error}</div>}

        <button type="submit" disabled={busy || !email.trim()} className={`${ui.btn} ${ui.primary} ${ui.block}`}>
          {busy ? "Sending…" : sent ? "Send it again" : "Send reset link"}
        </button>

        {sent && (
          <p className={ui.notice} role="status">
            If that email has an account, a link is on its way. It works once and lasts an hour.
            Nothing after a few minutes? Look in spam, or send it again.
          </p>
        )}

        <p className={ui.foot}>
          <Link href="/login" className={ui.link}>← Back to sign in</Link>
        </p>
      </form>
    </AuthPage>
  );
}
