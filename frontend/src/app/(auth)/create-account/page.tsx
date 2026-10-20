"use client";

/**
 * A buyer's account with one shop (design screen 2: Buyer register).
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
import { authService } from "@/services/auth.service";
import { trackSignUp } from "@/lib/tracking";
import { establishSession } from "@/lib/session";
import { safeNext } from "@/lib/safeNext";
import { COUNTRIES, countryName } from "@/lib/countries";
import { PASSWORD_HINT, PASSWORD_MIN, passwordTooShort } from "@/lib/passwordRule";
import { PasswordField } from "@/components/ui/PasswordField";
import { AuthPage, ui, useOnlyOn } from "@/components/auth/AuthPage";

function CreateAccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  // A buyer's account is with one shop; on printcopilot.co there is no shop
  // to open one with, and the door there is starting a store.
  const elsewhere = useOnlyOn("shop", "/signup");
  // Only ever a path on this shop: a next that can point anywhere is an open
  // redirect, and this page hands out a session (lib/safeNext also refuses
  // "/\elsewhere.com", which a browser reads as another site).
  const next = safeNext(params.get("next")) ?? "/";
  // Sent from a builder or a page that is not the cart: the way back is there.
  const fromElsewhere = next !== "/" && !next.startsWith("/cart");

  const [mode, setMode] = useState<"join" | "signin">("join");
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "", company_name: "", country: "US",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joining = mode === "join";
  const short = joining && passwordTooShort(form.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = joining
        ? await authService.registerCustomer({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim(),
            password: form.password,
            company_name: form.company_name.trim() || undefined,
            country: form.country ? countryName(form.country) : undefined,
          })
        : await authService.login({ email: form.email.trim(), password: form.password });

      if (tokens.requires_2fa) {
        setError("This account uses two-step sign-in. Please sign in from the sign-in page.");
        return;
      }
      await establishSession(tokens.access_token);
      if (joining) trackSignUp();
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (elsewhere) return null;

  return (
    <AuthPage
      title={joining ? "Create your account" : "Sign in"}
      sub={joining ? "Track orders, reorder and keep your artwork in one place." : "Welcome back. Your cart is waiting."}
    >
      <form onSubmit={submit}>
        {joining && (
          <div className={ui.row2}>
            <div className={ui.field}>
              <label htmlFor="first_name" className={ui.label}>First name</label>
              <input id="first_name" required autoFocus autoComplete="given-name" value={form.first_name}
                onChange={set("first_name")} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="last_name" className={ui.label}>Last name</label>
              <input id="last_name" autoComplete="family-name" value={form.last_name}
                onChange={set("last_name")} className={ui.input} />
            </div>
          </div>
        )}

        <div className={ui.field}>
          <label htmlFor="email" className={ui.label}>Email</label>
          <input id="email" type="email" required autoFocus={!joining} autoComplete="email" value={form.email}
            onChange={set("email")} className={ui.input} />
        </div>

        <div className={ui.field}>
          <label htmlFor="password" className={ui.label}>Password</label>
          <PasswordField id="password" required minLength={joining ? PASSWORD_MIN : undefined}
            autoComplete={joining ? "new-password" : "current-password"}
            value={form.password} onChange={set("password")} className={ui.input} />
          {joining && (
            <p className={`${ui.hint} ${short ? ui.hintBad : ""}`}>{PASSWORD_HINT}</p>
          )}
        </div>

        {joining && (
          <>
            <div className={ui.field}>
              <label htmlFor="country" className={ui.label}>Country</label>
              <select id="country" value={form.country} onChange={set("country")} className={ui.input}
                autoComplete="country">
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="company_name" className={ui.label}>
                Business name <span className={ui.optional}>(optional)</span>
              </label>
              <input id="company_name" autoComplete="organization" value={form.company_name}
                onChange={set("company_name")} className={ui.input} />
            </div>
          </>
        )}

        {error && <div className={ui.error} role="alert">{error}</div>}

        <button type="submit" disabled={busy || short} className={`${ui.btn} ${ui.primary} ${ui.block}`}>
          {busy
            ? (joining ? "Creating your account…" : "Signing you in…")
            : (joining ? "Create account" : "Sign in")}
        </button>

        <p className={ui.foot}>
          {joining ? "Already have one? " : "New here? "}
          <button type="button" className={ui.link}
            onClick={() => { setMode(joining ? "signin" : "join"); setError(null); }}>
            {joining ? "Sign in" : "Create an account"}
          </button>
          {" · "}
          <Link href={fromElsewhere ? next : "/cart"} className={ui.link}>
            {fromElsewhere ? "Go back" : "Back to my cart"}
          </Link>
        </p>
      </form>
    </AuthPage>
  );
}

export default function CreateAccountPage() {
  return (
    <Suspense fallback={<AuthPage title="Create your account"><p className={ui.foot}>Loading…</p></AuthPage>}>
      <CreateAccountForm />
    </Suspense>
  );
}
