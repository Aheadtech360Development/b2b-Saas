"use client";

/**
 * Products → a product → Duplicate, as Shopify's: the copy gets a name
 * ("Copy of …" to start with), starts as a draft unless the admin says
 * otherwise, and takes the pictures (on) and stock (off) when asked.
 * Everything else the product is made of comes along (see the backend's
 * services/product_duplicate): variants under new SKUs, options, price grid,
 * wholesale prices, categories, collections.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { adminService } from "@/services/admin.service";

export interface DuplicatedProduct { id: string; slug: string; name: string; status: string }

export function DuplicateProductModal({ product, onClose, onDone }: {
  product: { id: string; name: string };
  onClose: () => void;
  onDone: (copy: DuplicatedProduct) => void;
}) {
  const [name, setName] = useState(`Copy of ${product.name || "product"}`.slice(0, 255));
  const [active, setActive] = useState(false);
  const [images, setImages] = useState(true);
  const [stock, setStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const wanted = name.trim();
    if (!wanted) { setError("Give the copy a name."); return; }
    setSaving(true); setError("");
    try {
      onDone(await adminService.duplicateProduct(product.id, { name: wanted, status: active ? "active" : "draft", images, stock }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The copy was not made. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label="Duplicate product" onSubmit={save} data-duplicate-product>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">Duplicate product</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>
              A copy of {product.name || "this product"} with its variants, options, prices, categories and collections. Its SKUs end in -COPY.
            </p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px", display: "grid", gap: "14px" }}>
          {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
          <label><span className="pc-label">Title</span>
            <input className="pc-input" required autoFocus maxLength={255} value={name} onChange={(e) => setName(e.target.value)} data-copy-name /></label>
          <div>
            <span className="pc-label">Status</span>
            <div style={{ display: "flex", gap: "18px", marginTop: "4px" }}>
              <label className="pc-check-row"><input type="radio" className="pc-check" name="copy-status" checked={!active} onChange={() => setActive(false)} /> Draft</label>
              <label className="pc-check-row"><input type="radio" className="pc-check" name="copy-status" checked={active} onChange={() => setActive(true)} /> Active</label>
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            <span className="pc-label">Copy</span>
            <label className="pc-check-row"><input type="checkbox" className="pc-check" checked={images} onChange={(e) => setImages(e.target.checked)} data-copy-images /> Images</label>
            <label className="pc-check-row"><input type="checkbox" className="pc-check" checked={stock} onChange={(e) => setStock(e.target.checked)} data-copy-stock /> Inventory quantities</label>
          </div>
          <p className="pc-sub-line" style={{ fontSize: "13px", margin: 0 }}>
            Reviews are not copied. A supplier&apos;s stock stays with the original: the copy is your own product.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={saving}>{saving ? "Duplicating…" : "Duplicate"}</button>
        </div>
      </form>
    </div>
  );
}
