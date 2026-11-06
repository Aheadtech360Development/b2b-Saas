/**
 * ConfigurationDetail — the chosen options on a configured product's line.
 *
 * A configurable product has no variant to name it, so "Business Cards" alone
 * doesn't say what was ordered. This renders the snapshot the server stored on
 * the line, which is why the cart, checkout and invoice all show the same thing:
 * they're reading the same record, not re-deriving it.
 */
import { oneOffFees, type ConfigLine, type DesignLineInfo, type LineConfiguration } from "@/types/order.types";

const SIDE_WORDS: Record<string, string> = { front: "front", back: "back", left: "left sleeve", right: "right sleeve" };

/** "Printed front and back": how a design's shirt is decorated. */
export function decorationWords(method: string | undefined, sides: string[]): string {
  const words = sides.map((v) => SIDE_WORDS[v] ?? v);
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0] ?? "";
  return `${method === "embroidery" ? "Embroidered" : "Printed"} ${list}`.trim();
}

/** A t-shirt design's line in words: in the cart, each shirt with its sizes;
 *  on an order line, how that shirt is decorated. */
export function designRows(d: DesignLineInfo): string[] {
  const out: string[] = [];
  if (d.lines?.length) {
    const shirts = new Map<string, { label: string; sizes: string[]; sides: string[] }>();
    for (const x of d.lines) {
      const key = `${x.garment}|${x.colour}`;
      const shirt = shirts.get(key) ?? { label: `${x.garment}, ${x.colour}`, sizes: [], sides: x.sides ?? [] };
      shirt.sizes.push(`${x.size} ×${x.qty}`);
      shirts.set(key, shirt);
    }
    for (const shirt of shirts.values()) {
      out.push(`${shirt.label}: ${shirt.sizes.join(", ")}${shirt.sides.length ? `. ${decorationWords(d.method, shirt.sides)}` : ""}`);
    }
    if (Number(d.personalization) > 0) out.push(`Names and numbers: $${Number(d.personalization).toFixed(2)}`);
  } else if (d.sides?.length) {
    out.push(decorationWords(d.method, d.sides));
  }
  return out;
}

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
  const artwork = configuration?.artwork ?? null;
  // Rounding cents ride with the fees so the line adds up; they are not a fee.
  const fees = oneOffFees(configuration);
  const design = configuration?.tshirt_design ? designRows(configuration.tshirt_design) : [];
  if (design.length) {
    return compact ? (
      <div style={{ fontSize: "11px", color: "#6B6B6B", lineHeight: 1.6, marginTop: "4px" }} data-design-detail>
        {design.map((row) => <div key={row}>{row}</div>)}
      </div>
    ) : (
      <div style={{ marginTop: "8px", fontSize: "12px", lineHeight: 1.7, color: "#4B4B4B" }} data-design-detail>
        {design.map((row) => <div key={row}>{row}</div>)}
      </div>
    );
  }
  if (!lines.length && !artwork) return null;

  // The file this line is printed from. On a line that has one it is the most
  // important thing on the line: without it there is nothing to print.
  const artworkRow = artwork ? (
    <a
      href={artwork.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: compact ? "11px" : "12px", fontWeight: 700, color: "#1C3557", textDecoration: "none", marginTop: "4px" }}
    >
      ↓ {artwork.file_name || "Buyer's artwork"}
    </a>
  ) : null;

  if (compact) {
    return (
      <div style={{ fontSize: "11px", color: "#6B6B6B", lineHeight: 1.6, marginTop: "4px" }}>
        {lines.map((l, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: "#C9C5BD" }}> · </span>}
            <span style={{ color: "#8A8A8A" }}>{l.option}:</span> <strong style={{ fontWeight: 600 }}>{l.value}</strong>
          </span>
        ))}
        {fees > 0 && (
          <span> · <strong style={{ fontWeight: 600 }}>${fees.toFixed(2)} one-off</strong></span>
        )}
        {artworkRow && <div>{artworkRow}</div>}
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
      {fees > 0 && (
        <div style={{ display: "flex", gap: "10px", color: "#4B4B4B", borderTop: "1px dashed #E2E2DE", marginTop: "5px", paddingTop: "5px" }}>
          <span style={{ color: "#8A8A8A", minWidth: "120px" }}>One-off fees</span>
          <span style={{ flex: 1, fontWeight: 600 }}>${fees.toFixed(2)}</span>
        </div>
      )}
      {artworkRow && (
        <div style={{ display: "flex", gap: "10px", borderTop: "1px dashed #E2E2DE", marginTop: "5px", paddingTop: "5px" }}>
          <span style={{ color: "#8A8A8A", minWidth: "120px" }}>Artwork</span>
          <span style={{ flex: 1 }}>{artworkRow}</span>
        </div>
      )}
    </div>
  );
}
