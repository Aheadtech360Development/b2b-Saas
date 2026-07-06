"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

interface RMA {
  id: string;
  rma_number: string;
  order_id: string;
  status: string;
  reason: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};

export default function AdminReturnsPage() {
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionTarget, setActionTarget] = useState<RMA | null>(null);
  const [actionStatus, setActionStatus] = useState<"approved" | "rejected">("approved");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    adminService.listRmas(statusFilter || undefined).then((d) => {
      const data = d as RMA[];
      setRmas(Array.isArray(data) ? data : []);
    });
  }, [statusFilter]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionTarget) return;
    setIsUpdating(true);
    try {
      await adminService.updateRma(actionTarget.id, { status: actionStatus, notes: adminNotes || undefined });
      setRmas((prev) => prev.map((r) => (r.id === actionTarget.id ? { ...r, status: actionStatus, admin_notes: adminNotes } : r)));
      setActionTarget(null); setAdminNotes("");
    } finally { setIsUpdating(false); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Returns (RMA)</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">RMA #</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Reason</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rmas.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No RMAs</td></tr>
            ) : rmas.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">{r.rma_number}</td>
                <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{r.reason}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {r.status === "pending" && (
                    <button onClick={() => { setActionTarget(r); setActionStatus("approved"); }} className="text-xs text-brand-600 hover:text-brand-800">Review</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Review RMA</h2>
            <p className="text-sm text-gray-500 mb-4">{actionTarget.rma_number}</p>
            <form onSubmit={handleAction} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setActionStatus("approved")}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border ${actionStatus === "approved" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-700"}`}>
                  Approve
                </button>
                <button type="button" onClick={() => setActionStatus("rejected")}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border ${actionStatus === "rejected" ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-700"}`}>
                  Reject
                </button>
              </div>
              <textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Admin notes (optional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="button" onClick={() => { setActionTarget(null); setAdminNotes(""); }} className="flex-1 border border-gray-300 rounded-md py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isUpdating} className="flex-1 bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  {isUpdating ? "Saving…" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
