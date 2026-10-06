"use client";

import { askText } from "@/lib/dialog";
/**
 * The controls for an element's settings — one per kind of field the
 * registry describes. Every control speaks the merchant's language: a menu is
 * picked by its name, products by searching for them, a picture by uploading
 * it or choosing one already in the brand's media library.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bold, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import type { Field } from "@/lib/builder/registry";
import type { PickCollection, PickMenu, PickProduct } from "@/services/builder.service";
import { cleanHtml, safeSrc } from "@/lib/builder/sanitize";
import { TextInput, Toggle } from "./ui";

export interface EditorEnv {
  menus: PickMenu[];
  collections: PickCollection[];
  searchProducts: (q: string) => Promise<PickProduct[]>;
  productName: (id: string) => string | undefined;
  rememberProducts: (rows: PickProduct[]) => void;
  globals: { id: string; name: string }[];
  uploadImage: (file: File) => Promise<string>;
  openMedia: (onPick: (url: string) => void) => void;
  themeColors: Record<string, string>;
  /** Open a menu's links for editing — add, rename, reorder, remove. */
  editMenu: (menuId: string) => void;
  /** Make a new menu; told its id once it exists, so the field that asked can choose it. */
  newMenu: (onMade?: (menuId: string) => void, name?: string) => void;
}

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

export function ImageField({ value, onChange, env }: { value: string; onChange: (v: string) => void; env: EditorEnv }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const src = safeSrc(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {src ? (
        <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #E3E6EC", background: "#F5F6F9" }}>
          <img src={src} alt="" style={{ display: "block", width: "100%", maxHeight: 150, objectFit: "contain" }} />
          <button type="button" className="sbe-icon sm" aria-label="Remove the picture" onClick={() => onChange("")}
                  style={{ position: "absolute", top: 6, right: 6, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      <div className="sbe-row">
        <button type="button" className="sbe-btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {busy ? "Uploading…" : "Upload"}
        </button>
        <button type="button" className="sbe-btn sm" onClick={() => env.openMedia(onChange)}><ImagePlus size={14} /> Library</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 15_000_000) { setError("Pictures can be up to 15 MB."); return; }
        setBusy(true); setError("");
        try { onChange(await env.uploadImage(file)); } catch { setError("That upload did not work. Try again."); } finally { setBusy(false); }
      }} />
      <TextInput value={str(value)} onChange={onChange} placeholder="…or paste an https:// address" ariaLabel="Picture address" />
      {value && !src && <div className="sbe-help" style={{ color: "#B42318" }}>Use an https:// address, or upload the picture.</div>}
      {error && <div className="sbe-help" style={{ color: "#B42318" }}>{error}</div>}
    </div>
  );
}

/**
 * A box of formatted text: bold, italic, lists, links, two sizes of heading.
 * `tall` is for writing at length — a policy — rather than a line or two in the
 * settings panel.
 */
export function RichText({ value, onChange, tall }: { value: string; onChange: (v: string) => void; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (ref.current && !focused.current) ref.current.innerHTML = cleanHtml(value);
  }, [value]);
  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };
  return (
    <div style={{ border: "1px solid #D9DDE5", borderRadius: 8, overflow: "hidden" }}>
      <div className="sbe-row" style={{ gap: 2, padding: 4, borderBottom: "1px solid #EEF0F4", background: "#FAFBFC", flexWrap: "wrap" }}>
        <button type="button" className="sbe-icon sm" aria-label="Bold" onMouseDown={(e) => { e.preventDefault(); run("bold"); }}><Bold size={14} /></button>
        <button type="button" className="sbe-icon sm" aria-label="Italic" onMouseDown={(e) => { e.preventDefault(); run("italic"); }}><Italic size={14} /></button>
        <button type="button" className="sbe-icon sm" aria-label="Bulleted list" onMouseDown={(e) => { e.preventDefault(); run("insertUnorderedList"); }}><List size={14} /></button>
        <button type="button" className="sbe-icon sm" aria-label="Numbered list" onMouseDown={(e) => { e.preventDefault(); run("insertOrderedList"); }}><ListOrdered size={14} /></button>
        <button type="button" className="sbe-icon sm" aria-label="Link" onMouseDown={async (e) => {
          e.preventDefault();
          const sel = window.getSelection();
          const range = sel && sel.rangeCount && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
          const url = await askText("Link to (a path like /products, or https://…)", "", { ok: "Add link", placeholder: "/products" });
          if (range) { ref.current?.focus(); sel?.removeAllRanges(); sel?.addRange(range); }
          if (url && /^(https?:\/\/|\/|mailto:|tel:)/.test(url.trim())) run("createLink", url.trim());
        }}><Link2 size={14} /></button>
        <button type="button" className="sbe-btn sm ghost" onMouseDown={(e) => { e.preventDefault(); run("formatBlock", "<p>"); }}>Text</button>
        <button type="button" className="sbe-btn sm ghost" onMouseDown={(e) => { e.preventDefault(); run("formatBlock", "<h2>"); }}>Big heading</button>
        <button type="button" className="sbe-btn sm ghost" onMouseDown={(e) => { e.preventDefault(); run("formatBlock", "<h3>"); }}>Heading</button>
      </div>
      <div ref={ref} className="sbe-rich" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Text"
           style={{ minHeight: tall ? 300 : 120, maxHeight: tall ? "min(52vh, 520px)" : 360, overflowY: "auto", padding: tall ? "14px 16px" : "8px 10px", outline: "none", lineHeight: 1.6 }}
           onFocus={() => { focused.current = true; }}
           onBlur={() => { focused.current = false; if (ref.current) onChange(ref.current.innerHTML); }}
           onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }} />
    </div>
  );
}

export function ProductsPicker({ value, onChange, env }: { value: string[]; onChange: (v: string[]) => void; env: EditorEnv }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    const t = window.setTimeout(() => {
      env.searchProducts(q).then((r) => { if (live) { setRows(r); env.rememberProducts(r); } })
        .catch(() => { if (live) setRows([]); }).finally(() => { if (live) setBusy(false); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, env]);
  const ids = Array.isArray(value) ? value.map(String) : [];
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ids.length > 0 && (
        <div className="sbe-list" style={{ border: "1px solid #EEF0F4", borderRadius: 10, padding: 4 }}>
          {ids.map((id, i) => (
            <div key={id} className="sbe-item" style={{ cursor: "default" }}>
              <span className="grow">{env.productName(id) ?? "Product"}</span>
              <button type="button" className="sbe-icon sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={13} /></button>
              <button type="button" className="sbe-icon sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === ids.length - 1}><ArrowDown size={13} /></button>
              <button type="button" className="sbe-icon sm" aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id))}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="sbe-row" style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, color: "#7A808C" }} />
        <input className="sbe-in" style={{ paddingLeft: 30 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your products" aria-label="Search your products" />
      </div>
      <div className="sbe-list" style={{ maxHeight: 220, overflowY: "auto" }}>
        {busy && !rows && <div className="sbe-help">Searching…</div>}
        {(rows ?? []).filter((r) => !ids.includes(r.id)).slice(0, 25).map((r) => (
          <button key={r.id} type="button" className="sbe-item" onClick={() => onChange([...ids, r.id])}>
            {r.image ? <img src={r.image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flex: "0 0 auto" }} />
              : <span style={{ width: 28, height: 28, borderRadius: 6, background: "#F1F3F7", flex: "0 0 auto" }} />}
            <span className="grow">{r.name}</span>
            {r.status !== "active" && <span className="sub">{r.status}</span>}
            <Plus size={14} />
          </button>
        ))}
        {rows && rows.length === 0 && <div className="sbe-help">No products match.</div>}
      </div>
    </div>
  );
}

function ItemsEditor({ field, value, onChange, env }: { field: Field; value: unknown; onChange: (v: unknown) => void; env: EditorEnv }) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const set = (i: number, key: string, v: unknown) => onChange(items.map((it, n) => (n === i ? { ...it, [key]: v } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ border: "1px solid #E3E6EC", borderRadius: 10, padding: 10 }}>
          <div className="sbe-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="sbe-lbl">{i + 1}.</span>
            <span className="sbe-row" style={{ gap: 2 }}>
              <button type="button" className="sbe-icon sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
              <button type="button" className="sbe-icon sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
              <button type="button" className="sbe-icon sm" aria-label="Remove" onClick={() => onChange(items.filter((_, n) => n !== i))}><Trash2 size={13} /></button>
            </span>
          </div>
          {(field.itemFields ?? []).filter((f) => !f.when || f.when.is.includes(item[f.when.key])).map((f) => (
            <div key={f.key} className="sbe-field">
              <label>{f.label}</label>
              <FieldControl field={f} value={item[f.key]} onChange={(v) => set(i, f.key, v)} env={env} />
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="sbe-btn sm" onClick={() => onChange([...items, field.newItem ? { ...field.newItem } : Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, ""]))])}>
        <Plus size={14} /> Add {field.label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}

export function FieldControl({ field, value, onChange, env }: {
  field: Field; value: unknown; onChange: (v: unknown) => void; env: EditorEnv;
}) {
  switch (field.kind) {
    case "text":
    case "url":
      return <TextInput value={str(value)} onChange={onChange} ariaLabel={field.label}
                        placeholder={field.kind === "url" ? "/products, /pages/about or https://…" : undefined} />;
    case "textarea":
      return <textarea className="sbe-in" value={str(value)} aria-label={field.label} rows={3} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input className="sbe-in" type="number" value={value === undefined || value === null ? "" : String(value)} aria-label={field.label}
               min={field.min} max={field.max} step={field.step ?? 1}
               onChange={(e) => {
                 if (e.target.value === "") { onChange(undefined); return; }
                 let n = Number(e.target.value);
                 if (!Number.isFinite(n)) return;
                 if (field.min !== undefined) n = Math.max(field.min, n);
                 if (field.max !== undefined) n = Math.min(field.max, n);
                 onChange(n);
               }} />
      );
    case "select":
      return (
        <select className="sbe-in" value={str(value)} aria-label={field.label} onChange={(e) => onChange(/^\d+$/.test(e.target.value) && field.key === "level" && e.target.value !== "0" ? Number(e.target.value) : e.target.value)}>
          {!(field.options ?? []).some((o) => o.value === str(value)) && <option value={str(value)}>{str(value) || "Choose…"}</option>}
          {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "toggle":
      return <Toggle label={field.label} value={!!value} onChange={onChange} />;
    case "color":
      return (
        <div className="sbe-color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(str(value)) ? str(value) : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />
          <TextInput value={str(value)} onChange={onChange} placeholder="#14161B" ariaLabel={field.label} />
        </div>
      );
    case "image":
      return <ImageField value={str(value)} onChange={onChange} env={env} />;
    case "richtext":
      return <RichText value={str(value)} onChange={onChange} />;
    case "html":
    case "css":
      return (
        <textarea className="sbe-in code" spellCheck={false} value={str(value)} aria-label={field.label}
                  placeholder={field.kind === "css" ? "h2 { color: #B91C1C; }" : "<p>Your markup</p>"}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Tab") return;
                    e.preventDefault();
                    const t = e.currentTarget;
                    const at = t.selectionStart;
                    onChange(`${t.value.slice(0, at)}  ${t.value.slice(t.selectionEnd)}`);
                    requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = at + 2; });
                  }} />
      );
    case "menu": {
      const chosen = env.menus.find((m) => m.id === value);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select className="sbe-in" value={str(value)} aria-label={field.label} onChange={(e) => onChange(e.target.value)}>
            <option value="">{env.menus.length ? "Choose a menu…" : "No menus yet — make one below"}</option>
            {!!value && !chosen && <option value={str(value)}>A menu that no longer exists</option>}
            {env.menus.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.items?.length ?? 0} {m.items?.length === 1 ? "link" : "links"})</option>)}
          </select>
          <div className="sbe-row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="sbe-btn sm" disabled={!chosen} onClick={() => chosen && env.editMenu(chosen.id)}>
              <Pencil size={13} /> Edit links
            </button>
            <button type="button" className="sbe-btn sm" onClick={() => env.newMenu((id) => onChange(id))}>
              <Plus size={13} /> New menu
            </button>
          </div>
        </div>
      );
    }
    case "collection":
      return (
        <select className="sbe-in" value={str(value)} aria-label={field.label} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a collection…</option>
          {!!value && !env.collections.some((c) => c.id === value) && <option value={str(value)}>A collection that no longer exists</option>}
          {env.collections.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (hidden)"}</option>)}
        </select>
      );
    case "collections": {
      const ids = Array.isArray(value) ? value.map(String) : [];
      return (
        <div className="sbe-list" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #EEF0F4", borderRadius: 10, padding: 4 }}>
          {env.collections.length === 0 && <div className="sbe-help" style={{ padding: 8 }}>No collections yet.</div>}
          {env.collections.map((c) => (
            <label key={c.id} className="sbe-item" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={ids.includes(c.id)}
                     onChange={(e) => onChange(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
              <span className="grow">{c.name}</span>
            </label>
          ))}
        </div>
      );
    }
    case "products":
      return <ProductsPicker value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} env={env} />;
    case "global":
      return (
        <select className="sbe-in" value={str(value)} aria-label={field.label} onChange={(e) => onChange(e.target.value)}>
          <option value="">{env.globals.length ? "Choose a shared section…" : "No shared sections yet"}</option>
          {env.globals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      );
    case "items":
      return <ItemsEditor field={field} value={value} onChange={onChange} env={env} />;
    default:
      return null;
  }
}
