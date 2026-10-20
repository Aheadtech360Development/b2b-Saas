"use client";

/**
 * The owner's five setup steps, once the shop exists (design screens 7 to 11).
 *
 * Where the owner is comes from the server (services/onboarding), and so does
 * what is done: each step's row says "Connected" or "3 products" because that
 * is what the shop has, not because a button was pressed here. Every step can
 * be skipped, and the place is saved on each move, so the owner can leave and
 * come back from Home ("Finish setting up your store").
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api-client";
import { ui } from "@/components/auth/AuthPage";
import { FONT_PAIRINGS, fontPairingId } from "@/lib/fontPresets";
import { mediaService } from "@/services/media.service";
import { ConnectCarrierDialog } from "@/components/admin/shipping/ConnectCarrierDialog";
import {
  onboardingService,
  type OnboardingState,
  type PickupSaved,
  type ProgressIn,
} from "@/services/onboarding.service";
import { OnboardingFrame } from "./OnboardingFrame";
import { BusinessFields } from "./BusinessFields";
import o from "./onboarding.module.css";

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiClientError && e.message ? e.message : fallback;

const HEX = /^#[0-9a-f]{6}$/i;

type Frame = (p: { title: ReactNode; sub?: ReactNode; children: ReactNode; actions?: ReactNode }) => ReactNode;

interface StepProps {
  state: OnboardingState;
  setState: (s: OnboardingState) => void;
  reload: () => Promise<OnboardingState>;
  go: (n: number, extra?: ProgressIn) => Promise<void>;
  frame: Frame;
}

export function OnboardingWizard() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState(1);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const s = await onboardingService.get();
    setState(s);
    return s;
  }, []);

  useEffect(() => {
    let alive = true;
    // Back from Stripe's page (?stripe=return, or =refresh when its link ran
    // out): read the account's state from Stripe first, then open step 4.
    const query = new URLSearchParams(window.location.search);
    const back = query.get("stripe");
    // ?welcome=1 only made the sign-up's hand-over load the page afresh.
    if (query.has("welcome") && !back) window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      if (back) {
        try { await onboardingService.refreshStripe(); } catch { /* not started, or no Stripe here */ }
        window.history.replaceState(null, "", window.location.pathname);
      }
      const s = await onboardingService.get();
      if (!alive) return;
      setState(s);
      setStep(back ? 4 : Math.min(5, Math.max(1, s.step || 1)));
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Back from another page or tab (a product added, a carrier connected):
  // read again, so the rows say what the shop has now.
  useEffect(() => {
    const again = () => { reload().catch(() => {}); };
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [reload]);

  const go = useCallback(async (n: number, extra: ProgressIn = {}) => {
    const s = await onboardingService.save({ ...extra, step: n });
    setState(s);
    setStep(n);
    window.scrollTo?.({ top: 0 });
  }, []);

  if (failed) {
    return (
      <div className={o.page}>
        <div className={o.wrap}>
          <div className={ui.error} role="alert">
            Your setup could not be loaded. <a href="/onboarding">Try again</a> or <Link href="/admin/dashboard">go to your admin</Link>.
          </div>
        </div>
      </div>
    );
  }
  if (!state) {
    return <div className={o.page}><div className={o.wrap}><p className={ui.foot}>Loading your setup…</p></div></div>;
  }

  const frame: Frame = ({ title, sub, children, actions }) => (
    <OnboardingFrame
      step={step}
      reached={state.reached}
      trialDays={state.trial_days}
      onStep={(n) => { go(n).catch(() => {}); }}
      exit={<Link href="/admin/dashboard">Exit to admin</Link>}
      title={title}
      sub={sub}
      actions={actions}
    >
      {children}
    </OnboardingFrame>
  );

  const props: StepProps = { state, setState, reload, go, frame };
  if (step === 1) return <BusinessStep {...props} />;
  if (step === 2) return <BrandStep {...props} />;
  if (step === 3) return <ProductsStep {...props} />;
  if (step === 4) return <GetPaidStep {...props} />;
  return <GoLiveStep {...props} />;
}

/** Back, Skip for now and Continue, as the design lays them out. */
function Footer({ onBack, onSkip, onNext, busy, nextLabel = "Continue", nextDisabled = false }: {
  onBack: () => void; onSkip?: () => void; onNext: () => void; busy: boolean; nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <>
      <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={onBack} disabled={busy}>Back</button>
      <div className={o.actionsRight}>
        {onSkip && <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={onSkip} disabled={busy}>Skip for now</button>}
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onNext} disabled={busy || nextDisabled}>
          {busy ? "Saving…" : nextLabel}
        </button>
      </div>
    </>
  );
}

/** Runs one step's save with its own busy flag and error line. */
function useStepAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>, fallback = "That could not be saved. Please try again.") => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e, fallback)); } finally { setBusy(false); }
  }, []);
  return { busy, error, setError, run };
}

// ── Step 1: Your business ─────────────────────────────────────────────────────

function BusinessStep({ state, go, frame }: StepProps) {
  const router = useRouter();
  const [type, setType] = useState<string | null>(state.business_type);
  const [name, setName] = useState(state.shop_name);
  const [country, setCountry] = useState(state.country ?? "US");
  const { busy, error, run } = useStepAction();

  const next = () => run(async () => {
    if (name.trim() !== state.shop_name) await onboardingService.saveLook({ store_name: name.trim() });
    await go(2, { business_type: type, country });
  });

  return frame({
    title: "What do you run?",
    sub: "This sets up the right defaults. You can change it later.",
    actions: <Footer onBack={() => router.push("/admin/dashboard")} onNext={next} busy={busy}
      nextDisabled={!type || name.trim().length < 2} />,
    children: (
      <>
        <BusinessFields type={type} onType={setType} name={name} onName={setName} country={country} onCountry={setCountry} />
        {error && <div className={ui.error} role="alert">{error}</div>}
      </>
    ),
  });
}

// ── Step 2: Brand your store ──────────────────────────────────────────────────

function BrandStep({ state, go, frame }: StepProps) {
  const saved = state.branding;
  const [logo, setLogo] = useState<string | null>(saved.logo_url);
  const [colour, setColour] = useState((saved.primary_color ?? "#1C3557").toUpperCase());
  const [pairing, setPairing] = useState(fontPairingId(saved.font_heading ?? undefined, saved.font_body ?? undefined));
  const [uploading, setUploading] = useState(false);
  const { busy, error, setError, run } = useStepAction();

  const valid = HEX.test(colour);
  const shown = valid ? colour : (saved.primary_color ?? "#1C3557");
  const fonts = FONT_PAIRINGS.find((p) => p.id === pairing);
  const name = state.shop_name || "Your shop";

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const r = await mediaService.upload(file);
      setLogo(r.url);
    } catch (e) {
      setError(errorText(e, "The logo could not be uploaded."));
    } finally {
      setUploading(false);
    }
  }

  const next = () => run(async () => {
    const changes: Record<string, string> = {};
    if (logo && logo !== saved.logo_url) changes.logo_url = logo;
    if (valid && colour.toLowerCase() !== (saved.primary_color ?? "").toLowerCase()) changes.primary_color = colour;
    if (fonts && (fonts.heading !== saved.font_heading || fonts.body !== saved.font_body)) {
      changes.font_heading = fonts.heading;
      changes.font_body = fonts.body;
    }
    if (Object.keys(changes).length) await onboardingService.saveLook(changes);
    await go(3);
  });

  return frame({
    title: "Make it look like you",
    sub: "Add your logo and pick a colour. Your buyers see this, not ours.",
    actions: <Footer onBack={() => run(() => go(1))} onSkip={() => run(() => go(3))} onNext={next} busy={busy || uploading}
      nextDisabled={!valid} />,
    children: (
      <>
        <div className={o.split}>
          <div className={o.controls}>
            <label className={`${ui.btn} ${ui.secondary} ${ui.block}`} style={{ cursor: uploading ? "wait" : "pointer" }}>
              {uploading ? "Uploading…" : logo ? "Change logo" : "Upload logo"}
              <input type="file" accept="image/*" hidden disabled={uploading}
                onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {logo && (
              <div className={o.logoPicked}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the shop's own logo */}
                <img src={logo} alt="Your logo" />
                <button type="button" className={`${ui.link} ${ui.small}`} onClick={() => setLogo(null)}>Use no logo</button>
              </div>
            )}
            <div className={ui.field}>
              <label htmlFor="ob-colour" className={ui.label}>Brand colour</label>
              <div className={o.colorRow}>
                <input type="color" aria-label="Pick a colour" className={o.swatch} value={shown.toLowerCase()}
                  onChange={(e) => setColour(e.target.value.toUpperCase())} />
                <input id="ob-colour" className={ui.input} value={colour} maxLength={7} spellCheck={false}
                  onChange={(e) => setColour(e.target.value.trim().toUpperCase())} />
              </div>
              {!valid && <p className={`${ui.hint} ${ui.hintBad}`}>A colour is # and six letters or numbers, like #0F766E.</p>}
            </div>
            <div className={ui.field}>
              <label htmlFor="ob-font" className={ui.label}>Font</label>
              <select id="ob-font" className={ui.input} value={pairing} onChange={(e) => setPairing(e.target.value)}>
                {pairing === "custom" && <option value="custom">Your current fonts</option>}
                {FONT_PAIRINGS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className={o.preview} aria-label="Preview of your storefront">
              <div className={o.previewHead}>
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the shop's own logo
                  <img src={logo} alt="" className={o.previewLogo} />
                ) : (
                  <span className={o.previewTile} style={{ background: shown }}>{name.charAt(0).toUpperCase()}</span>
                )}
                <span className={o.previewName} style={{ fontFamily: fonts?.heading }}>{name}</span>
              </div>
              <div className={o.previewBody}>
                <p className={o.previewTitle} style={{ fontFamily: fonts?.heading }}>Preview of your storefront</p>
                <span className={o.previewBtn} style={{ background: shown, fontFamily: fonts?.body }}>Start designing</span>
              </div>
            </div>
            <p className={ui.hint}>
              <Link href="/site-builder" className={`${ui.link} ${ui.small}`}>Design the whole site in the website builder</Link>
            </p>
          </div>
        </div>
        {error && <div className={ui.error} role="alert">{error}</div>}
      </>
    ),
  });
}

// ── Step 3: Add products ─────────────────────────────────────────────────────

function ProductsStep({ state, setState, reload, go, frame }: StepProps) {
  const [ssOpen, setSsOpen] = useState(false);
  const [ss, setSs] = useState({ account_number: "", api_key: "" });
  const { busy, error, run } = useStepAction();
  const count = state.products.count;
  const gang = state.products.gang_sheet;

  const connect = () => run(async () => {
    await onboardingService.connectSupplier({ account_number: ss.account_number.trim(), api_key: ss.api_key.trim() });
    await reload();
    setSsOpen(false);
    setSs({ account_number: "", api_key: "" });
  }, "S&S Activewear could not be connected. Check the account number and API key.");

  const notify = () => run(async () => { setState(await onboardingService.notifySanmar()); });

  return frame({
    title: "Add what you sell",
    sub: "Bring in a supplier catalogue, add your own, or start empty.",
    actions: <Footer onBack={() => run(() => go(2))} onSkip={() => run(() => go(4))} onNext={() => run(() => go(4))} busy={busy} />,
    children: (
      <>
        <div className={o.rows}>
          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>S&amp;S Activewear</div>
              <div className={o.rowSub}>Sync blanks and stock.</div>
            </div>
            <div className={o.rowRight}>
              {state.supplier_connected ? (
                <>
                  <span className={o.done}>Connected</span>
                  <Link href="/admin/suppliers" className={`${ui.btn} ${ui.secondary}`}>Import products</Link>
                </>
              ) : (
                <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setSsOpen((v) => !v)} disabled={busy}>
                  Connect
                </button>
              )}
            </div>
          </div>
          {ssOpen && !state.supplier_connected && (
            <div className={o.panel}>
              <p className={o.panelTitle}>Connect S&amp;S Activewear</p>
              <div className={ui.row2}>
                <div className={ui.field}>
                  <label htmlFor="ss-account" className={ui.label}>Account number</label>
                  <input id="ss-account" className={ui.input} autoComplete="off" value={ss.account_number}
                    onChange={(e) => setSs((v) => ({ ...v, account_number: e.target.value }))} />
                </div>
                <div className={ui.field}>
                  <label htmlFor="ss-key" className={ui.label}>API key</label>
                  <input id="ss-key" className={ui.input} type="password" autoComplete="off" value={ss.api_key}
                    onChange={(e) => setSs((v) => ({ ...v, api_key: e.target.value }))} />
                </div>
              </div>
              <p className={ui.hint}>Both are in your S&amp;S Activewear account, under API access.</p>
              <div className={o.actionsLeft}>
                <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={connect}
                  disabled={busy || !ss.account_number.trim() || !ss.api_key.trim()}>
                  {busy ? "Checking…" : "Connect"}
                </button>
                <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setSsOpen(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}

          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>SanMar</div>
              <div className={o.rowSub}>Coming soon.</div>
            </div>
            <div className={o.rowRight}>
              <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={notify} disabled={busy || state.sanmar_notify}>
                {state.sanmar_notify ? "We will tell you" : "Notify me"}
              </button>
            </div>
          </div>

          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>Add a product yourself</div>
              <div className={o.rowSub}>Stocked, made to order, gang sheet and more.</div>
            </div>
            <div className={o.rowRight}>
              {count > 0 && <span className={o.done}>{count} {count === 1 ? "product" : "products"}</span>}
              <Link href="/admin/products/new" className={`${ui.btn} ${ui.secondary}`}>Add product</Link>
            </div>
          </div>

          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>Start with a gang sheet product</div>
              <div className={o.rowSub}>Gang sheet builder, ready to price.</div>
            </div>
            <div className={o.rowRight}>
              {gang > 0 && <span className={o.done}>{gang} gang sheet {gang === 1 ? "product" : "products"}</span>}
              <Link href="/admin/gang-sheets?tab=products" className={`${ui.btn} ${ui.secondary}`}>Set up</Link>
            </div>
          </div>
        </div>
        {error && <div className={ui.error} role="alert">{error}</div>}
      </>
    ),
  });
}

// ── Step 4: Get paid and ship ────────────────────────────────────────────────

const PICKUP_FIELDS: { key: keyof PickupSaved; label: string; wide?: boolean; hint?: string }[] = [
  { key: "name", label: "Place name", hint: "Optional. What buyers look for, like your shop's name." },
  { key: "street1", label: "Street" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP code" },
  { key: "hours", label: "Hours", hint: "For example, Mon to Fri 9 to 5." },
  { key: "note", label: "Cutoff or note", hint: "For example, orders before 3pm are ready the same day." },
];

function GetPaidStep({ state, reload, go, frame }: StepProps) {
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickup, setPickup] = useState<PickupSaved>({ ...state.pickup.saved });
  const { busy, error, run } = useStepAction();
  const stripe = state.stripe;

  const startStripe = () => run(async () => {
    const r = await onboardingService.startStripe();
    window.location.href = r.onboarding_url;
  }, "Stripe could not be opened just now. Please try again.");

  const savePickup = () => run(async () => {
    const place = Object.fromEntries(Object.entries(pickup).map(([k, v]) => [k, String(v ?? "").trim()])) as unknown as PickupSaved;
    await onboardingService.savePickup(place);
    await reload();
    setPickupOpen(false);
  });

  return frame({
    title: "Get paid and ship",
    sub: "Connect payments, then a carrier or pickup.",
    actions: <Footer onBack={() => run(() => go(3))} onSkip={() => run(() => go(5))} onNext={() => run(() => go(5))} busy={busy} />,
    children: (
      <>
        <div className={o.rows}>
          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>Payments with Stripe</div>
              <div className={o.rowSub}>Required to take card orders.</div>
            </div>
            <div className={o.rowRight}>
              {stripe.charges_enabled ? (
                <span className={o.done}>Connected</span>
              ) : stripe.connected || stripe.details_submitted ? (
                <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={startStripe} disabled={busy}>Finish in Stripe</button>
              ) : (
                <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={startStripe} disabled={busy}>Connect Stripe</button>
              )}
            </div>
          </div>

          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>Carriers</div>
              <div className={o.rowSub}>
                {state.carriers.length ? `${state.carriers.join(", ")} connected.` : "UPS, FedEx or USPS to buy labels."}
              </div>
            </div>
            <div className={o.rowRight}>
              {state.carriers.length > 0 && <span className={o.done}>Connected</span>}
              <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setCarrierOpen(true)} disabled={busy}>
                {state.carriers.length ? "Add another" : "Connect a carrier"}
              </button>
            </div>
          </div>

          <div className={o.row}>
            <div className={o.rowText}>
              <div className={o.rowTitle}>Local pickup</div>
              <div className={o.rowSub}>{state.pickup.set ? state.pickup.address : "Address, hours and cutoff."}</div>
            </div>
            <div className={o.rowRight}>
              {state.pickup.set && <span className={o.done}>On</span>}
              <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setPickupOpen((v) => !v)} disabled={busy}>
                {state.pickup.set ? "Change" : "Set up pickup"}
              </button>
            </div>
          </div>
          {pickupOpen && (
            <div className={o.panel}>
              <p className={o.panelTitle}>Where buyers collect their orders</p>
              <div className={ui.row2}>
                {PICKUP_FIELDS.map((f) => (
                  <div className={ui.field} key={f.key}>
                    <label htmlFor={`pk-${f.key}`} className={ui.label}>{f.label}</label>
                    <input id={`pk-${f.key}`} className={ui.input} value={pickup[f.key] ?? ""}
                      onChange={(e) => setPickup((v) => ({ ...v, [f.key]: e.target.value }))} />
                    {f.hint && <p className={ui.hint}>{f.hint}</p>}
                  </div>
                ))}
              </div>
              <div className={o.actionsLeft}>
                <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={savePickup}
                  disabled={busy || !pickup.street1?.trim() || !pickup.city?.trim()}>
                  {busy ? "Saving…" : "Save pickup"}
                </button>
                <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setPickupOpen(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        {error && <div className={ui.error} role="alert">{error}</div>}
        {carrierOpen && (
          // The carrier dialog is the admin's own (Settings, Shipping): it is drawn
          // with the console's parts, so it sits in the console's frame.
          <div className="pc-admin" style={{ display: "contents" }}>
            <ConnectCarrierDialog
              onClose={() => setCarrierOpen(false)}
              onConnected={() => { setCarrierOpen(false); void reload(); }}
            />
          </div>
        )}
      </>
    ),
  });
}

// ── Step 5: Go live ──────────────────────────────────────────────────────────

/** Whether an address answers at all. A shop's address that the platform has
 *  not added yet fails its secure connection, and that is all this asks. */
async function answers(url: string): Promise<boolean> {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), 6000);
  try {
    await fetch(new URL("/api/version", url).toString(), { mode: "no-cors", cache: "no-store", signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function GoLiveStep({ state, go, frame }: StepProps) {
  const router = useRouter();
  const [domainLive, setDomainLive] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);
  const { busy, error, run } = useStepAction();

  useEffect(() => {
    if (!state.domain.host) return;
    onboardingService.checkDomain().then((r) => setDomainLive(r?.status === "live")).catch(() => {});
  }, [state.domain.host]);

  const items: { key: keyof OnboardingState["done"]; label: string; done: boolean; fix: () => void }[] = [
    { key: "business", label: "Business set up", done: state.done.business, fix: () => run(() => go(1)) },
    { key: "branded", label: "Store branded", done: state.done.branded, fix: () => run(() => go(2)) },
    { key: "product", label: "First product added", done: state.done.product, fix: () => run(() => go(3)) },
    { key: "payments", label: "Payments connected", done: state.done.payments, fix: () => run(() => go(4)) },
    { key: "shipping", label: "Carrier or pickup set", done: state.done.shipping, fix: () => run(() => go(4)) },
    { key: "domain", label: "Domain verified, optional", done: domainLive, fix: () => router.push("/admin/settings/domain") },
  ];
  const left = items.filter((i) => !i.done && i.key !== "domain").length;
  const host = state.shop_url.split("://")[1]?.split("/")[0] ?? state.shop_url;

  const open = () => run(async () => {
    // Opened on the click itself, so the browser does not block it; pointed at
    // the shop once it is known to answer, closed again if it does not.
    const tab = window.open("", "_blank");
    try {
      await go(5, { finished: true });
      if (await answers(state.shop_url)) {
        if (tab) {
          tab.opener = null;
          tab.location.href = state.shop_url;
        } else {
          window.open(state.shop_url, "_blank", "noopener");
        }
        router.push("/admin/dashboard");
        return;
      }
      tab?.close();
      setWaiting(host);
    } catch (e) {
      tab?.close();
      throw e;
    }
  });

  return frame({
    title: "Ready to open your store",
    sub: "Check what is left. You can finish later from Home.",
    children: (
      <>
        <ul className={o.checklist}>
          {items.map((i) => (
            <li key={i.key} className={o.check}>
              <span className={`${o.checkDot} ${i.done ? o.checkDotOn : ""}`} aria-hidden />
              <span>{i.label}</span>
              <span className="sr-only">{i.done ? " (done)" : " (not yet)"}</span>
              {!i.done && (
                <button type="button" className={`${ui.link} ${ui.small} ${o.checkFix}`} onClick={i.fix} disabled={busy}>
                  {i.key === "domain" ? "Connect" : "Fix"}
                </button>
              )}
            </li>
          ))}
        </ul>
        {left > 0 && !waiting && (
          <p className={ui.notice} style={{ marginTop: 16 }}>You can open now and finish these from Home.</p>
        )}
        {waiting && (
          <p className={ui.notice} style={{ marginTop: 16 }} role="status">
            Your setup is saved. Your shop&apos;s address, <strong>{waiting}</strong>, is still being switched on by our team,
            so it does not open yet. You can keep working in your admin meanwhile.
          </p>
        )}
        {error && <div className={ui.error} role="alert" style={{ marginTop: 16 }}>{error}</div>}
        <div className={o.goLive}>
          {waiting ? (
            <Link href="/admin/dashboard" className={`${ui.btn} ${ui.primary} ${ui.tall}`}>Go to my admin</Link>
          ) : (
            <button type="button" className={`${ui.btn} ${ui.primary} ${ui.tall}`} onClick={open} disabled={busy}>
              {busy ? "Opening…" : "Open my store"}
            </button>
          )}
          <button type="button" className={`${ui.btn} ${ui.secondary} ${ui.tall}`} onClick={() => router.push("/admin/dashboard")} disabled={busy}>
            Finish later
          </button>
        </div>
      </>
    ),
  });
}

export default OnboardingWizard;
