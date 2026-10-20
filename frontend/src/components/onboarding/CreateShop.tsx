"use client";

/**
 * The sign-up's second screen: setup step 1 before the shop exists (design
 * screen 7). The owner gave an email and a password on /signup (held in this
 * tab's memory, lib/pendingSignup); here they say what the business is, its
 * name and its country, and Continue makes the shop. Its address comes from
 * the name, checked as it is typed, with the next free number when the name's
 * own is taken; the owner can change it.
 *
 * Then the owner carries on at step 2 in their shop, signed in. They stay on
 * the address they signed up at: a new shop's own address answers only once
 * the platform has added it to the deployment (shop addresses are added by
 * hand), and the console works on any address because it follows the token.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ui } from "@/components/auth/AuthPage";
import { dropSignup, type PendingSignup } from "@/lib/pendingSignup";
import { OnboardingFrame } from "./OnboardingFrame";
import { BusinessFields } from "./BusinessFields";
import o from "./onboarding.module.css";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";
/** What a shop's address is shown as. Locally there is no real one, so the live one's shape. */
const ADDRESS_DOMAIN = PLATFORM_DOMAIN === "localhost" ? "printcopilot.co" : PLATFORM_DOMAIN;

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

interface Address { slug: string; ok: boolean; reason: string }
interface SignupOut { slug: string; access_token: string; next: string }

export function CreateShop({ held }: { held: PendingSignup }) {
  const router = useRouter();
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("US");
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const [address, setAddress] = useState<Address | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const base = editing ? slugify(typed) : slugify(name);

  useEffect(() => {
    if (base.length < 3) { setAddress(null); setChecking(false); return; }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      // The name's own address when it is free, else the next free number after
      // it. An address the owner typed is checked as it is.
      const tries = editing ? [base] : [base, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${base.slice(0, 47)}-${n}`)];
      let found: Address | null = null;
      for (const s of tries) {
        try {
          const r = await apiClient.get<{ slug: string; available: boolean; reason: string }>(
            `/api/v1/signup/availability?slug=${encodeURIComponent(s)}`, { skipAuth: true },
          );
          if (cancelled) return;
          if (r.available) { found = { slug: r.slug, ok: true, reason: "" }; break; }
          found = found ?? { slug: r.slug, ok: false, reason: r.reason || "Already taken." };
        } catch {
          break;
        }
      }
      if (!cancelled) { setAddress(found); setChecking(false); }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [base, editing]);

  const ready = Boolean(type) && name.trim().length >= 2 && Boolean(address?.ok) && !checking && !busy;

  async function create() {
    if (!ready || !address) return;
    setBusy(true);
    setError(null);
    try {
      const out = await apiClient.post<SignupOut>("/api/v1/signup", {
        email: held.email,
        password: held.password,
        plan: held.plan,
        shop_name: name.trim(),
        slug: address.slug,
        business_type: type,
        country,
        referral_cookie: held.referralCookie,
        referral_code: held.referralCode,
      }, { skipAuth: true });
      dropSignup();
      // Signed in the way the platform console enters a shop: the token in the
      // fragment, read once and wiped by AuthInitializer (a token in the query
      // string ends up in logs). The query differs from this page's own, so the
      // browser loads the page afresh rather than only moving to the fragment.
      // A preview or local copy has no shop addresses, so it names the shop in
      // the address; on printcopilot.co the console needs no shop in it.
      const handover = `#session=${encodeURIComponent(out.access_token)}`;
      const onPlatform = PLATFORM_DOMAIN !== "localhost" && window.location.hostname.endsWith(PLATFORM_DOMAIN);
      const query = onPlatform ? "?welcome=1" : `?tenant=${encodeURIComponent(out.slug)}`;
      window.location.href = `${window.location.origin}${out.next}${query}${handover}`;
    } catch (err) {
      const status = err instanceof ApiClientError ? err.status : 0;
      const message = err instanceof ApiClientError ? err.message : "";
      if (status === 409 && /email/i.test(message)) {
        // This sign-up cannot go on: let go of what it held, so signing in
        // instead does not bring this screen back on /onboarding.
        dropSignup();
        setError(<>That email already has an account here. <Link href="/login">Sign in instead</Link>.</>);
      } else if (status === 409) {
        setError(message || "That address was just taken. Pick another one.");
        setEditing(true);
        setTyped(address.slug);
      } else if (status === 429) {
        setError("A few too many tries just now. Wait a little and try again.");
      } else if (status === 400 && message) {
        setError(message);
      } else {
        setError("Your store could not be made just now. Please try again.");
      }
      setBusy(false);
    }
  }

  const hint = (
    <div className={ui.hint}>
      {editing ? (
        <div className={o.colorRow} style={{ marginTop: 2 }}>
          <input aria-label="Shop address" className={ui.input} value={typed} maxLength={50}
            onChange={(e) => setTyped(e.target.value)} />
          <span style={{ whiteSpace: "nowrap" }}>.{ADDRESS_DOMAIN}</span>
        </div>
      ) : null}
      <span className={address && !address.ok && !checking ? ui.hintBad : ""}>
        {base.length < 3 ? "Your shop's address comes from its name."
          : checking ? "Checking the address…"
          : !address ? "The address could not be checked. Try again in a moment."
          : address.ok ? <>Your shop&apos;s address: <strong>{address.slug}.{ADDRESS_DOMAIN}</strong></>
          : address.reason}
      </span>
      {!editing && (
        <> <button type="button" className={`${ui.link} ${ui.small}`}
          onClick={() => { setEditing(true); setTyped(address?.slug ?? base); }}>Change</button></>
      )}
    </div>
  );

  return (
    <OnboardingFrame
      step={1}
      reached={1}
      trialDays={14}
      title="What do you run?"
      sub="This sets up the right defaults. You can change it later."
      actions={
        <>
          <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => router.push("/signup")} disabled={busy}>
            Back
          </button>
          <div className={o.actionsRight}>
            <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={create} disabled={!ready}>
              {busy ? "Making your store…" : "Continue"}
            </button>
          </div>
        </>
      }
    >
      <BusinessFields
        type={type}
        onType={setType}
        name={name}
        onName={setName}
        country={country}
        onCountry={setCountry}
        nameHint={hint}
      />
      {error ? <div className={ui.error} role="alert">{error}</div> : null}
    </OnboardingFrame>
  );
}

export default CreateShop;
