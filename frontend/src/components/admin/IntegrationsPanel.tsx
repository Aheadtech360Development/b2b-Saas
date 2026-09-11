"use client";

/**
 * IntegrationsPanel — connect the brand's own suppliers and shipping carriers.
 *
 * Renders whatever the backend registry describes: each provider ships its own
 * field list, so adding a carrier or supplier server-side makes it appear here
 * with a working form and no front-end change. That's why nothing in this file
 * names UPS, FedEx or S&S.
 *
 * Secrets are write-only. A saved secret comes back as a hint ("••••a1b2") and
 * the input stays blank — submitting blank keeps the stored value, so re-saving
 * a form never wipes a working credential.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface ProviderField {
  name: string;
  label: string;
  kind: "text" | "secret" | "select";
  help?: string | null;
  required: boolean;
  options: string[];
  placeholder?: string;
}

interface Connection {
  connected: boolean;
  connected_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Provider {
  key: string;
  name: string;
  category: string;
  blurb: string;
  docs_url?: string;
  logo?: string;
  fields: ProviderField[];
  connection: Connection;
}

export function IntegrationsPanel({
  category,
  emptyHint,
  onChanged,
}: {
  /** "supplier" or "carrier" — omit for everything. */
  category?: string;
  emptyHint?: string;
  onChanged?: (providers: Provider[]) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "test" | "save" | "remove">("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<{ providers: Provider[] }>(
        `/api/v1/admin/integrations${category ? `?category=${category}` : ""}`
      );
      setProviders(r.providers ?? []);
      onChanged?.(r.providers ?? []);
    } catch {
      setProviders([]);
    }
    setLoading(false);
    // onChanged is a caller callback; re-running on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => { load(); }, [load]);

  function openForm(p: Provider) {
    setOpenKey(p.key);
    setResult(null);
    // Pre-fill the non-secret values that are already saved.
    const seed: Record<string, string> = {};
    for (const f of p.fields) {
      if (f.kind === "secret") { seed[f.name] = ""; continue; }
      const existing = p.connection?.[f.name];
      seed[f.name] = typeof existing === "string" ? existing : (f.options[0] ?? "");
    }
    setValues(seed);
  }

  async function test(p: Provider) {
    setBusy("test"); setResult(null);
    try {
      const r = await apiClient.post<{ ok: boolean; message: string }>(
        `/api/v1/admin/integrations/${p.key}/test`, { values }
      );
      setResult({ ok: !!r.ok, text: r.message });
    } catch (e) {
      setResult({ ok: false, text: (e as { message?: string })?.message || "Could not test the connection." });
    }
    setBusy("");
  }

  async function connect(p: Provider, force = false) {
    setBusy("save"); setResult(null);
    try {
      const r = await apiClient.post<{ message: string }>(
        `/api/v1/admin/integrations/${p.key}`, { values, force }
      );
      setResult({ ok: true, text: r.message || "Connected." });
      setOpenKey(null);
      await load();
    } catch (e) {
      setResult({ ok: false, text: (e as { message?: string })?.message || "Could not connect." });
    }
    setBusy("");
  }

  async function disconnect(p: Provider) {
    setBusy("remove");
    try {
      await apiClient.delete(`/api/v1/admin/integrations/${p.key}`);
      setOpenKey(null);
      await load();
    } catch { /* the list reload will show the real state */ }
    setBusy("");
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...CARD, height: "150px" }}>
            <div className="at-skel" style={{ height: "14px", width: "45%", marginBottom: "12px" }} />
            <div className="at-skel" style={{ height: "12px", width: "85%", marginBottom: "8px" }} />
            <div className="at-skel" style={{ height: "12px", width: "60%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (!providers.length) {
    return <div style={NOTE}>{emptyHint ?? "Nothing available to connect yet."}</div>;
  }

  return (
    <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
      {providers.map((p) => {
        const isConnected = !!p.connection?.connected;
        const isOpen = openKey === p.key;
        return (
          <div key={p.key} style={{ ...CARD, borderColor: isConnected ? "#1A1A1A" : "#E3E3E3" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "11px" }}>
              <span style={{ fontSize: "24px", lineHeight: 1 }}>{p.logo || "🔌"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{p.name}</span>
                  <span style={isConnected ? PILL_ON : PILL_OFF}>
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#6B6B6B", lineHeight: 1.55, marginTop: "5px" }}>{p.blurb}</p>
              </div>
            </div>

            {isConnected && !isOpen && (
              <div style={{ marginTop: "10px", fontSize: "11px", color: "#8A8A8A", fontFamily: "'IBM Plex Mono', monospace" }}>
                {p.fields
                  .filter((f) => f.kind !== "secret" && p.connection?.[f.name])
                  .map((f) => `${f.label}: ${String(p.connection[f.name])}`)
                  .join("  ·  ")}
              </div>
            )}

            {!isOpen ? (
              <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                <button onClick={() => openForm(p)} style={isConnected ? BTN_LIGHT : BTN_DARK}>
                  {isConnected ? "Manage" : "Connect"}
                </button>
                {p.docs_url && (
                  <a href={p.docs_url} target="_blank" rel="noreferrer" style={{ ...BTN_LIGHT, textDecoration: "none", display: "inline-block" }}>
                    Where do I find these?
                  </a>
                )}
              </div>
            ) : (
              <div style={{ marginTop: "14px", borderTop: "1px solid #F1F1F1", paddingTop: "14px" }}>
                {p.fields.map((f) => {
                  const hint = p.connection?.[`${f.name}_hint`];
                  const isSet = !!p.connection?.[`${f.name}_set`];
                  return (
                    <div key={f.name} style={{ marginBottom: "11px" }}>
                      <label style={LABEL}>
                        {f.label}{!f.required && <span style={{ color: "#9CA3AF", fontWeight: 500 }}> (optional)</span>}
                      </label>
                      {f.kind === "select" ? (
                        <select value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} style={INPUT}>
                          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          // Chrome ignores autoComplete="off" on a text field and
                          // will happily drop the admin's own email into "API key"
                          // and their password into "Secret key" — which then fails
                          // to connect for no visible reason. "new-password" is the
                          // one value it honours, and a name it can't recognise
                          // keeps its heuristics out of these fields.
                          type={f.kind === "secret" ? "password" : "text"}
                          name={`${p.key}__${f.name}`}
                          value={values[f.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                          placeholder={f.kind === "secret" && isSet ? `Saved — ${hint}. Leave blank to keep it.` : (f.placeholder || "")}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-1p-ignore
                          data-lpignore="true"
                          style={INPUT}
                        />
                      )}
                      {f.help && <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px", lineHeight: 1.5 }}>{f.help}</div>}
                    </div>
                  );
                })}

                {result && (
                  <div style={{ ...RESULT, background: result.ok ? "#F0FDF4" : "#FEF2F2", borderColor: result.ok ? "#86EFAC" : "#FCA5A5", color: result.ok ? "#166534" : "#991B1B" }}>
                    {result.text}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button onClick={() => connect(p)} disabled={!!busy} style={BTN_DARK}>
                    {busy === "save" ? "Connecting…" : "Test & connect"}
                  </button>
                  <button onClick={() => test(p)} disabled={!!busy} style={BTN_LIGHT}>
                    {busy === "test" ? "Testing…" : "Test only"}
                  </button>
                  <button onClick={() => { setOpenKey(null); setResult(null); }} style={BTN_PLAIN}>Cancel</button>
                  {isConnected && (
                    <button onClick={() => disconnect(p)} disabled={!!busy} style={{ ...BTN_PLAIN, color: "#B91C1C", marginLeft: "auto" }}>
                      {busy === "remove" ? "Removing…" : "Disconnect"}
                    </button>
                  )}
                </div>

                {result && !result.ok && (
                  <button onClick={() => connect(p, true)} disabled={!!busy}
                    style={{ ...BTN_PLAIN, marginTop: "8px", color: "#6B6B6B" }}>
                    Save anyway without testing
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CARD: React.CSSProperties = { background: "#fff", border: "1.5px solid #E3E3E3", borderRadius: "10px", padding: "16px 18px" };
const NOTE: React.CSSProperties = { background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "16px", fontSize: "13px", color: "#6B6B6B" };
const LABEL: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B6B6B", marginBottom: "5px" };
const INPUT: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", background: "#fff" };
const RESULT: React.CSSProperties = { marginTop: "10px", border: "1px solid", borderRadius: "8px", padding: "9px 12px", fontSize: "12px", lineHeight: 1.55, fontWeight: 600 };
const PILL_ON: React.CSSProperties = { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", background: "#1A1A1A", color: "#fff", borderRadius: "20px", padding: "2px 9px" };
const PILL_OFF: React.CSSProperties = { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", background: "#F1F1F0", color: "#8A8A8A", borderRadius: "20px", padding: "2px 9px" };
const BTN_DARK: React.CSSProperties = { padding: "9px 16px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const BTN_LIGHT: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const BTN_PLAIN: React.CSSProperties = { padding: "9px 10px", background: "none", color: "#6B6B6B", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
