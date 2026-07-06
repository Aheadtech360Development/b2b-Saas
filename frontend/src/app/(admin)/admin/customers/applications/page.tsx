// frontend/src/app/(admin)/admin/customers/applications/page.tsx
"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";
import { ApprovalModal } from "@/components/admin/ApprovalModal";

interface Application {
  id: string;
  company_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  business_type: string | null;
  tax_id: string | null;
  website: string | null;
  expected_monthly_volume: string | null;
  // Extended fields
  company_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  how_heard: string | null;
  num_employees: string | null;
  num_sales_reps: string | null;
  secondary_business: string | null;
  estimated_annual_volume: string | null;
  ppac_number: string | null;
  ppai_number: string | null;
  asi_number: string | null;
  fax: string | null;
  status: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

function DetailModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const fullAddress = [app.address_line1, app.address_line2, app.city, app.state_province, app.postal_code, app.country].filter(Boolean).join(", ");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{app.company_name}</h2>
            <p className="text-sm text-gray-500">{app.first_name} {app.last_name} · {app.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-medium leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Contact */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Contact Information</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="First Name" value={app.first_name} />
              <DetailField label="Last Name" value={app.last_name} />
              <DetailField label="Email" value={app.email} />
              <DetailField label="Phone" value={app.phone} />
              <DetailField label="Fax" value={app.fax} />
              <DetailField label="Company Email" value={app.company_email} />
            </dl>
          </section>

          {/* Company */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Company Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="Company Name" value={app.company_name} />
              <DetailField label="Business Type" value={app.business_type} />
              <DetailField label="Tax ID / EIN" value={app.tax_id} />
              <DetailField label="Website" value={app.website} />
              <DetailField label="Secondary Business" value={app.secondary_business} />
              <DetailField label="# Employees" value={app.num_employees} />
              <DetailField label="# Sales Reps" value={app.num_sales_reps} />
              <DetailField label="How Heard" value={app.how_heard} />
            </dl>
          </section>

          {/* Address */}
          {fullAddress && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Address</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailField label="Address Line 1" value={app.address_line1} />
                <DetailField label="Address Line 2" value={app.address_line2} />
                <DetailField label="City" value={app.city} />
                <DetailField label="State / Province" value={app.state_province} />
                <DetailField label="Postal Code" value={app.postal_code} />
                <DetailField label="Country" value={app.country} />
              </dl>
            </section>
          )}

          {/* Volume & Industry IDs */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Volume & Industry</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="Expected Monthly Volume" value={app.expected_monthly_volume} />
              <DetailField label="Est. Annual Volume" value={app.estimated_annual_volume} />
              <DetailField label="PPAC #" value={app.ppac_number} />
              <DetailField label="PPAI #" value={app.ppai_number} />
              <DetailField label="ASI #" value={app.asi_number} />
            </dl>
          </section>

          {/* Status */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Application Status</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</dt>
                <dd className="mt-0.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {app.status}
                  </span>
                </dd>
              </div>
              <DetailField label="Submitted" value={new Date(app.created_at).toLocaleDateString()} />
              {app.rejection_reason && <div className="col-span-2"><DetailField label="Rejection Reason" value={app.rejection_reason} /></div>}
              {app.admin_notes && <div className="col-span-2"><DetailField label="Admin Notes" value={app.admin_notes} /></div>}
            </dl>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [isLoading, setIsLoading] = useState(false);
  const [approveTarget, setApproveTarget] = useState<Application | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [detailTarget, setDetailTarget] = useState<Application | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listApplications(statusFilter || undefined) as Application[];
      setApplications(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setIsRejecting(true);
    setError(null);
    try {
      await adminService.rejectApplication(rejectTarget.id, rejectReason);
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Wholesale Applications</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Contact</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Business Type</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Submitted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && applications.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No applications</td></tr>
            ) : (
              applications.map((app) => (
                <tr key={app.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{app.company_name}</p>
                    {app.website && <p className="text-xs text-gray-400">{app.website}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{app.first_name} {app.last_name}</p>
                    <p className="text-xs text-gray-400">{app.email}</p>
                    {app.phone && <p className="text-xs text-gray-400">{app.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{app.business_type ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(app.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDetailTarget(app)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                      </button>
                      {app.status === "pending" && (
                        <>
                          <button
                            onClick={() => setApproveTarget(app)}
                            className="text-xs text-green-700 hover:text-green-900 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectTarget(app)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {detailTarget && (
        <DetailModal app={detailTarget} onClose={() => setDetailTarget(null)} />
      )}

      {/* Approval modal */}
      {approveTarget && (
        <ApprovalModal
          applicationId={approveTarget.id}
          companyName={approveTarget.company_name}
          onClose={() => setApproveTarget(null)}
          onSuccess={() => { setApproveTarget(null); load(); }}
        />
      )}

      {/* Inline reject dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Reject Application</h2>
            <p className="text-sm text-gray-500 mb-4">{rejectTarget.company_name}</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setRejectTarget(null); setRejectReason(""); }} className="flex-1 border border-gray-300 rounded-md py-2 text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting || !rejectReason.trim()}
                className="flex-1 bg-red-600 text-white rounded-md py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
