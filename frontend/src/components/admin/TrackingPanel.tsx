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
      const res = await apiClient.put<{ message: string; warnings: string[] }>(
        "/api/v1/admin/analytics-settings", { config, force }
      );
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

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!config) return <p className="text-sm text-red-600">Tracking settings are unavailable.</p>;

  const connected = tools.filter(t => config.tools[t.key]?.enabled && config.tools[t.key]?.id).length;

  return (
    <div className="space-y-5">
      {/* The master switch */}
      <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={e => setConfig({ ...config, enabled: e.target.checked })}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block text-sm font-semibold text-gray-900">
            Track visitors on my storefront
          </span>
          <span className="block text-sm text-gray-500 mt-0.5">
            {config.enabled
              ? `${connected} tool${connected === 1 ? "" : "s"} connected. Only the ones you switch on below are loaded.`
              : "Off — your storefront loads no tracking scripts at all."}
          </span>
        </span>
      </label>

      {config.enabled && (
        <>
          {/* What to send */}
          <div className="flex flex-wrap gap-4 px-1">
            {([
              ["track_products", "Product views and add-to-cart"],
              ["track_checkout", "Checkout and purchases"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={e => setConfig({ ...config, [key]: e.target.checked })}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>

          {/* One card per tool */}
          <div className="grid gap-3 sm:grid-cols-2">
            {tools.map(tool => {
              const value = config.tools[tool.key] ?? { id: "", enabled: false };
              const live = value.enabled && !!value.id;
              return (
                <div
                  key={tool.key}
                  className={`rounded-lg border p-4 transition-colors ${live ? "border-gray-900 bg-white" : "border-gray-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tool.blurb}</p>
                    </div>
                    <label className="flex items-center gap-1.5 shrink-0 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={value.enabled}
                        onChange={e => setTool(tool.key, { enabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                      On
                    </label>
                  </div>

                  <label className="block mt-3">
                    <span className="block text-xs font-medium text-gray-600 mb-1">{tool.field_label}</span>
                    <input
                      type="text"
                      value={value.id}
                      placeholder={tool.placeholder}
                      onChange={e => setTool(tool.key, { id: e.target.value })}
                      spellCheck={false}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none"
                    />
                  </label>

                  {tool.where && (
                    <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                      {tool.where}{" "}
                      {tool.docs_url && (
                        <a href={tool.docs_url} target="_blank" rel="noopener noreferrer" className="underline">
                          Guide
                        </a>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* The escape hatch */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setShowSnippets(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900"
            >
              Something else
              <span className="text-gray-400">{showSnippets ? "−" : "+"}</span>
            </button>
            {showSnippets && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-xs text-gray-500">
                  For a tool that is not on the list. Paste the code it gave you — it runs on your
                  storefront only, never on another store.
                </p>
                {([
                  ["head_snippet", "Runs on every page"],
                  ["body_snippet", "Added to the page body (for a no-script fallback)"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
                    <textarea
                      value={config[key]}
                      onChange={e => setConfig({ ...config, [key]: e.target.value })}
                      rows={4}
                      spellCheck={false}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:border-gray-900 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {confirmProblem && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{confirmProblem}</p>
          <p className="text-xs text-amber-800 mt-1">
            If you copied it straight from the tool, save it anyway — we may simply not recognise a
            newer format.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => save(true)}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save it anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmProblem(null)}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900"
            >
              Let me fix it
            </button>
          </div>
        </div>
      )}

      {note && (
        <p className={`text-sm ${note.kind === "ok" ? "text-green-700" : note.kind === "warn" ? "text-amber-700" : "text-red-600"}`}>
          {note.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save tracking"}
        </button>
        <span className="text-xs text-gray-400">
          Changes take effect the next time a shopper loads your storefront.
        </span>
      </div>
    </div>
  );
}
