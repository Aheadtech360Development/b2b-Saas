"use client";

/**
 * Ask for a reset link.
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
import { AuthCard, authStyles as S } from "@/components/auth/AuthCard";

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

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p style={S.note}>
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It works
          once and expires in an hour.
        </p>
        <p style={{ ...S.note, fontSize: "13px" }}>
          Nothing after a few minutes? Look in spam, then{" "}
          <button
            type="button"
            onClick={() => { setSent(false); setError(null); }}
            style={{ background: "none", border: "none", padding: 0, color: "var(--brand-primary, var(--ui-ink))", cursor: "pointer", font: "inherit", textDecoration: "underline" }}
          >
            try again
          </button>.
        </p>
        <Link href="/login" style={S.primaryLink}>Back to sign in →</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password">
      <p style={S.note}>
        Give us the email you sign in with and we&apos;ll send you a link to set a new password.
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div style={S.error}>{error}</div>}

        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="email" style={S.label}>Email *</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={S.input}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim()}
          style={{ ...S.button, background: busy || !email.trim() ? "#C9C6C0" : "var(--brand-primary, var(--ui-ink))", cursor: busy || !email.trim() ? "not-allowed" : "pointer" }}
        >
          {busy ? "Sending…" : "Send reset link →"}
        </button>
      </form>

      <p style={{ ...S.note, marginTop: "18px", marginBottom: 0, fontSize: "13px" }}>
        Remembered it? <Link href="/login" style={{ color: "var(--brand-primary, var(--ui-ink))" }}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
