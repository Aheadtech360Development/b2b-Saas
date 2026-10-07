"use client";

/**
 * A colour's dot that can be put right: click it, then pick the colour or type
 * its hex code.
 *
 * The dot draws what `lib/colors` makes of the name and the saved hex. A
 * colour nobody could name — and that has no hex — is drawn hatched, not grey,
 * so it reads as "not set yet" rather than as a grey garment.
 *
 * The little panel is fixed to the window, not to the row it opens from: the
 * rows these dots sit in clip what spills out of them.
 */
import { useEffect, useRef, useState } from "react";
import { isLightColor, knownColor, normalizeHex, resolveColor } from "@/lib/colors";

export const UNSET_SWATCH = "repeating-linear-gradient(45deg,#ECECE8 0 4px,#FAFAF8 4px 8px)";

export function ColorSwatchPicker({ name, hex, onPick, size = 20 }: {
  name: string;
  hex?: string | null;
  /** Called with "#RRGGBB" once a colour is chosen. May save; the panel waits for it. */
  onPick: (hex: string) => void | Promise<void>;
  size?: number;
}) {
  const [at, setAt] = useState<null | { x: number; y: number }>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const dot = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const shown = resolveColor(name, hex);
  const fromName = knownColor(name);
  const typed = normalizeHex(draft);

  useEffect(() => {
    if (!at) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !dot.current?.contains(t)) setAt(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setAt(null); };
    const moved = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setAt(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [at]);

  function open(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (at) { setAt(null); return; }
    const r = dot.current!.getBoundingClientRect();
    setDraft(shown ?? "");
    setAt({
      x: Math.max(8, Math.min(r.left, window.innerWidth - 268)),
      y: r.bottom + 176 > window.innerHeight ? Math.max(8, r.top - 176) : r.bottom + 8,
    });
  }

  async function use(value: string) {
    const picked = normalizeHex(value);
    if (!picked || busy) return;
    setBusy(true);
    try {
      await onPick(picked);
      setAt(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button ref={dot} type="button" onClick={open}
        title={shown ? `${name} — ${shown}. Click to change.` : `No colour set for ${name}. Click to choose one.`}
        aria-label={shown ? `Change the colour of ${name}` : `Choose a colour for ${name}`}
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0, padding: 0, cursor: "pointer",
          background: shown ?? UNSET_SWATCH,
          border: shown ? `1.5px solid ${isLightColor(shown) ? "rgba(0,0,0,.22)" : "rgba(0,0,0,.1)"}` : "1.5px dashed #B45309",
        }} />
      {at && (
        <div ref={panel} role="dialog" aria-label={`Colour for ${name}`} onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: at.x, top: at.y, zIndex: 1000, width: "260px", background: "#fff", color: "#2A2830",
            border: "1px solid #E3E3E3", borderRadius: "12px", boxShadow: "0 14px 36px rgba(0,0,0,.18)", padding: "12px",
            cursor: "default", textAlign: "left", fontWeight: 400,
          }}>
          <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Colour for “{name}”
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="color" aria-label="Pick a colour" value={(typed ?? "#888888").toLowerCase()}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              style={{ width: "42px", height: "36px", padding: 0, border: "1px solid #D6D3CC", borderRadius: "8px", background: "#fff", cursor: "pointer", flexShrink: 0 }} />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void use(draft); } }}
              placeholder="#1F3A93" aria-label="Hex code"
              style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "13px", fontFamily: "ui-monospace, monospace", boxSizing: "border-box" }} />
          </div>
          {draft.trim() && !typed && (
            <div style={{ fontSize: "11.5px", color: "#B45309", marginTop: "6px" }}>A hex code looks like #1F3A93.</div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {fromName && fromName !== typed && (
              <button type="button" onClick={() => setDraft(fromName)} title={`The colour the name “${name}” usually means`}
                style={{ padding: "7px 10px", background: "#fff", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#444", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: fromName, border: "1px solid rgba(0,0,0,.15)" }} />
                From its name
              </button>
            )}
            <button type="button" disabled={!typed || busy} onClick={() => void use(draft)}
              style={{ padding: "7px 12px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: !typed || busy ? "not-allowed" : "pointer", opacity: !typed || busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Use this colour"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
