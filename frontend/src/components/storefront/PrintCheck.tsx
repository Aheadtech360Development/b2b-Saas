"use client";

/**
 * PrintCheck — what the print team would say about this file, said now.
 *
 * A buyer finds out their logo was too small when the transfers arrive. The
 * check runs on the server against the size they picked, so the answer is the
 * same one the print team will get, and it comes with the fix: the tools that
 * solve each problem are right there.
 *
 * Nothing here blocks the order. A brand may well want to print a 120 DPI file,
 * and it is their decision — this makes sure it is a decision, not a surprise.
 */
import type { ArtworkInspection } from "@/services/gangSheets.service";

const TONE: Record<string, { bg: string; border: string; fg: string; title: string }> = {
  ready: { bg: "#F0FDF4", border: "#BBF7D0", fg: "#166534", title: "Ready to print" },
  check: { bg: "#FFFBEB", border: "#FDE68A", fg: "#92400E", title: "Worth a look" },
  blocked: { bg: "#FEF2F2", border: "#FECACA", fg: "#991B1B", title: "This won't print well" },
  unknown: { bg: "#F6F6F7", border: "#E3E3E3", fg: "#4A4A4A", title: "Not checked" },
};

const DOT: Record<string, string> = { blocker: "#DC2626", warning: "#D97706", ok: "#16A34A" };

export function PrintCheck({
  result,
  busy,
  onRemoveBackground,
  onUpscale,
}: {
  result: ArtworkInspection | null;
  busy?: boolean;
  onRemoveBackground?: () => void;
  onUpscale?: () => void;
}) {
  if (busy) {
    return <div style={{ ...BOX, background: "#F6F6F7", borderColor: "#E3E3E3", color: "#6B6B6B" }}>Checking this file…</div>;
  }
  if (!result) return null;

  const tone = TONE[result.verdict] ?? TONE.unknown!;
  const codes = new Set(result.findings.map((f) => f.code));
  const wantsBackground = codes.has("solid_background") || codes.has("no_transparency");
  const wantsUpscale = codes.has("resolution") && result.verdict !== "ready";

  return (
    <div style={{ ...BOX, background: tone.bg, borderColor: tone.border }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: tone.fg, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {tone.title}
      </div>

      <div style={{ display: "grid", gap: "7px" }}>
        {result.findings.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span aria-hidden style={{ width: "7px", height: "7px", borderRadius: "50%", background: DOT[f.level] ?? "#9CA3AF", marginTop: "5px", flexShrink: 0 }} />
            <span style={{ fontSize: "12.5px", color: "#1A1A1A", lineHeight: 1.5 }}>
              {f.message}
              {f.fix && <span style={{ display: "block", color: "#6B6B6B", marginTop: "1px" }}>{f.fix}</span>}
            </span>
          </div>
        ))}
      </div>

      {(wantsBackground || wantsUpscale) && (onRemoveBackground || onUpscale) && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {wantsBackground && onRemoveBackground && (
            <button onClick={onRemoveBackground} style={BTN}>Remove background</button>
          )}
          {wantsUpscale && onUpscale && <button onClick={onUpscale} style={BTN}>Upscale</button>}
        </div>
      )}
    </div>
  );
}

const BOX: React.CSSProperties = {
  border: "1px solid", borderRadius: "10px", padding: "11px 13px",
  display: "grid", gap: "9px", fontSize: "13px",
};
const BTN: React.CSSProperties = {
  padding: "7px 13px", background: "#1A1A1A", color: "#fff", border: "none",
  borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
};
