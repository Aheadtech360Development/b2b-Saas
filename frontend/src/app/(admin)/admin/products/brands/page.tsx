"use client";

/**
 * Brands on product cards (the manager's ask: the supplier's logo, Gildan or
 * BELLA + CANVAS, on each product card beside the price). Every brand of the
 * shop's products, by their Vendor; its logo from S&S or the shop's own. Cards
 * show the logo, or the brand's name when there is none (backend
 * services/brand_logos, read by the website builder's product cards).
 */
import { useEffect, useState } from "react";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { ApiClientError } from "@/lib/api-client";
import { adminService, type BrandLogoRow, type BrandLogos } from "@/services/admin.service";

const FROM: Record<BrandLogoRow["source"], string> = { ss: "S&S", own: "You", "": "—" };

function names(list: string[]) {
  return list.length > 4 ? `${list.slice(0, 4).join(", ")} and ${list.length - 4} more` : list.join(", ");
}

export default function BrandsPage() {
  const [show, setShow] = useState(true);
  const [rows, setRows] = useState<BrandLogoRow[] | null>(null);
  // What the server last sent: the Save button wakes up only on a change.
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  function take(data: BrandLogos) {
    setShow(data.show);
    setRows(data.brands);
    setSaved(JSON.stringify([data.show, data.brands]));
  }

  useEffect(() => {
    adminService.listBrandLogos().then(take).catch(() => setFlash({ text: "The brands could not be loaded.", bad: true }));
  }, []);

  const dirty = rows !== null && JSON.stringify([show, rows]) !== saved;

  function edit(key: string, change: Partial<BrandLogoRow>) {
    setRows((cur) => cur && cur.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function save() {
    if (!rows) return;
    setBusy("save");
    try {
      take(await adminService.saveBrandLogos({ show, brands: rows.map(({ key, name, logo, hide }) => ({ key, name, logo, hide })) }));
      setFlash({ text: "Saved. Your store's product cards show it now." });
    } catch (e) {
      setFlash({ text: e instanceof ApiClientError ? e.message : "Not saved. Try again.", bad: true });
    }
    setBusy("");
  }

  async function fromSS() {
    setBusy("ss");
    try {
      const out = await adminService.brandLogosFromSS();
      take(out);
      const got = out.filled.length ? `${out.filled.length} logo${out.filled.length === 1 ? "" : "s"} from S&S: ${names(out.filled)}.` : "";
      const none = out.missing.length ? ` S&S has no logo for ${names(out.missing)}: add yours.` : "";
      setFlash({ text: (got + none).trim() || "Every brand already has its logo." });
    } catch (e) {
      setFlash({ text: e instanceof ApiClientError ? e.message : "S&S did not answer. Try again in a minute.", bad: true });
    }
    setBusy("");
  }

  return (
    <ProductsFrame
      active="brands"
      title="Brands"
      sub="The brand on each product card, beside the price: its logo, or its name."
      actions={<>
        <button type="button" className="pc-btn" data-brands-from-ss disabled={!!busy || dirty}
          title={dirty ? "Save your changes first" : undefined} onClick={() => void fromSS()}>
          {busy === "ss" ? "Asking S&S…" : "Get logos from S&S"}
        </button>
        <button type="button" className="pc-btn" data-kind="primary" disabled={!dirty || !!busy} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </>}
    >
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ marginBottom: "16px" }}>{flash.text}</div>
      )}

      <div className="pc-card" style={{ padding: "16px 20px", marginBottom: "16px" }}>
        <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ marginTop: "3px" }} />
          <span>
            <strong>Show brands on product cards</strong>
            <span style={{ display: "block", fontSize: "13px", color: "var(--pc-muted, #6B7280)", marginTop: "2px" }}>
              On every product card of your store, beside the price. A product&apos;s brand is its Vendor; products from
              S&amp;S carry theirs, with its logo. A brand with no logo shows its name.
            </span>
          </span>
        </label>
      </div>

      {rows === null ? (
        <p style={{ color: "var(--pc-muted, #6B7280)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="pc-empty">No brands yet. A product&apos;s brand is its Vendor, and products from S&amp;S carry theirs.</div>
      ) : (
        <div className="pc-card" style={{ overflow: "auto" }}>
          <table className="pc-table">
            <thead>
              <tr><th>Logo</th><th>Brand</th><th>Products</th><th>Logo from</th><th>On cards</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-brand={r.key}>
                  <td style={{ width: "140px" }}>
                    {r.logo
                      ? <img src={r.logo} alt={r.name} style={{ display: "block", height: "28px", maxWidth: "120px", objectFit: "contain" }} />
                      : <span className="pc-pill">Name only</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.products}</td>
                  <td>{FROM[r.source]}</td>
                  <td>
                    <input type="checkbox" aria-label={`Show ${r.name} on product cards`} checked={!r.hide}
                      onChange={(e) => edit(r.key, { hide: !e.target.checked })} />
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button type="button" className="pc-btn" onClick={() => setPicking(r.key)}>{r.logo ? "Change logo" : "Add logo"}</button>
                    {r.logo && (
                      <button type="button" className="pc-btn" style={{ marginLeft: "8px" }} onClick={() => edit(r.key, { logo: "", source: "own" })}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <MediaPicker
          onSelect={(url) => { edit(picking, { logo: url, source: "own" }); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </ProductsFrame>
  );
}
