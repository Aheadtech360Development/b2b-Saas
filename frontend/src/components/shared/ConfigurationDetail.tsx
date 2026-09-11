/**
 * ConfigurationDetail — the chosen options on a configured product's line.
 *
 * A configurable product has no variant to name it, so "Business Cards" alone
 * doesn't say what was ordered. This renders the snapshot the server stored on
 * the line, which is why the cart, checkout and invoice all show the same thing:
 * they're reading the same record, not re-deriving it.
 */
import type { ConfigLine, LineConfiguration } from "@/types/order.types";

function delta(l: ConfigLine) {
  if (!l.price_delta) return null;
  const sign = l.price_delta > 0 ? "+" : "−";
  const n = Math.abs(l.price_delta);
  if (l.price_mode === "percent") return `${sign}${n}%`;
  return `${sign}$${n.toFixed(2)}${l.price_mode === "per_unit" ? "/ea" : ""}`;
}

export function ConfigurationDetail({
  configuration,
  compact = false,
}: {
  configuration?: LineConfiguration | null;
  compact?: boolean;
}) {
  const lines = configuration?.breakdown ?? [];
  if (!lines.length) return null;

  if (compact) {
    return (
      <div style={{ fontSize: "11px", color: "#6B6B6B", lineHeight: 1.6, marginTop: "4px" }}>
        {lines.map((l, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: "#C9C5BD" }}> · </span>}
            <span style={{ color: "#8A8A8A" }}>{l.option}:</span> <strong style={{ fontWeight: 600 }}>{l.value}</strong>
          </span>
        ))}
        {!!configuration?.setup_fees && (
          <span> · <strong style={{ fontWeight: 600 }}>${configuration.setup_fees.toFixed(2)} one-off</strong></span>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: "8px", fontSize: "12px", lineHeight: 1.7 }}>
      {lines.map((l, i) => {
        const d = delta(l);
        return (
          <div key={i} style={{ display: "flex", gap: "10px", color: "#4B4B4B" }}>
            <span style={{ color: "#8A8A8A", minWidth: "120px" }}>{l.option}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{l.value}</span>
            {d && <span style={{ color: "#8A8A8A", whiteSpace: "nowrap" }}>{d}</span>}
          </div>
        );
      })}
      {!!configuration?.setup_fees && (
        <div style={{ display: "flex", gap: "10px", color: "#4B4B4B", borderTop: "1px dashed #E2E2DE", marginTop: "5px", paddingTop: "5px" }}>
          <span style={{ color: "#8A8A8A", minWidth: "120px" }}>One-off fees</span>
          <span style={{ flex: 1, fontWeight: 600 }}>${configuration.setup_fees.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
