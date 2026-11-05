"use client";

/**
 * Orders to place: what the shop's orders need from a supplier no orders are
 * sent to from here (SanMar): lines of products imported from it, and its part
 * of products with sources (services/suppliers/sourcing.py). The shop
 * downloads the list, orders it on the supplier's own website, then marks
 * those orders as ordered with the supplier's order number, which goes on each
 * order's history.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { suppliersService, type SupplierOrderRow, type WaitingOrder } from "@/services/suppliers.service";
import { Btn, INPUT, LABEL, MUTED, Spinner, errText, fmtDate } from "./ui";

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export function ManualOrders({ id, name }: { id: string; name: string }) {
  const [waiting, setWaiting] = useState<WaitingOrder[] | null>(null);
  const [recent, setRecent] = useState<SupplierOrderRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [po, setPo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await suppliersService.orders(id);
      setWaiting(r.waiting);
      setRecent(r.recent);
      setPicked(new Set(r.waiting.map((w) => w.order_id)));
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setWaiting([]);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const chosen = useMemo(() => (waiting ?? []).filter((w) => picked.has(w.order_id)), [waiting, picked]);
  // What to put in the supplier's cart: each SKU once, all chosen orders together.
  const totals = useMemo(() => {
    const out = new Map<string, { sku: string; color: string | null; size: string | null; qty: number }>();
    for (const w of chosen) {
      for (const l of w.lines) {
        const t = out.get(l.sku) ?? { sku: l.sku, color: l.color, size: l.size, qty: 0 };
        t.qty += l.qty;
        out.set(l.sku, t);
      }
    }
    return [...out.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [chosen]);

  function download() {
    const rows: (string | number)[][] = [["Order", "Date", "Customer", `${name} SKU`, "Product", "Colour", "Size", "Qty"]];
    for (const w of chosen) {
      for (const l of w.lines) rows.push([w.order_number, w.created_at.slice(0, 10), w.customer, l.sku, l.name, l.color ?? "", l.size ?? "", l.qty]);
    }
    const blob = new Blob([csv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-orders-to-place.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function mark() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await suppliersService.markOrdered(id, chosen.map((w) => w.order_id), po.trim());
      const placed = r.results.filter((x) => x.status === "placed").length;
      setMsg({ ok: true, text: `${placed} order${placed === 1 ? "" : "s"} marked as ordered from ${name}.` });
      setPo("");
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  if (waiting === null) return <div style={{ padding: 20, textAlign: "center" }}><Spinner /></div>;
  return (
    <div data-manual-orders>
      <p style={MUTED}>
        Orders are not sent to {name} from here yet. What an order needs from {name} shows below: products imported
        from {name}, and {name}&apos;s part of products with {name} as a source. Order it on {name}&apos;s website,
        then mark it as ordered.
      </p>
      {msg && <p style={{ ...MUTED, color: msg.ok ? "var(--pc-green, #1F7A4D)" : "var(--pc-red, #C8321F)", marginTop: 10 }} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}

      {waiting.length === 0 ? (
        <p style={{ ...MUTED, marginTop: 14 }} data-nothing-to-place>Nothing to order from {name} right now.</p>
      ) : (
        <>
          <table className="pc-table" style={{ marginTop: 14 }}>
            <thead><tr><th aria-label="Choose" /><th>Order</th><th>Customer</th><th>What</th><th className="pc-num">Pieces</th></tr></thead>
            <tbody>
              {waiting.map((w) => (
                <tr key={w.order_id} data-waiting={w.order_number}>
                  <td>
                    <input type="checkbox" aria-label={`Order ${w.order_number}`} checked={picked.has(w.order_id)}
                      onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(w.order_id)) n.delete(w.order_id); else n.add(w.order_id); return n; })} />
                  </td>
                  <td>{w.order_number}<div style={{ ...MUTED, fontSize: 12 }}>{fmtDate(w.created_at)}</div></td>
                  <td>{w.customer || "–"}</td>
                  <td>{w.lines.map((l) => `${l.qty} × ${[l.color, l.size].filter(Boolean).join(" ")} (${l.sku})`).join(", ")}</td>
                  <td className="pc-num">{w.pieces}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totals.length > 0 && (
            <div style={{ marginTop: 14 }} data-totals>
              <div style={LABEL}>To put in your {name} cart</div>
              <p style={MUTED}>{totals.map((t) => `${t.sku} × ${t.qty}`).join(" · ")}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
            <Btn kind="ghost" onClick={download} disabled={!chosen.length}>Download the list (CSV)</Btn>
            <label style={{ minWidth: 200 }}>
              <span style={LABEL}>{name} order number</span>
              <input style={INPUT} value={po} onChange={(e) => setPo(e.target.value)} placeholder="Optional" aria-label={`${name} order number`} />
            </label>
            <Btn onClick={() => void mark()} busy={busy} disabled={!chosen.length}>Mark {chosen.length} as ordered</Btn>
          </div>
        </>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 22 }} data-marked>
          <div style={LABEL}>Marked as ordered</div>
          <table className="pc-table">
            <thead><tr><th>Order</th><th>{name} order number</th><th className="pc-num">Pieces</th><th>When</th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}><td>{r.order_number ?? "–"}</td><td>{r.po_number || "–"}</td><td className="pc-num">{r.pieces}</td><td>{fmtDate(r.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
