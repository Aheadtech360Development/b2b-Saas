"use client";

/**
 * The other half of "forgot your password".
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
import { AuthCard as Shell, authStyles as S } from "@/components/auth/AuthCard";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell><p style={S.note}>Loading…</p></Shell>}>
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

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && confirm === password && !busy;

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
      <Shell title="Link incomplete">
        <p style={S.note}>
          This reset link is missing its code. Open the link in the email exactly as it was sent,
          or ask for a new one.
        </p>
        <Link href="/forgot-password" style={S.primaryLink}>Send a new link →</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password changed">
        <p style={S.note}>
          You can sign in with your new password now. Taking you to the sign-in page…
        </p>
        <Link href="/login" style={S.primaryLink}>Go to sign in →</Link>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit}>
        {error && (
          <div style={S.error}>
            {error}
            <Link href="/forgot-password" style={S.errorLink}>Send a new link</Link>
          </div>
        )}

        <div style={{ marginBottom: "16px" }}>
          <label htmlFor="password" style={S.label}>New password *</label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={S.input}
          />
          {tooShort && <p style={S.hintBad}>A little longer — 8 characters at least.</p>}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="confirm" style={S.label}>Confirm new password *</label>
          <PasswordField
            id="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            style={S.input}
          />
          {mismatch && <p style={S.hintBad}>These two do not match yet.</p>}
        </div>

        <button type="submit" disabled={!ready} style={{ ...S.button, background: ready ? "var(--brand-primary, var(--ui-ink))" : "#C9C6C0", cursor: ready ? "pointer" : "not-allowed" }}>
          {busy ? "Saving…" : "Set new password →"}
        </button>
      </form>

      <p style={{ ...S.note, marginTop: "18px", marginBottom: 0 }}>
        Remembered it? <Link href="/login" style={{ color: "var(--brand-primary, var(--ui-ink))" }}>Back to sign in</Link>
      </p>
    </Shell>
  );
}

