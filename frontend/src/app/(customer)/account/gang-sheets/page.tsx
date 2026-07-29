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

export default function AccountGangSheetsPage() {
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService.myOrders().then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusy(id);
    try { await fn(id); load(); } finally { setBusy(null); }
  }

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "4px", fontFamily: "'Playfair Display', serif" }}>My Gang Sheets</h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "22px" }}>
        Track your gang sheet orders and their status here.
      </p>

      {loading ? (
        <div style={{ color: "#888", fontSize: "14px" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "28px", textAlign: "center", color: "#666", fontSize: "14px" }}>
          You haven&apos;t submitted any gang sheets yet.
          <div style={{ marginTop: "12px" }}>
            <Link href="/gang-sheets" style={{ color: "var(--brand-primary, #1C3557)", fontWeight: 700, textDecoration: "none" }}>Build a gang sheet →</Link>
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
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>
                      {o.reference}{(o.version ?? 1) > 1 ? <span style={{ color: "#888", fontWeight: 500 }}> · v{o.version}</span> : null}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888" }}>
                      {o.sheet_name} · {o.sheet_quantity} sheet(s) · ${o.subtotal.toFixed(2)}
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
                    {o.status === "revision_requested" && (
                      <button disabled={busy === o.id} onClick={() => act(o.id, gangSheetsService.resubmit)}
                        style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        {busy === o.id ? "…" : "Resubmit"}
                      </button>
                    )}
                    <button disabled={busy === o.id} onClick={() => act(o.id, gangSheetsService.reorder)}
                      style={{ background: "none", border: "1px solid #DDD9D2", padding: "6px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                      Reorder
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
