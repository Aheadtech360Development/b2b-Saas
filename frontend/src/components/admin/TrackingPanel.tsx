"use client";

/**
 * Connect this store's own tracking tools.
 *
 * Entirely driven by the registry the API returns, so a tool added on the
 * backend appears here with no change to this file.
 *
 * Nothing here is a secret — these are the public IDs that appear in any site's
 * page source — so values are shown in full rather than masked, which is what
 * lets an admin check one against the tab they copied it from.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Tool {
  key: string;
  name: string;
  field_label: string;
  blurb: string;
  placeholder: string;
  where: string;
  docs_url: string;
}

interface ToolValue {
  id: string;
  enabled: boolean;
}

interface Config {
  enabled: boolean;
  tools: Record<string, ToolValue>;
  head_snippet: string;
  body_snippet: string;
  track_products: boolean;
  track_checkout: boolean;
}

export function TrackingPanel() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  // A save the admin has to confirm, because one of the IDs does not look
  // right. Holds the message they are confirming past.
  const [confirmProblem, setConfirmProblem] = useState<string | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ config: Config; tools: Tool[] }>("/api/v1/admin/analytics-settings")
      .then(data => { setConfig(data.config); setTools(data.tools); })
      .catch(() => setNote({ kind: "error", text: "Could not load your tracking settings." }))
      .finally(() => setLoading(false));
  }, []);

  function setTool(key: string, patch: Partial<ToolValue>) {
    setConfig(prev => {
      if (!prev) return prev;
      // A tool added on the backend since this config was saved has no entry
      // yet, so start it from blank rather than spreading undefined.
      const current: ToolValue = prev.tools[key] ?? { id: "", enabled: false };
      return { ...prev, tools: { ...prev.tools, [key]: { ...current, ...patch } } };
    });
  }

  async function save(force = false) {
    if (!config) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await apiClient.put<{ config: Config; message: string; warnings: string[] }>(
        "/api/v1/admin/analytics-settings", { config, force }
      );
      // Show what was saved: a pasted install snippet comes back as just its ID.
      if (res.config) setConfig(res.config);
      setConfirmProblem(null);
      setNote({ kind: res.warnings?.length ? "warn" : "ok", text: res.message });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not save.";
      // A format complaint is a question, not a dead end: the admin is looking
      // at the real value and may well be right.
      if (/does not look like/.test(text)) setConfirmProblem(text);
      else setNote({ kind: "error", text });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="pc-sub-line" style={{ margin: 0 }}>Loading…</p>;
  if (!config) return <div className="pc-note" data-tone="red">Tracking settings are unavailable.</div>;

  const connected = tools.filter(t => config.tools[t.key]?.enabled && config.tools[t.key]?.id).length;

  return (
    <div style={{ display: "grid", gap: "18px" }} data-tracking-panel>
      {/* The master switch */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", border: "1px solid var(--pc-line)", borderRadius: "10px", background: "#F8FAFC", cursor: "pointer" }}>
        <input type="checkbox" className="pc-check" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} style={{ marginTop: "2px" }} />
        <span>
          <span style={{ display: "block", fontSize: "14.5px", fontWeight: 600 }}>Track visitors on my storefront</span>
          <span className="pc-sub-line" style={{ display: "block", margin: "2px 0 0", fontSize: "13.5px" }}>
            {config.enabled
              ? `${connected} tool${connected === 1 ? "" : "s"} connected. Only the ones you switch on below are loaded.`
              : "Off: your storefront loads no tracking scripts at all."}
          </span>
        </span>
      </label>

      {config.enabled && (
        <>
          {/* What to send */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", padding: "0 2px" }}>
            {([
              ["track_products", "Product views and add-to-cart"],
              ["track_checkout", "Checkout and purchases"],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                <input type="checkbox" className="pc-check" checked={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>

          {/* One card per tool */}
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {tools.map(tool => {
              const value = config.tools[tool.key] ?? { id: "", enabled: false };
              const live = value.enabled && !!value.id;
              return (
                <div key={tool.key} data-tool={tool.key} data-live={live ? "" : undefined}
                  style={{ border: live ? "1.5px solid var(--pc-blue)" : "1px solid var(--pc-line)", borderRadius: "10px", padding: "14px 16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "14.5px", fontWeight: 600 }}>{tool.name}</p>
                      <p className="pc-sub-line" style={{ margin: "2px 0 0", fontSize: "12.5px" }}>{tool.blurb}</p>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, fontSize: "13px", cursor: "pointer" }}>
                      <input type="checkbox" className="pc-check" checked={value.enabled} onChange={e => setTool(tool.key, { enabled: e.target.checked })} />
                      On
                    </label>
                  </div>
                  <label style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
                    <span className="pc-label">{tool.field_label}</span>
                    <input type="text" className="pc-input" value={value.id} placeholder={tool.placeholder} spellCheck={false}
                      onChange={e => setTool(tool.key, { id: e.target.value })} style={{ fontVariantNumeric: "tabular-nums" }} />
                  </label>
                  {tool.where && (
                    <p className="pc-sub-line" style={{ margin: "6px 0 0", fontSize: "12px", lineHeight: 1.45 }}>
                      {tool.where}{" "}
                      {tool.docs_url && <a href={tool.docs_url} target="_blank" rel="noopener noreferrer" className="pc-link" style={{ fontSize: "12px" }}>Guide</a>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* The escape hatch */}
          <details className="pc-card pc-details" open={showSnippets} onToggle={e => setShowSnippets((e.target as HTMLDetailsElement).open)}>
            <summary><span style={{ fontWeight: 600 }}>Something else</span><span className="pc-link pc-details-more" aria-hidden /></summary>
            <div style={{ padding: "0 20px 18px", display: "grid", gap: "12px" }}>
              <p className="pc-sub-line" style={{ margin: 0, fontSize: "13px" }}>
                For a tool that is not on the list. Paste the code it gave you: it runs on your storefront only, never on another store.
              </p>
              {([
                ["head_snippet", "Runs on every page"],
                ["body_snippet", "Added to the page body (for a no-script fallback)"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "grid", gap: "6px" }}>
                  <span className="pc-label">{label}</span>
                  <textarea className="pc-input" rows={4} spellCheck={false} value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })}
                    style={{ height: "auto", padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", resize: "vertical" }} />
                </label>
              ))}
            </div>
          </details>
        </>
      )}

      {confirmProblem && (
        <div className="pc-note" style={{ display: "grid", gap: "8px" }}>
          <span>{confirmProblem}</span>
          <span style={{ fontSize: "12.5px" }}>If you copied it straight from the tool, save it anyway: we may simply not recognise a newer format.</span>
          <div className="pc-row-actions">
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => save(true)}>Save it anyway</button>
            <button type="button" className="pc-btn" onClick={() => setConfirmProblem(null)}>Let me fix it</button>
          </div>
        </div>
      )}

      {note && (
        <div className="pc-note" data-tone={note.kind === "ok" ? "green" : note.kind === "warn" ? undefined : "red"} role="status">{note.text}</div>
      )}

      <div className="pc-row-actions">
        <button type="button" className="pc-btn" data-kind="primary" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save tracking"}</button>
        <span className="pc-sub-line" style={{ margin: 0, fontSize: "12.5px" }}>Changes take effect the next time a shopper loads your storefront.</span>
      </div>
    </div>
  );
}
