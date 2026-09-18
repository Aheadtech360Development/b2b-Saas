"use client";

/**
 * Customer's gang sheet orders inside My Account — the discoverable place a buyer
 * looks for status, separate from the builder page. Reuses the same myOrders
 * endpoint and the shared timeline so status reads identically everywhere.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetOrder,
} from "@/services/gangSheets.service";
import { GangSheetTimeline } from "@/components/storefront/GangSheetTimeline";
import { cartService } from "@/services/cart.service";

/** Older rows predate `kind`; a job with no sheet size is an upload by size. */
const kindOf = (o: GangSheetOrder) => o.kind ?? (o.sheet_size_id ? "gang_sheet" : "upload_by_size");

export default function AccountGangSheetsPage() {
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revised, setRevised] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setRevised(q.get("revised") === "1");
    setSaved(q.get("saved") === "1");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService.myOrders().then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusy(id);
    setErr(null);
    try { await fn(id); load(); }
    catch { setErr("That didn't go through. Please try again."); }
    finally { setBusy(null); }
  }

  // "Reorder" has to end somewhere the buyer can pay. Cloning the job and
  // refreshing the list left a new row sitting at Submitted with no way to
  // check out — the button looked like it had done nothing.
  async function reorder(id: string) {
    setBusy(id);
    setErr(null);
    try {
      const clone = await gangSheetsService.reorder(id);
      await cartService.addGangSheet(clone.id);
      window.location.href = "/cart";
    } catch {
      setErr("Could not reorder this job. Please try again.");
      setBusy(null);
      load();
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "4px", fontFamily: "'Playfair Display', serif" }}>My Print Jobs</h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "22px" }}>
        Gang sheets you built and designs you uploaded by size — track each one from review to production.
      </p>

      {saved && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", marginBottom: "14px" }}>
          Your gang sheet is saved. Open it with &ldquo;Edit in builder&rdquo; to keep working on it, and use Save &amp; Add to Cart there when it&apos;s ready.
        </div>
      )}

      {revised && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", marginBottom: "14px" }}>
          Your changes were saved and sent back to the print team for review.
        </div>
      )}

      {err && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", marginBottom: "14px" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#888", fontSize: "14px" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "28px", textAlign: "center", color: "#666", fontSize: "14px" }}>
          You haven&apos;t placed any print jobs yet.
          <div style={{ marginTop: "12px" }}>
            <Link href="/products" style={{ color: "var(--brand-primary, #1C3557)", fontWeight: 700, textDecoration: "none" }}>Browse products →</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {orders.map((o) => {
            const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
            return (
              <div key={o.id} style={{ background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: "#F1F1F0", color: "#4A4A4A", padding: "2px 8px", borderRadius: "20px" }}>
                        {kindOf(o) === "upload_by_size" ? "Upload by size" : "Gang sheet"}
                      </span>
                      {o.reference}{(o.version ?? 1) > 1 ? <span style={{ color: "#888", fontWeight: 500 }}> · v{o.version}</span> : null}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888" }}>
                      {o.sheet_name} · {o.sheet_quantity} {kindOf(o) === "upload_by_size" ? `print${o.sheet_quantity === 1 ? "" : "s"}` : `sheet${o.sheet_quantity === 1 ? "" : "s"}`} · ${o.subtotal.toFixed(2)}
                    </div>
                    {o.supplier_notes && (
                      <div style={{ fontSize: "13px", color: "#9A3412", marginTop: "6px", background: "#FFF7ED", borderRadius: "6px", padding: "8px 10px" }}>
                        <strong>From the print team:</strong> {o.supplier_notes}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ background: c.bg, color: c.fg, padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
                      {GANG_SHEET_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    {o.status === "revision_requested" && kindOf(o) === "upload_by_size" && o.product_slug && (
                      <Link href={`/products/${o.product_slug}?revise=${o.id}`}
                        style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                        Update &amp; resubmit
                      </Link>
                    )}
                    {/* The builder page no longer lists past sheets, so reopening
                        one happens from here, straight into that sheet. */}
                    {(o.status === "submitted" || o.status === "revision_requested") && kindOf(o) === "gang_sheet" && (
                      <Link href={`/gang-sheets?edit=${o.id}${o.product_id ? `&product=${o.product_id}` : ""}`}
                        style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                        Edit in builder
                      </Link>
                    )}
                    {o.status === "revision_requested" && (
                      <button disabled={busy === o.id} onClick={() => act(o.id, gangSheetsService.resubmit)}
                        style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        {busy === o.id ? "…" : "Resubmit"}
                      </button>
                    )}
                    <button disabled={busy === o.id} onClick={() => reorder(o.id)}
                      style={{ background: "none", border: "1px solid #DDD9D2", padding: "6px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                      {busy === o.id ? "Adding…" : "Reorder"}
                    </button>
                  </div>
                </div>
                <GangSheetTimeline status={o.status} timeline={o.status_timeline} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
