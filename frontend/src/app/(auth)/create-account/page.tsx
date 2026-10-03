"use client";

/**
 * A buyer's account with one shop.
 *
 * /signup belongs to somebody opening a shop; /wholesale/register ends in a
 * queue somebody has to approve. Neither is right for a customer with a full
 * cart who just wants to pay — so this is the third door: name, email,
 * password, and straight back to whatever they were doing.
 *
 * It is the page form of the dialog inside the gang sheet builder, and it
 * calls the same endpoint, so an account opened either way is the same
 * account: a company, a user, and the link between them.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authService } from "@/services/auth.service";
import { establishSession } from "@/lib/session";
import { useBranding } from "@/components/providers/BrandingProvider";

function CreateAccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { store_name: shop } = useBranding();
  // Only ever a path on this shop: a next that can point anywhere is an open
  // redirect, and this page hands out a session.
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const [mode, setMode] = useState<"join" | "signin">("join");
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "", company_name: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const joining = mode === "join";
    try {
      const tokens = joining
        ? await authService.registerCustomer({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim(),
            password: form.password,
            company_name: form.company_name.trim() || undefined,
          })
        : await authService.login({ email: form.email.trim(), password: form.password });

      if (tokens.requires_2fa) {
        setError("This account uses a second factor. Please sign in from the sign-in page.");
        return;
      }
      await establishSession(tokens.access_token);
      router.replace(next);
    } catch (err) {
      const e2 = err as { message?: string; status?: number };
      const taken = e2?.status === 409 || /already (has|exists)/i.test(e2?.message ?? "");
      if (joining && taken) {
        setMode("signin");
        setForm((f) => ({ ...f, password: "" }));
        setError("You already have an account with this email. Enter your password to sign in.");
        return;
      }
      setError(
        e2?.status === 429 ? "Too many tries just now. Wait a minute and try again."
        : e2?.status === 401 ? "That password does not match this email."
        : e2?.message || (joining
            ? "Could not open your account. Please check the details and try again."
            : "Could not sign you in. Check your email and password."),
      );
    } finally {
      setBusy(false);
    }
  }

  const label = { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--ui-ink)", marginBottom: "6px" } as const;
  const input = {
    width: "100%", boxSizing: "border-box" as const, padding: "12px 14px",
    border: "1px solid var(--ui-line)", borderRadius: "10px",
    fontSize: "14.5px", fontFamily: "'DM Sans', sans-serif", color: "var(--ui-ink)", background: "#fff",
  };

  return (
    <div className="ui-wrap" style={{ maxWidth: "480px", padding: "48px 0 64px" }}>
      <h1 style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-.02em", color: "var(--ui-ink)" }}>
        {mode === "join" ? "Create your account" : "Sign in"}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--ui-muted)", lineHeight: 1.6, margin: "8px 0 24px" }}>
        {mode === "join"
          ? <>Your first order with {shop && shop !== "Store" ? shop : "us"} opens an account, so you can track it, reorder it, and we can reach you about the artwork. After this you just sign in.</>
          : "Welcome back — your cart is waiting."}
      </p>

      <form onSubmit={submit}>
        {mode === "join" && (
          <div style={{ display: "flex", gap: "10px" }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>First name</span>
              <input required autoFocus value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} style={input} />
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>Last name</span>
              <input value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} style={input} />
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <label style={{ flex: 1, minWidth: 0 }}>
            <span style={label}>Email</span>
            <input type="email" required autoFocus={mode === "signin"} value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={input} />
          </label>
          {mode === "join" && (
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>
                Business <span style={{ color: "var(--ui-muted)", fontWeight: 500 }}>(optional)</span>
              </span>
              <input value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} style={input} />
            </label>
          )}
        </div>

        <label style={{ display: "block", marginTop: "14px" }}>
          <span style={label}>
            Password
            {mode === "join" && <span style={{ color: "var(--ui-muted)", fontWeight: 500 }}> · at least 8 characters</span>}
          </span>
          <span style={{ position: "relative", display: "block" }}>
            <input type={showPw ? "text" : "password"} required minLength={mode === "join" ? 8 : undefined}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              style={{ ...input, paddingRight: "44px" }} />
            <button type="button" onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "30px", height: "30px", border: "none", background: "none", color: "var(--ui-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              {showPw ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
            </button>
          </span>
        </label>

        {error && (
          <div role="alert" style={{ marginTop: "14px", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="ui-btn ui-btn-block" style={{ marginTop: "20px", borderRadius: "12px", padding: "14px" }}>
          {busy
            ? (mode === "join" ? "Creating your account…" : "Signing you in…")
            : (mode === "join" ? "Create account & continue" : "Sign in & continue")}
        </button>
      </form>

      <button type="button" onClick={() => { setMode(mode === "join" ? "signin" : "join"); setError(null); }}
        style={{ display: "block", width: "100%", marginTop: "14px", background: "none", border: "none", color: "var(--ui-muted)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        {mode === "join" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>

      <p style={{ textAlign: "center", marginTop: "18px", fontSize: "13px", color: "var(--ui-muted)" }}>
        <Link href="/cart" style={{ color: "inherit" }}>Back to my cart</Link>
      </p>
    </div>
  );
}

export default function CreateAccountPage() {
  return (
    <Suspense fallback={<div className="ui-wrap" style={{ padding: "60px 0", color: "var(--ui-muted)" }}>Loading…</div>}>
      <CreateAccountForm />
    </Suspense>
  );
}
