"use client";

/**
 * Two-step sign-in (design screen 12: Turn on two-step sign-in).
 *
 * Scan the code with an authenticator app, type the six digits it shows, and
 * the second step is on; the backup codes are shown once, right after. The
 * code to scan is drawn by the server (api/v1/two_factor.setup, `qr_svg`), and
 * the key beside it is the same secret for anyone who cannot scan.
 */
import { useEffect, useState } from "react";
import { PasswordField } from "@/components/ui/PasswordField";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import { authService } from "@/services/auth.service";

type Stage = "idle" | "setup" | "backup" | "disabling";

/** The key in groups of four, as authenticator apps print it. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

function SecurityPageBody() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { authService.twoFaStatus().then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)); }, []);

  async function startSetup() {
    setError(null); setBusy(true);
    try {
      const r = await authService.twoFaSetup();
      setSecret(r.secret); setOtpauth(r.otpauth_uri); setQr(r.qr_svg ?? null); setCode(""); setStage("setup");
    } catch (e) { setError((e as { message?: string })?.message || "Could not start setup."); }
    finally { setBusy(false); }
  }

  async function confirmEnable(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.trim().length < 6 || busy) return;
    setError(null); setBusy(true);
    try {
      const r = await authService.twoFaEnable(code.trim());
      setBackupCodes(r.backup_codes); setStage("backup"); setEnabled(true); setCopied(false);
    } catch (e2) { setError((e2 as { message?: string })?.message || "Incorrect code."); }
    finally { setBusy(false); }
  }

  async function disable(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password || !code || busy) return;
    setError(null); setBusy(true);
    try {
      await authService.twoFaDisable(password, code.trim());
      setEnabled(false); setStage("idle"); setPassword(""); setCode("");
    } catch (e2) { setError((e2 as { message?: string })?.message || "Could not turn it off."); }
    finally { setBusy(false); }
  }

  function copyCodes() {
    navigator.clipboard?.writeText(backupCodes.join("\n")).then(() => setCopied(true)).catch(() => {});
  }

  return (
    <section className="pc-card pc-pad" style={{ maxWidth: "640px" }} aria-labelledby="tfa-title">
      {stage === "idle" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h2 className="pc-h2" id="tfa-title">Two-step sign-in</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>
              {enabled == null ? "Checking…"
                : enabled ? "On. Signing in asks for a code from your authenticator app."
                  : "Off. Add a second step to your sign-in with an authenticator app."}
            </p>
          </div>
          {enabled != null && (
            enabled
              ? <button type="button" className="pc-btn" data-kind="danger" onClick={() => { setStage("disabling"); setError(null); setCode(""); }}>Turn off</button>
              : <button type="button" className="pc-btn" data-kind="primary" onClick={startSetup} disabled={busy}>{busy ? "Starting…" : "Turn on"}</button>
          )}
        </div>
      )}

      {error && <div className="pc-flash" data-bad="" role="alert" style={{ marginTop: stage === "idle" ? "16px" : 0 }}>{error}</div>}

      {stage === "setup" && (
        <form onSubmit={confirmEnable}>
          <h2 className="pc-h2" id="tfa-title">Turn on two-step sign-in</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 18px" }}>
            Scan the code with an authenticator app, then enter the six digits.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", marginBottom: "18px" }}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- a QR code drawn by the server as a data URI
              <img src={qr} alt="QR code for your authenticator app" width={132} height={132}
                style={{ border: "1px solid var(--pc-line)", borderRadius: "8px", padding: "4px", background: "#fff" }} />
            ) : null}
            <div style={{ fontSize: "13.5px", color: "var(--pc-muted)", lineHeight: 1.6, minWidth: 0, flex: "1 1 220px" }}>
              Can&apos;t scan? Enter this key:
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "15px", color: "var(--pc-ink)", letterSpacing: ".06em", wordBreak: "break-all", marginTop: "4px" }}>
                {grouped(secret)}
              </div>
              <a href={otpauth} className="pc-link" style={{ display: "inline-block", marginTop: "6px", fontSize: "13px" }}>Open in my authenticator app</a>
            </div>
          </div>
          <label className="pc-label" htmlFor="tfa-code">Six digit code</label>
          <input id="tfa-code" className="pc-input" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus
            style={{ letterSpacing: ".2em", fontSize: "18px" }} />
          <div className="pc-row-actions" style={{ marginTop: "16px" }}>
            <button type="submit" className="pc-btn" data-kind="primary" disabled={busy || code.trim().length < 6}>
              {busy ? "Checking…" : "Turn on"}
            </button>
            <button type="button" className="pc-btn" onClick={() => { setStage("idle"); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {stage === "backup" && (
        <div>
          <h2 className="pc-h2" id="tfa-title">Two-step sign-in is on</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 14px" }}>
            Save these backup codes. Each one works once if you lose your phone, and you will not see them again.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 16px", background: "#F6F8FB", border: "1px solid var(--pc-line)", borderRadius: "8px", padding: "14px 16px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "14px", color: "var(--pc-ink)" }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <div className="pc-row-actions" style={{ marginTop: "16px" }}>
            <button type="button" className="pc-btn" onClick={copyCodes}>{copied ? "Copied" : "Copy codes"}</button>
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => setStage("idle")}>Done</button>
          </div>
        </div>
      )}

      {stage === "disabling" && (
        <form onSubmit={disable}>
          <h2 className="pc-h2" id="tfa-title">Turn off two-step sign-in</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 16px" }}>Confirm your password and a current code (or a backup code).</p>
          <label className="pc-label" htmlFor="tfa-password">Password</label>
          <PasswordField id="tfa-password" className="pc-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <label className="pc-label" htmlFor="tfa-off-code" style={{ marginTop: "14px" }}>Six digit or backup code</label>
          <input id="tfa-off-code" className="pc-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
          <div className="pc-row-actions" style={{ marginTop: "16px" }}>
            <button type="submit" className="pc-btn" data-kind="danger" disabled={busy || !password || !code}>{busy ? "Turning off…" : "Turn off"}</button>
            <button type="button" className="pc-btn" onClick={() => { setStage("idle"); setError(null); setPassword(""); setCode(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}


/** This screen as one of the Settings screens (components/admin/settings/SettingsFrame). */
export default function SecurityPage() {
  return (
    <SettingsFrame active="account" title="My account" sub="Add a second step to your sign-in with an authenticator app.">
      <SecurityPageBody />
    </SettingsFrame>
  );
}
