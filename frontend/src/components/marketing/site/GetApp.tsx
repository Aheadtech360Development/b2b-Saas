"use client";

/**
 * printcopilot.co/get-app?code=XXXXXX — what a shop's QR square opens.
 *
 * Any phone camera can read the square; the app may not be installed yet.
 * So this page names the shop, says how to get the app, shows the code to
 * type, and opens the app straight at the shop (printcopilot://apply) for a
 * buyer who has it. Looked up from the buyer's own browser: the lookup is
 * rate limited per visitor, and a server-side call would share one limit
 * among everybody.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Found = {
  name: string;
  logo_url: string | null;
  url: string | null;
  wholesale_signup: boolean;
  app_store_url: string | null;
  play_store_url: string | null;
};
type State =
  | { kind: "loading" }
  | { kind: "found"; shop: Found; code: string }
  | { kind: "notOnApp"; message: string; url: string | null }
  | { kind: "missing" };

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function cleanCode(raw: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

const CSS = `
.ga{background:#F6F8FB;padding:56px 20px 88px}
.ga-card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #E3E8EF;border-radius:16px;padding:32px 28px;text-align:center}
.ga-logo{max-height:56px;max-width:200px;object-fit:contain;margin:0 auto 14px;display:block}
.ga h1{font-family:Outfit,sans-serif;font-size:28px;line-height:34px;color:#0C1E35;margin:0;font-weight:600}
.ga p{color:#3A4A5E;font-size:15px;line-height:23px;margin:10px 0 0}
.ga-code{margin:22px auto 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:.2em;color:#0C1E35;background:#F6F8FB;border:1px dashed #C7D0DD;border-radius:12px;padding:12px 8px}
.ga ol{text-align:left;margin:22px 0 0;padding-left:22px;color:#3A4A5E;font-size:15px;line-height:23px;display:grid;gap:8px}
.ga-btns{display:grid;gap:10px;margin-top:24px}
.ga-btn{display:block;height:50px;line-height:50px;border-radius:12px;font-weight:600;font-size:16px;text-decoration:none;background:#0B66E4;color:#fff}
.ga-btn.ga-q{background:#fff;color:#0C1E35;border:1px solid #C7D0DD}
.ga-note{font-size:13px!important;color:#5A6A7E!important}
@media (max-width:560px){.ga{padding:32px 16px 64px}.ga-card{padding:26px 18px}.ga h1{font-size:24px;line-height:30px}.ga-code{font-size:28px}}
`;

export default function GetApp() {
  const params = useSearchParams();
  const code = cleanCode(params.get("code"));
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (code.length !== 6) { setState({ kind: "missing" }); return; }
    let live = true;
    fetch(`${API}/api/v1/storefront/by-code/${code}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) setState({ kind: "found", shop: body as Found, code });
        else if (res.status === 403 && body?.detail?.code === "not_on_app") {
          setState({ kind: "notOnApp", message: String(body.detail.message ?? ""), url: body.detail.url ?? null });
        } else setState({ kind: "missing" });
      })
      .catch(() => { if (live) setState({ kind: "missing" }); });
    return () => { live = false; };
  }, [code]);

  return (
    <div className="ga">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ga-card">
        {state.kind === "loading" ? <p>Finding the shop…</p> : null}
        {state.kind === "missing" ? (
          <>
            <h1>We could not find that shop</h1>
            <p>Check the code with the shop that gave it to you. It is six letters and numbers.</p>
          </>
        ) : null}
        {state.kind === "notOnApp" ? (
          <>
            <h1>This shop is not on the app</h1>
            <p>{state.message}</p>
            {state.url ? <div className="ga-btns"><a className="ga-btn" href={state.url}>Go to the website</a></div> : null}
          </>
        ) : null}
        {state.kind === "found" ? <ShopFound shop={state.shop} code={state.code} /> : null}
      </div>
    </div>
  );
}

function ShopFound({ shop, code }: { shop: Found; code: string }) {
  const inStores = !!(shop.app_store_url || shop.play_store_url);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shop.logo_url ? <img className="ga-logo" src={shop.logo_url} alt="" /> : null}
      <h1>Shop with {shop.name} in the PrintCoPilot app</h1>
      <div className="ga-code" aria-label={`Shop code ${code.split("").join(" ")}`}>{code}</div>
      <ol>
        <li>Get the PrintCoPilot app on your phone.</li>
        {shop.wholesale_signup ? (
          <>
            <li>Already buy from {shop.name}? Sign in with the same email and password.</li>
            <li>New here? Tap Apply and enter the code above to ask {shop.name} for a wholesale account.</li>
          </>
        ) : (
          <li>Sign in with the email and password of your {shop.name} account.</li>
        )}
      </ol>
      <div className="ga-btns">
        {shop.app_store_url ? <a className="ga-btn" href={shop.app_store_url}>Get it on the App Store</a> : null}
        {shop.play_store_url ? <a className="ga-btn" href={shop.play_store_url}>Get it on Google Play</a> : null}
        {shop.wholesale_signup ? (
          <a className="ga-btn ga-q" href={`printcopilot://apply?code=${code}`}>I have the app: open it</a>
        ) : null}
        {shop.url ? <a className="ga-btn ga-q" href={shop.url}>Shop on the website instead</a> : null}
      </div>
      {!inStores ? (
        <p className="ga-note">The PrintCoPilot app is not in the App Store and Google Play yet. Until it is, you can order on {shop.name}&apos;s website.</p>
      ) : null}
    </>
  );
}
