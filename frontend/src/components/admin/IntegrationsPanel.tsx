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
      <div className="pc-tiles">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pc-tile">
            <div className="at-skel" style={{ height: "16px", width: "45%", marginBottom: "12px", borderRadius: "6px" }} />
            <div className="at-skel" style={{ height: "12px", width: "70%", borderRadius: "6px" }} />
          </div>
        ))}
      </div>
    );
  }

  if (!providers.length) {
    return <div className="pc-note">{emptyHint ?? "Nothing available to connect yet."}</div>;
  }

  return (
    <div className="pc-tiles" data-integrations={category ?? "all"}>
      {providers.map((p) => {
        const isConnected = !!p.connection?.connected;
        const isOpen = openKey === p.key;
        const saved = p.fields
          .filter((f) => f.kind !== "secret" && p.connection?.[f.name])
          .map((f) => `${f.label}: ${String(p.connection[f.name])}`)
          .join(" · ");
        return (
          <div key={p.key} className="pc-tile" data-provider={p.key} data-open={isOpen ? "" : undefined}>
            <div className="pc-tile-name">{p.name}</div>
            <div><span className="pc-pill" data-tone={isConnected ? "green" : "amber"} style={{ textTransform: "none" }}>{isConnected ? "Connected" : "Not connected"}</span></div>
            {isConnected && !isOpen && saved && <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{saved}</div>}

            {!isOpen ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                <button type="button" className="pc-btn" onClick={() => openForm(p)}>{isConnected ? "Manage" : "Connect"}</button>
              </div>
            ) : (
              <div className="pc-tile-form">
                {p.blurb && <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>{p.blurb}</p>}
                {p.fields.map((f) => {
                  const hint = p.connection?.[`${f.name}_hint`];
                  const isSet = !!p.connection?.[`${f.name}_set`];
                  return (
                    <div key={f.name}>
                      <label className="pc-label" htmlFor={`${p.key}__${f.name}`}>
                        {f.label}{!f.required && <span style={{ color: "var(--pc-muted)", fontWeight: 400 }}> (optional)</span>}
                      </label>
                      {f.kind === "select" ? (
                        <select id={`${p.key}__${f.name}`} className="pc-input" value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
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
                          id={`${p.key}__${f.name}`}
                          className="pc-input"
                          type={f.kind === "secret" ? "password" : "text"}
                          name={`${p.key}__${f.name}`}
                          value={values[f.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                          placeholder={f.kind === "secret" && isSet ? `Saved, ${hint}. Leave blank to keep it.` : (f.placeholder || "")}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-1p-ignore
                          data-lpignore="true"
                        />
                      )}
                      {f.help && <div className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "5px" }}>{f.help}</div>}
                    </div>
                  );
                })}

                {result && <div className="pc-note" data-tone={result.ok ? "green" : "red"} role="status">{result.text}</div>}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" className="pc-btn" data-kind="primary" onClick={() => connect(p)} disabled={!!busy}>
                    {busy === "save" ? "Connecting…" : "Test and connect"}
                  </button>
                  <button type="button" className="pc-btn" onClick={() => test(p)} disabled={!!busy}>
                    {busy === "test" ? "Testing…" : "Test only"}
                  </button>
                  <button type="button" className="pc-link" onClick={() => { setOpenKey(null); setResult(null); }}>Cancel</button>
                  {p.docs_url && <a href={p.docs_url} target="_blank" rel="noreferrer" className="pc-link">Where do I find these?</a>}
                  {isConnected && (
                    <button type="button" className="pc-link" onClick={() => disconnect(p)} disabled={!!busy} style={{ color: "#B91C1C", marginLeft: "auto" }}>
                      {busy === "remove" ? "Removing…" : "Disconnect"}
                    </button>
                  )}
                </div>

                {result && !result.ok && (
                  <button type="button" className="pc-link" onClick={() => connect(p, true)} disabled={!!busy} style={{ justifySelf: "start" }}>
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
