"use client";

/**
 * What a rearrangement will look like, before it happens.
 *
 * Auto-nest and auto-fill both move everything at once. Doing that and then
 * finding out is a bad trade when the sheet took ten minutes to lay out — so
 * the plan is drawn first, at a glance: how many sheets, what goes on each,
 * and what could not be placed. Cancel leaves the sheet exactly as it was.
 */
import type { NestPlan } from "@/lib/sheetNesting";
import type { Sheet } from "@/lib/sheetPlacement";

export function NestPreview({
  plan, sheet, title, note, applyLabel, busy, onApply, onCancel,
}: {
  plan: NestPlan;
  sheet: Sheet;
  title: string;
  note: string;
  applyLabel: string;
  busy?: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const total = plan.sheets.reduce((n, s) => n + s.length, 0);
  // Each sheet is drawn to the same scale, small enough that several fit side
  // by side and large enough to tell a full sheet from a nearly empty one.
  const scale = 120 / Math.max(sheet.width, 1);

  return (
    <div onClick={busy ? undefined : onCancel} style={S.backdrop}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={S.box}>
        <div style={S.title}>{title}</div>
        <p style={S.note}>{note}</p>

        <div style={S.strip}>
          {plan.sheets.map((placed, i) => (
            <div key={i} style={S.sheetWrap}>
              <div style={{ ...S.sheet, width: `${sheet.width * scale}px`, height: `${sheet.length * scale}px` }}>
                {placed.map((p) => {
                  const w = p.rotated ? p.h : p.w;
                  const h = p.rotated ? p.w : p.h;
                  return (
                    <span
                      key={p.key}
                      style={{
                        position: "absolute",
                        left: `${p.x * scale}px`, top: `${p.y * scale}px`,
                        width: `${Math.max(w * scale, 1)}px`, height: `${Math.max(h * scale, 1)}px`,
                        background: "#BFE6CE", border: "1px solid #16A34A", borderRadius: "1px",
                      }}
                    />
                  );
                })}
              </div>
              <div style={S.caption}>
                Sheet {i + 1}
                <span style={S.captionDim}> · {placed.length} design{placed.length === 1 ? "" : "s"} · {Math.round((plan.fill[i] ?? 0) * 100)}% used</span>
              </div>
            </div>
          ))}
        </div>

        {plan.unplaceable.length > 0 && (
          <div role="alert" style={S.cannot}>
            <strong>{plan.unplaceable.length} design{plan.unplaceable.length === 1 ? "" : "s"} will not fit on any sheet</strong>
            {" — "}too big for this roll even turned on its side. Make {plan.unplaceable.length === 1 ? "it" : "them"} smaller,
            or choose a wider size. {plan.unplaceable.length === 1 ? "It stays" : "They stay"} where {plan.unplaceable.length === 1 ? "it is" : "they are"}.
          </div>
        )}

        <div style={S.foot}>
          <span style={S.summary}>
            {total} design{total === 1 ? "" : "s"} · {plan.sheets.length} sheet{plan.sheets.length === 1 ? "" : "s"}
          </span>
          <button onClick={onCancel} disabled={busy} style={S.cancel}>Cancel</button>
          <button onClick={onApply} disabled={busy || total === 0} style={S.apply}>
            {busy ? "Applying…" : applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, zIndex: 650, background: "rgba(16,24,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  box: { background: "#fff", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "620px", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(16,24,40,.28)", fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" },
  title: { fontSize: "18px", fontWeight: 800, color: "#1F2430" },
  note: { fontSize: "13px", color: "#5B6170", lineHeight: 1.6, margin: "7px 0 16px" },
  strip: { display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "8px", flex: 1 },
  sheetWrap: { flexShrink: 0 },
  sheet: { position: "relative", background: "#FBFCFD", border: "1px solid #E6E8EC", borderRadius: "3px", overflow: "hidden" },
  caption: { fontSize: "11px", fontWeight: 700, color: "#1F2430", marginTop: "7px", textAlign: "center" },
  captionDim: { fontWeight: 500, color: "#848A96" },
  cannot: { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: "9px", padding: "10px 12px", fontSize: "12.5px", lineHeight: 1.6, marginTop: "14px" },
  foot: { display: "flex", alignItems: "center", gap: "9px", marginTop: "18px" },
  summary: { flex: 1, fontSize: "12.5px", color: "#5B6170", fontWeight: 600 },
  cancel: { background: "#fff", border: "1px solid #E6E8EC", color: "#1F2430", borderRadius: "9px", padding: "10px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  apply: { background: "#16A34A", border: "none", color: "#fff", borderRadius: "9px", padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};

export default NestPreview;
