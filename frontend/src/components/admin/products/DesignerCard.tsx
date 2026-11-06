"use client";

/**
 * A product's own switch for the t-shirt designer, on its edit page: the same
 * setting as Products → T-shirt designer (backend api/v1/admin/tshirt_designer),
 * saved at once, apart from the page's Save.
 */
import Link from "next/link";
import { useState } from "react";
import { useLock } from "@/lib/entitlements";
import { tshirtDesignerService } from "@/services/tshirtDesigns.service";

const SHAPES = [
  { key: "tee", label: "T-shirt" }, { key: "longsleeve", label: "Long sleeve tee" },
  { key: "tank", label: "Tank top" }, { key: "muscle", label: "Muscle tee" },
];

export function DesignerCard({ productId, status, enabled: startOn, config }: {
  productId: string;
  status: string;
  enabled: boolean;
  config: { silhouette?: string; embroidery?: boolean } | null | undefined;
}) {
  const locked = useLock("tshirt_designer");
  const [on, setOn] = useState(startOn);
  const [shape, setShape] = useState(config?.silhouette ?? "tee");
  const [embroidery, setEmbroidery] = useState(config?.embroidery === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not in the shop's plan (Retail) or switched off by the platform: nothing to switch here.
  if (locked) return null;

  async function save(change: { enabled?: boolean; silhouette?: string; embroidery?: boolean }) {
    setBusy(true); setError(null);
    try {
      const row = await tshirtDesignerService.update(productId, change);
      setOn(row.enabled); setShape(row.silhouette); setEmbroidery(row.embroidery);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc-card pc-pad" aria-label="T-shirt designer" data-designer-card>
      <h2 className="pc-h2">T-shirt designer</h2>
      <div className="pc-switch-row" style={{ marginTop: 12 }}>
        <span>
          Customers can design this product
          <span className="pc-sub-line" style={{ display: "block", fontSize: 12.5 }}>
            Its page offers Design your own, in its colours and sizes, at its prices. Saved at once.
          </span>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-label="Customers can design this product" className="pc-switch"
          disabled={busy} onClick={() => void save({ enabled: !on })} data-on={on ? "" : undefined} />
      </div>
      {error && <p className="pc-sub-line" role="alert" style={{ color: "var(--pc-red)", margin: "8px 0 0" }}>{error}</p>}
      {on && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {status !== "active" && <p className="pc-sub-line" style={{ margin: 0 }}>Customers see it once the product is published.</p>}
          <label style={{ display: "grid", gap: 4, fontSize: 13.5 }}>
            Drawn as
            <select className="pc-input" value={shape} disabled={busy} onChange={(e) => void save({ silhouette: e.target.value })}>
              {SHAPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
            <input type="checkbox" checked={embroidery} disabled={busy} onChange={(e) => void save({ embroidery: e.target.checked })} />
            Embroidery too
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="pc-btn" href={`/design?product=${productId}&new=1`} target="_blank" rel="noopener noreferrer">Try it</a>
            <Link className="pc-btn" href="/admin/tshirt-designer?tab=prices">Decoration prices</Link>
          </div>
        </div>
      )}
    </section>
  );
}
