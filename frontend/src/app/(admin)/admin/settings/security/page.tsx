"use client";

import { useEffect, useState } from "react";
import { authService } from "@/services/auth.service";

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "22px", maxWidth: "560px" };
const BTN: React.CSSProperties = { border: "none", color: "#fff", padding: "10px 18px", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const INPUT: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "14px" };

type Stage = "idle" | "setup" | "backup" | "disabling";

export default function SecurityPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { authService.twoFaStatus().then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)); }, []);

  async function startSetup() {
    setError(null); setBusy(true);
    try {
      const r = await authService.twoFaSetup();
      setSecret(r.secret); setOtpauth(r.otpauth_uri); setCode(""); setStage("setup");
    } catch (e) { setError((e as { message?: string })?.message || "Could not start setup."); }
    finally { setBusy(false); }
  }

  async function confirmEnable() {
    setError(null); setBusy(true);
    try {
      const r = await authService.twoFaEnable(code.trim());
      setBackupCodes(r.backup_codes); setStage("backup"); setEnabled(true);
    } catch (e) { setError((e as { message?: string })?.message || "Incorrect code."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setError(null); setBusy(true);
    try {
      await authService.twoFaDisable(password, code.trim());
      setEnabled(false); setStage("idle"); setPassword(""); setCode("");
    } catch (e) { setError((e as { message?: string })?.message || "Could not disable."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>Security</h1>
      <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "20px" }}>Add a second step to your sign-in with an authenticator app.</p>

      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stage === "idle" ? 0 : "18px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>Two-factor authentication</div>
            <div style={{ fontSize: "13px", color: enabled ? "#166534" : "#9A3412", fontWeight: 600, marginTop: "3px" }}>
              {enabled == null ? "…" : enabled ? "● Enabled" : "○ Not enabled"}
            </div>
          </div>
          {stage === "idle" && enabled != null && (
            enabled
              ? <button onClick={() => { setStage("disabling"); setError(null); }} style={{ ...BTN, background: "#fff", color: "#B91C1C", border: "1px solid #F0C9C9" }}>Disable</button>
              : <button onClick={startSetup} disabled={busy} style={{ ...BTN, background: "var(--brand-primary, #1C3557)" }}>{busy ? "…" : "Enable 2FA"}</button>
          )}
        </div>

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "9px 12px", borderRadius: "7px", fontSize: "13px", marginBottom: "14px" }}>{error}</div>}

        {stage === "setup" && (
          <div>
            <div style={{ fontSize: "13px", color: "#444", marginBottom: "10px" }}>
              1. In your authenticator app (Google Authenticator, Authy, etc.) add an account and <strong>enter this setup key</strong>:
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "16px", letterSpacing: "0.12em", background: "#FBFBF9", border: "1px solid #E8E6E1", borderRadius: "8px", padding: "12px", textAlign: "center", wordBreak: "break-all", marginBottom: "8px" }}>{secret}</div>
            <a href={otpauth} style={{ fontSize: "12px", color: "var(--brand-primary,#1C3557)", fontWeight: 600, textDecoration: "none" }}>Open in authenticator app →</a>
            <div style={{ fontSize: "13px", color: "#444", margin: "16px 0 6px" }}>2. Enter the 6-digit code it shows:</div>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" style={{ ...INPUT, textAlign: "center", letterSpacing: "0.15em", fontSize: "18px" }} />
            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button onClick={confirmEnable} disabled={busy || code.trim().length < 6} style={{ ...BTN, background: busy || code.trim().length < 6 ? "#9ca3af" : "var(--brand-primary, #1C3557)" }}>{busy ? "Verifying…" : "Confirm & enable"}</button>
              <button onClick={() => { setStage("idle"); setError(null); }} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2" }}>Cancel</button>
            </div>
          </div>
        )}

        {stage === "backup" && (
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#166534", marginBottom: "8px" }}>✓ Two-factor is on. Save your backup codes.</div>
            <p style={{ fontSize: "13px", color: "#666", marginBottom: "12px" }}>Each code works once if you lose your device. Store them somewhere safe — you won&apos;t see them again.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "#FBFBF9", border: "1px solid #E8E6E1", borderRadius: "8px", padding: "14px", fontFamily: "monospace", fontSize: "14px" }}>
              {backupCodes.map((c) => <div key={c} style={{ textAlign: "center" }}>{c}</div>)}
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(backupCodes.join("\n")).catch(() => {}); }} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2", marginTop: "12px" }}>Copy codes</button>
            <button onClick={() => setStage("idle")} style={{ ...BTN, background: "var(--brand-primary, #1C3557)", marginTop: "12px", marginLeft: "10px" }}>Done</button>
          </div>
        )}

        {stage === "disabling" && (
          <div>
            <p style={{ fontSize: "13px", color: "#444", marginBottom: "12px" }}>Confirm your password and a current code to turn off two-factor.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" style={{ ...INPUT, marginBottom: "10px" }} />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit or backup code" style={INPUT} />
            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button onClick={disable} disabled={busy || !password || !code} style={{ ...BTN, background: busy || !password || !code ? "#9ca3af" : "#B91C1C" }}>{busy ? "…" : "Disable 2FA"}</button>
              <button onClick={() => { setStage("idle"); setError(null); setPassword(""); setCode(""); }} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
