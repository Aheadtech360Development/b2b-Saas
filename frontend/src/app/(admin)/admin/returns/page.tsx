"use client";

/**
 * Returns and reprints: what customers have asked to send back or have redone.
 *
 * A fault with a print comes in the same way a return does (the customer says
 * what is wrong with an order), so both are one list. Approving or rejecting
 * one emails the customer and is written on the order's own history.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { adminService } from "@/services/admin.service";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

interface RMA {
  id: string;
  rma_number: string;
  order_id: string;
  order_number?: string | null;
  status: string;
  reason: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

const STATUS: [string, string][] = [["pending", "To review"], ["approved", "Approved"], ["rejected", "Rejected"], ["completed", "Completed"], ["", "All"]];
const TONE: Record<string, string> = { pending: "amber", approved: "green", rejected: "red", completed: "blue" };

export default function AdminReturnsPage() {
  const { overview, refresh } = useOrdersOverview();
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionTarget, setActionTarget] = useState<RMA | null>(null);
  const [actionStatus, setActionStatus] = useState<"approved" | "rejected">("approved");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService.listRmas(statusFilter || undefined).then((d) => {
      if (cancelled) return;
      // The list comes a page at a time, inside `items`.
      const data = d as RMA[] | { items?: RMA[] };
      setRmas(Array.isArray(data) ? data : data?.items ?? []);
      setFailed(false);
    }).catch(() => { if (!cancelled) { setRmas([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionTarget) return;
    setIsUpdating(true);
    setError("");
    try {
      await adminService.updateRma(actionTarget.id, { status: actionStatus, admin_notes: adminNotes || undefined });
      setRmas((prev) => prev
        .map((r) => (r.id === actionTarget.id ? { ...r, status: actionStatus, admin_notes: adminNotes } : r))
        // Decided: it leaves a list that shows only what is still to review.
        .filter((r) => !statusFilter || r.status === statusFilter));
      setActionTarget(null); setAdminNotes("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally { setIsUpdating(false); }
  }

  return (
    <OrdersFrame active="returns" overview={overview}>
      <div className="pc-filters no-print" role="group" aria-label="Show">
        <div className="pc-seg">
          {STATUS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="pc-card">
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "680px" }}>
            <thead>
              <tr><th>Return</th><th>Order</th><th>Reason</th><th>Status</th><th>Asked on</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {loading && rmas.length === 0 && <tr><td colSpan={6}><div className="at-skel" style={{ height: "18px", width: "55%", borderRadius: "6px" }} /></td></tr>}
              {!loading && rmas.length === 0 && (
                <tr><td colSpan={6} className="pc-empty">
                  {failed ? "The returns could not be loaded. Reload to try again."
                    : statusFilter === "pending" ? "Nothing to review. A customer's request to return or reprint an order shows here."
                    : "None."}
                </td></tr>
              )}
              {rmas.map((r) => (
                <tr key={r.id} data-return={r.rma_number}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.rma_number}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/admin/orders/${r.order_id}`} className="pc-link">{r.order_number ? `Order ${r.order_number}` : "Open order"}</Link>
                  </td>
                  <td>
                    <div>{r.reason}</div>
                    {r.notes && <div className="pc-sub-line">{r.notes}</div>}
                    {r.admin_notes && <div className="pc-sub-line">Your note: {r.admin_notes}</div>}
                  </td>
                  <td><span className="pc-pill" data-tone={TONE[r.status]}>{r.status}</span></td>
                  <td style={{ color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="pc-num">
                    {r.status === "pending" && (
                      <button type="button" className="pc-btn" style={{ height: "36px" }} onClick={() => { setActionTarget(r); setActionStatus("approved"); setAdminNotes(""); setError(""); }}>Review</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pc-table-foot"><span>{rmas.length} {rmas.length === 1 ? "request" : "requests"}</span></div>
      </div>

      {actionTarget && (
        <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !isUpdating) setActionTarget(null); }}>
          <div className="pc-modal" role="dialog" aria-label={`Review ${actionTarget.rma_number}`} style={{ width: "min(460px, 100%)" }}>
            <div className="pc-panel-head">
              <div>
                <h2 className="pc-h2">Review {actionTarget.rma_number}</h2>
                <div className="pc-sub-line">{actionTarget.reason}</div>
              </div>
              <button type="button" className="pc-x" aria-label="Close" onClick={() => setActionTarget(null)} disabled={isUpdating}><X size={18} strokeWidth={2.2} /></button>
            </div>
            <form onSubmit={handleAction} className="pc-panel-body">
              {actionTarget.notes && <div className="pc-note" data-tone="blue">The customer wrote: {actionTarget.notes}</div>}
              <div className="pc-seg" role="group" aria-label="Decision" style={{ justifySelf: "start" }}>
                <button type="button" aria-pressed={actionStatus === "approved"} onClick={() => setActionStatus("approved")}>Approve</button>
                <button type="button" aria-pressed={actionStatus === "rejected"} onClick={() => setActionStatus("rejected")}>Reject</button>
              </div>
              <div>
                <label className="pc-label" htmlFor="return-note">A note for your records (optional)</label>
                <textarea id="return-note" className="pc-input" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
              </div>
              <p className="pc-sub-line" style={{ margin: 0 }}>The customer is emailed your decision, and it is written on the order&apos;s history.</p>
              {error && <div className="pc-note" data-tone="red">{error}</div>}
              <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="pc-btn" onClick={() => setActionTarget(null)} disabled={isUpdating}>Cancel</button>
                <button type="submit" className="pc-btn" data-kind="primary" disabled={isUpdating}>
                  {isUpdating ? "Saving…" : actionStatus === "approved" ? "Approve the return" : "Reject the return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </OrdersFrame>
  );
}
