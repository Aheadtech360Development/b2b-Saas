"use client";

/**
 * ThemeCustomizer — edits the brand's own theme.
 *
 * Left: the pages of the theme and the sections of the page being edited.
 * Right: the real storefront markup, live, updating as you type. Clicking a
 * section in the preview opens its settings.
 *
 * It edits what the design already has — text, links, images, the order of
 * sections, and whether a section shows. It does not add sections or change
 * layout: the design is the design. Cart and checkout are listed so nobody
 * wonders where they went, and locked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { useAuthStore } from "@/stores/auth.store";
import { canWrite } from "@/lib/permissions";
import { themesService, type BrandTheme } from "@/services/themes.service";
import { renderPage, type ThemeField, type ThemeState } from "@/lib/themeValues";

const MESSAGE = "at360-theme-preview";
const LOCKED_PAGES = [
  { key: "cart", label: "Cart" },
  { key: "checkout", label: "Checkout" },
];

const card: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px" };
const label: React.CSSProperties = { display: "block", fontSize: "11.5px", fontWeight: 600, color: "#555", marginBottom: "5px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { width: "100%", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "9px 11px", fontSize: "13.5px", outline: "none", boxSizing: "border-box", background: "#fff" };
const btnPrimary: React.CSSProperties = { background: "#1A1A1A", color: "#fff", border: "none", padding: "9px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const btnOutline: React.CSSProperties = { background: "#fff", border: "1px solid #1A1A1A", color: "#1A1A1A", padding: "9px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const iconBtn = (disabled?: boolean): React.CSSProperties => ({ background: "#fff", border: "1px solid #E3E3E3", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1 });

const STATUS: Record<string, { text: string; bg: string; color: string }> = {
  draft: { text: "Not published", bg: "#FEF3C7", color: "#92400E" },
  changes: { text: "Unpublished changes", bg: "#DBEAFE", color: "#1E40AF" },
  published: { text: "Published", bg: "#DCFCE7", color: "#15803D" },
};

const DEVICES = { desktop: 1280, tablet: 820, mobile: 400 } as const;
type Device = keyof typeof DEVICES;

export default function ThemeCustomizer() {
  const { user } = useAuthStore();
  const writable = canWrite(user?.role, "storefront", user?.scopes, user?.read_only);
  const isPlatformAdmin = user?.role === "platform_admin";

  const [theme, setTheme] = useState<BrandTheme | null>(null);
  const [state, setState] = useState<ThemeState>({ pages: {} });
  const [pageKey, setPageKey] = useState<string>("home");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard" | "import">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickImageFor, setPickImageFor] = useState<{ section: string; field: string } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewReady, setPreviewReady] = useState(false);

  const adopt = useCallback((t: BrandTheme) => {
    setTheme(t);
    setState(t.draft ?? { pages: {} });
    setPageKey((cur) => (t.definition?.pages?.[cur] ? cur : (t.pages[0]?.key ?? "home")));
  }, []);

  useEffect(() => {
    themesService.get()
      .then((r) => { if (r.theme) adopt(r.theme); })
      .catch(() => setMsg({ ok: false, text: "Could not load this brand's theme." }))
      .finally(() => setLoading(false));
  }, [adopt]);

  // ── The page the preview should draw, rebuilt as you edit ──
  const preview = useMemo(() => {
    if (!theme?.definition?.pages?.[pageKey]) return null;
    return renderPage(theme.definition, state, pageKey);
  }, [theme, state, pageKey]);

  const post = useCallback((payload: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ type: MESSAGE, ...payload }, window.location.origin);
  }, []);

  useEffect(() => {
    if (previewReady && preview) post({ page: preview, selected: openSection });
  }, [preview, previewReady, openSection, post]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ready?: boolean; select?: string } | null;
      if (!data || data.type !== MESSAGE) return;
      if (data.ready) setPreviewReady(true);
      if (data.select) setOpenSection(data.select);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── Editing ──
  const pageState = state.pages?.[pageKey] ?? { order: [], hidden: [], values: {} };
  const sections = theme?.definition?.pages?.[pageKey]?.sections ?? [];
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const order = useMemo(() => {
    const listed = (pageState.order ?? []).filter((id) => sectionById.has(id));
    return [...listed, ...sections.map((s) => s.id).filter((id) => !listed.includes(id))];
  }, [pageState.order, sections, sectionById]);

  function patchPage(patch: Partial<typeof pageState>) {
    setState((cur) => ({
      ...cur,
      pages: { ...cur.pages, [pageKey]: { ...pageState, ...patch } },
    }));
  }
  function setValue(sectionId: string, fieldKey: string, value: string) {
    const values = { ...(pageState.values ?? {}) };
    values[sectionId] = { ...(values[sectionId] ?? {}), [fieldKey]: value };
    patchPage({ values });
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const a = next[index], b = next[j];
    if (!a || !b) return;
    next[index] = b; next[j] = a;
    patchPage({ order: next });
  }
  function toggleHidden(id: string) {
    const hidden = new Set(pageState.hidden ?? []);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    patchPage({ hidden: Array.from(hidden) });
  }

  const dirty = !!theme && JSON.stringify(state) !== JSON.stringify(theme.draft ?? { pages: {} });

  async function save(): Promise<boolean> {
    if (!theme) return false;
    setBusy("save"); setMsg(null);
    try {
      const r = await themesService.save(state);
      adopt(r.theme);
      setMsg({ ok: true, text: "Saved. Publish when you want shoppers to see it." });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not save." });
      return false;
    } finally { setBusy(null); }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish"); setMsg(null);
    try {
      adopt((await themesService.publish()).theme);
      setMsg({ ok: true, text: "Published — your storefront is showing this now." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not publish." });
    } finally { setBusy(null); }
  }

  async function discard() {
    if (!confirm("Throw away the changes that aren't published yet?")) return;
    setBusy("discard"); setMsg(null);
    try { adopt((await themesService.discard()).theme); setMsg({ ok: true, text: "Back to the published version." }); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not discard." }); }
    finally { setBusy(null); }
  }

  async function importFile(file: File) {
    setBusy("import"); setMsg(null);
    try {
      adopt((await themesService.importFile(file)).theme);
      setMsg({ ok: true, text: "Design imported. Nothing is live until you publish." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not import that file." });
    } finally { setBusy(null); }
  }

  if (loading) return <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading theme…</div>;

  // ── No theme yet ──
  if (!theme) {
    return (
      <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "720px" }}>
        <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830" }}>Theme</h1>
        <div style={{ ...card, padding: "40px 28px", textAlign: "center", marginTop: "18px" }}>
          <p style={{ fontSize: "15px", color: "#2A2830", marginBottom: "6px", fontWeight: 600 }}>This brand has no theme yet.</p>
          <p style={{ fontSize: "13px", color: "#7A7880", lineHeight: 1.6, maxWidth: "460px", margin: "0 auto 18px" }}>
            Our team sets the design up from the client&apos;s file. Once it is imported, you can edit its text, images and section order here.
          </p>
          {isPlatformAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".html,text/html" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy !== null} style={btnPrimary}>
                {busy === "import" ? "Importing…" : "Import a design file"}
              </button>
            </>
          )}
        </div>
        {msg && <div style={{ marginTop: "14px", color: msg.ok ? "#15803D" : "#B91C1C", fontSize: "13px" }}>{msg.text}</div>}
      </div>
    );
  }

  const chip = STATUS[theme.status] ?? STATUS.draft!;
  const current = theme.pages.find((p) => p.key === pageKey);

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "28px", color: "#2A2830", lineHeight: 1 }}>{theme.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 700, color: chip.color, background: chip.bg, padding: "3px 9px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: ".04em" }}>{chip.text}</span>
            {dirty && <span style={{ fontSize: "12px", color: "#B45309" }}>● Unsaved</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "4px", background: "#F2F1EC", borderRadius: "8px", padding: "3px" }}>
            {(Object.keys(DEVICES) as Device[]).map((d) => (
              <button key={d} onClick={() => setDevice(d)} title={d}
                style={{ border: "none", background: device === d ? "#fff" : "transparent", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830" }}>
                {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "▯"}
              </button>
            ))}
          </div>
          <a href="/" target="_blank" rel="noreferrer" style={btnOutline}>Store view ↗</a>
          {writable && theme.status === "changes" && !dirty && (
            <button onClick={discard} disabled={busy !== null} style={{ ...btnOutline, borderColor: "#E3E3E3", color: "#555" }}>{busy === "discard" ? "Discarding…" : "Discard"}</button>
          )}
          {writable && <button onClick={save} disabled={busy !== null || !dirty} style={{ ...btnOutline, opacity: busy !== null || !dirty ? 0.5 : 1 }}>{busy === "save" ? "Saving…" : "Save"}</button>}
          {writable && <button onClick={publish} disabled={busy !== null || (theme.status === "published" && !dirty)} style={{ ...btnPrimary, opacity: busy !== null || (theme.status === "published" && !dirty) ? 0.5 : 1 }}>{busy === "publish" ? "Publishing…" : "Publish"}</button>}
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${msg.ok ? "#BBF7D0" : "#FECACA"}`, color: msg.ok ? "#15803D" : "#B91C1C", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>
          {msg.ok ? "✓ " : ""}{msg.text}
        </div>
      )}

      {/* Page selector */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        {theme.pages.map((p) => (
          <button key={p.key} onClick={() => { setPageKey(p.key); setOpenSection(null); }}
            style={{ border: "1px solid", borderColor: p.key === pageKey ? "#1A1A1A" : "#E3E3E3", background: p.key === pageKey ? "#1A1A1A" : "#fff", color: p.key === pageKey ? "#fff" : "#2A2830", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            {p.label}
          </button>
        ))}
        {LOCKED_PAGES.map((p) => (
          <button key={p.key} disabled title="Cart and checkout are the same for every store and can't be edited."
            style={{ border: "1px dashed #E3E3E3", background: "#F8F8F6", color: "#9A98A0", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", fontWeight: 700, cursor: "not-allowed" }}>
            {p.label} 🔒
          </button>
        ))}
      </div>

      <div className="theme-grid" style={{ display: "grid", gridTemplateColumns: "340px minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
        {/* ── Sections ── */}
        <div style={{ ...card, padding: "14px", maxHeight: "78vh", overflowY: "auto" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px" }}>
            {current?.label ?? "Page"} · {order.length} sections
          </div>

          {order.map((id, i) => {
            const section = sectionById.get(id);
            if (!section) return null;
            const hidden = (pageState.hidden ?? []).includes(id);
            const isOpen = openSection === id;
            const values = pageState.values?.[id] ?? {};
            return (
              <div key={id} style={{ border: "1px solid #EEE", borderRadius: "10px", marginBottom: "8px", background: isOpen ? "#FCFCFB" : "#fff", opacity: hidden ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 10px" }}>
                  <button onClick={() => setOpenSection(isOpen ? null : id)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "13px", fontWeight: 700, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {section.label}
                  </button>
                  <span style={{ fontSize: "11px", color: "#9A98A0" }}>{section.fields.length}</span>
                  {writable && <>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={iconBtn(i === 0)} aria-label="Move up">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === order.length - 1} style={iconBtn(i === order.length - 1)} aria-label="Move down">↓</button>
                    <button onClick={() => toggleHidden(id)} title={hidden ? "Show this section" : "Hide this section"} style={iconBtn()}>{hidden ? "🚫" : "👁"}</button>
                  </>}
                </div>

                {isOpen && (
                  <div style={{ padding: "0 10px 12px", borderTop: "1px solid #F2F1EC" }}>
                    {section.fields.length === 0 && (
                      <p style={{ fontSize: "12px", color: "#9A98A0", marginTop: "10px" }}>Nothing to edit in this section.</p>
                    )}
                    {section.fields.map((field: ThemeField) => {
                      const value = values[field.key] ?? "";
                      const shown = value || field.default;
                      return (
                        <div key={field.key} style={{ marginTop: "12px" }}>
                          <label style={label}>{field.label}{field.hint ? ` · ${field.hint.slice(0, 28)}` : ""}</label>
                          {field.type === "image" ? (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                              {shown && /^https?:|^\//.test(shown) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={shown} alt="" style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px", border: "1px solid #EEE" }} />
                              )}
                              <button disabled={!writable} onClick={() => setPickImageFor({ section: id, field: field.key })} style={{ ...btnOutline, padding: "7px 12px", fontSize: "12px" }}>
                                {value ? "Change image" : "Choose image"}
                              </button>
                              {value && writable && (
                                <button onClick={() => setValue(id, field.key, "")} style={{ background: "none", border: "none", color: "#B91C1C", fontSize: "12px", cursor: "pointer" }}>Reset</button>
                              )}
                            </div>
                          ) : (field.default.length > 90 ? (
                            <textarea disabled={!writable} style={{ ...input, minHeight: "76px", resize: "vertical", fontFamily: "inherit" }}
                              value={value} placeholder={field.default} onChange={(e) => setValue(id, field.key, e.target.value)} />
                          ) : (
                            <input disabled={!writable} style={input} value={value} placeholder={field.default}
                              onChange={(e) => setValue(id, field.key, e.target.value)} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "12px", lineHeight: 1.5 }}>
            Leave a box empty to keep the design&apos;s own wording. Sections can be moved and hidden; the design decides what exists.
          </p>
        </div>

        {/* ── Preview ── */}
        <div style={{ ...card, padding: "12px", overflow: "hidden" }}>
          <div style={{ background: "#F2F1EC", borderRadius: "10px", padding: "10px", display: "flex", justifyContent: "center" }}>
            <iframe
              ref={frameRef}
              title="Storefront preview"
              src="/theme-preview"
              style={{ width: `${DEVICES[device]}px`, maxWidth: "100%", height: "74vh", border: "1px solid #E3E3E3", borderRadius: "8px", background: "#fff", transition: "width .2s" }}
            />
          </div>
          <p style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "8px", textAlign: "center" }}>
            Click a section in the preview to edit it. This is the real storefront markup — what you see is what shoppers get once you publish.
          </p>
        </div>
      </div>

      {pickImageFor && (
        <MediaPicker
          onSelect={(url) => { setValue(pickImageFor.section, pickImageFor.field, url); setPickImageFor(null); }}
          onClose={() => setPickImageFor(null)}
        />
      )}

      <style>{`@media (max-width: 1100px) { .theme-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
