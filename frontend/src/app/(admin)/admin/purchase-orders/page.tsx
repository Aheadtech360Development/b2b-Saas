"use client";

/**
 * Purchase orders — one of the Products tabs: stock bought from suppliers.
 * Each opens on its own page (design 37, components/admin/purchase-orders/
 * PurchaseOrderEditor): a draft is changed and sent there, and stock is
 * received there into Inventory.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { PO_STATUS } from "@/components/admin/purchase-orders/PurchaseOrderEditor";

interface Row {
  id: string; po_number: string; manufacturer_name: string | null; status: string;
  order_date: string | null; expected_delivery: string | null;
  total_expected: number; total_received: number; item_count: number;
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString() : "–");

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.get<Row[]>("/api/v1/admin/purchase-orders/")
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e instanceof ApiClientError && e.message ? e.message : "The purchase orders could not be loaded."));
  }, []);

  const open = (rows ?? []).filter((p) => ["draft", "sent", "partial"].includes(p.status)).length;
  return (
    <ProductsFrame active="purchase-orders" title="Purchase orders"
      sub={rows ? `Stock bought from your suppliers. ${open} open.` : "Stock bought from your suppliers."}
      actions={<>
        <Link href="/admin/purchase-orders/manufacturers" className="pc-btn">Suppliers list</Link>
        <Link href="/admin/purchase-orders/new" className="pc-btn" data-kind="primary">New purchase order</Link>
      </>}>
      <div className="pc-card" data-purchase-orders aria-busy={!rows && !error}>
        {error ? <div className="pc-empty">{error}</div>
          : !rows ? <div className="pc-empty">Loading purchase orders…</div>
          : rows.length === 0 ? (
            <div className="pc-empty">No purchase orders yet. <Link href="/admin/purchase-orders/new" className="pc-link">Make the first one</Link></div>
          ) : (
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "720px" }}>
                <thead><tr><th>Order</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Expected</th><th className="pc-num">Lines</th><th className="pc-num">Total</th><th className="pc-num">Received</th></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const [word, tone] = PO_STATUS[p.status] ?? [p.status, ""];
                    return (
                      <tr key={p.id} data-po-row={p.po_number} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/purchase-orders/${p.id}`)}>
                        <td><Link href={`/admin/purchase-orders/${p.id}`} className="pc-row-title" onClick={(e) => e.stopPropagation()}>{p.po_number || "Draft"}</Link></td>
                        <td>{p.manufacturer_name ?? "–"}</td>
                        <td><span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{word}</span></td>
                        <td>{day(p.order_date)}</td>
                        <td>{day(p.expected_delivery)}</td>
                        <td className="pc-num">{p.item_count}</td>
                        <td className="pc-num" style={{ fontWeight: 600 }}>{money(p.total_expected)}</td>
                        <td className="pc-num">{money(p.total_received)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </ProductsFrame>
  );
}
