"use client";

import { ask } from "@/lib/dialog";
/**
 * The shop's own domain.
 *
 * Until it has one, a shop lives at `<slug>.printcopilot.co`. Most buy one
 * eventually and want the whole site to answer there. Everything on our side
 * already follows the address a request arrives at — the theme, the checkout,
 * the links in its emails — so this is only the record that says the address
 * belongs to this shop, plus the DNS the shop has to add.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

interface Record_ { type: string; host: string; value: string; note?: string }
interface DomainState {
  domain: string | null;
  platform_address?: string | null;
  records: Record_[];
  status: "none" | "pending" | "live";
  message: string;
}

export function DomainPanel() {
  const [state, setState] = useState<DomainState | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<DomainState>("/api/v1/admin/storefront/domain")
      .then((r) => { setState(r); setDraft(r.domain ?? ""); })
      .catch(() => setError("Could not read this shop's domain."));
  }, []);

  useEffect(load, [load]);

  async function save(domain: string) {
    setBusy("save");
    setError(null);
    try {
      const r = await apiClient.put<DomainState>("/api/v1/admin/storefront/domain", { domain });
      setState(r);
      setDraft(r.domain ?? "");
    } catch (e) {
      setError(e instanceof ApiClientError && e.message ? e.message : "Could not save that domain.");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    setError(null);
    try {
      setState(await apiClient.post<DomainState>("/api/v1/admin/storefront/domain/check"));
    } catch {
      setError("Could not check it just now.");
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <p className="ui-hint">Loading…</p>;

  return (
    <div>
      {!state.domain ? (
        <>
          <p className="ui-hint" style={{ marginBottom: "14px", lineHeight: 1.65 }}>
            Your shop is live at{" "}
            <strong className="ui-num">{state.platform_address}</strong>. If you have bought a
            domain of your own — from Namecheap, GoDaddy, anywhere — put it here and your whole
            shop will answer there instead.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              className="ui-field"
              style={{ flex: "1 1 260px", minWidth: 0 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) save(draft); }}
              placeholder="shop.yourbrand.com"
              aria-label="Your domain"
            />
            <button
              className="ui-btn"
              disabled={!draft.trim() || busy === "save"}
              onClick={() => save(draft)}
            >
              {busy === "save" ? "Saving…" : "Use this domain"}
            </button>
          </div>
          {error && <p className="ui-hint ui-hint-bad">{error}</p>}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span className="ui-num" style={{ fontSize: "18px", fontWeight: 700 }}>{state.domain}</span>
            <span
              style={{
                fontSize: "11.5px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px",
                background: state.status === "live" ? "#ECFDF5" : "#FFFBEB",
                color: state.status === "live" ? "#047857" : "#B45309",
                border: `1px solid ${state.status === "live" ? "#A7F3D0" : "#FDE68A"}`,
              }}
            >
              {state.status === "live" ? "Live" : "Waiting for DNS"}
            </span>
          </div>

          {state.message && <p className="ui-hint" style={{ marginBottom: "14px" }}>{state.message}</p>}

          {state.status !== "live" && (
            <>
              <p className="ui-hint" style={{ marginBottom: "12px", lineHeight: 1.65 }}>
                Add these where you bought the domain. It usually takes a few minutes, and can
                take up to an hour. Your shop keeps working at{" "}
                <strong className="ui-num">{state.platform_address}</strong> the whole time.
              </p>
              <div style={{ overflowX: "auto", marginBottom: "14px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px", minWidth: "460px" }}>
                  <thead>
                    <tr>
                      {["Type", "Host", "Value"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0 12px 8px 0", fontSize: "11.5px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ui-muted)", fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.records.map((r) => (
                      <tr key={r.type + r.host} style={{ borderTop: "1px solid var(--ui-line)" }}>
                        <td className="ui-num" style={{ padding: "10px 12px 10px 0", fontWeight: 700 }}>{r.type}</td>
                        <td className="ui-num" style={{ padding: "10px 12px 10px 0" }}>{r.host}</td>
                        <td className="ui-num" style={{ padding: "10px 0", wordBreak: "break-all" }}>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.records.some((r) => r.note) && (
                <ul className="ui-hint" style={{ margin: "0 0 14px", paddingLeft: "18px", lineHeight: 1.7 }}>
                  {state.records.filter((r) => r.note).map((r) => <li key={r.type + r.host}>{r.note}</li>)}
                </ul>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="ui-btn-ghost" disabled={busy === "check"} onClick={check}>
              {busy === "check" ? "Checking…" : "Check it now"}
            </button>
            <button
              className="ui-btn-quiet"
              disabled={busy === "save"}
              onClick={async () => {
                if (await ask(
                  `Stop using ${state.domain}?\n\nYour shop goes back to ${state.platform_address}, ` +
                  "which has been working the whole time.",
                )) save("");
              }}
            >
              Stop using this domain
            </button>
          </div>
          {error && <p className="ui-hint ui-hint-bad">{error}</p>}
        </>
      )}
    </div>
  );
}

export default DomainPanel;
