"use client";

import { useEffect, useState } from "react";
import { accountService } from "@/services/account.service";

interface OrderItem {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  items: OrderItem[];
}

interface RmaItemForm {
  order_item_id: string;
  quantity: number;
  reason: string;
  selected: boolean;
}

const RMA_REASONS = [
  "Defective / damaged",
  "Wrong item received",
  "Not as described",
  "Missing parts",
  "Overshipment",
  "Other",
];

export default function RmaPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rmaReason, setRmaReason] = useState("");
  const [itemForms, setItemForms] = useState<RmaItemForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rmaList, setRmaList] = useState<any[]>([]);
  const [loadingRmas, setLoadingRmas] = useState(true);

  useEffect(() => {
    accountService.getOrders({ status: "delivered" }).then((r: any) => {
      setOrders(r.data?.items ?? r.data ?? []);
    });
    accountService.getRmas().then((r: any) => {
      setRmaList(r.data ?? []);
      setLoadingRmas(false);
    }).catch(() => setLoadingRmas(false));
  }, []);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setItemForms([]);
      return;
    }
    const order = orders.find((o) => o.id === selectedOrderId) ?? null;
    setSelectedOrder(order);
    if (order) {
      setItemForms(
        order.items.map((item) => ({
          order_item_id: item.id,
          quantity: 1,
          reason: "",
          selected: false,
        }))
      );
    }
  }, [selectedOrderId, orders]);

  function toggleItem(idx: number) {
    setItemForms((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, selected: !f.selected } : f))
    );
  }

  function updateItemField(idx: number, field: "quantity" | "reason", value: string | number) {
    setItemForms((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const selectedItems = itemForms.filter((f) => f.selected);
    if (!selectedOrderId) return setError("Please select an order.");
    if (!rmaReason) return setError("Please provide a reason for the return.");
    if (selectedItems.length === 0) return setError("Please select at least one item.");
    for (const item of selectedItems) {
      if (!item.reason) return setError("Please provide a reason for each selected item.");
      if (item.quantity < 1) return setError("Quantity must be at least 1 for each item.");
    }
    setSubmitting(true);
    try {
      const res: any = await accountService.createRma({
        order_id: selectedOrderId,
        reason: rmaReason,
        items: selectedItems.map((f) => ({
          order_item_id: f.order_item_id,
          quantity: f.quantity,
          reason: f.reason,
        })),
      });
      const rmaNumber = res.data?.rma_number ?? res.data?.id ?? "submitted";
      setSuccess(`RMA ${rmaNumber} submitted successfully. We'll review your request and be in touch.`);
      setSelectedOrderId("");
      setRmaReason("");
      setItemForms([]);
      const updated: any = await accountService.getRmas();
      setRmaList(updated.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Failed to submit RMA. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      processing: "bg-blue-100 text-blue-800",
      completed: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Returns & RMA</h1>
        <p className="text-sm text-gray-500 mt-1">Submit a return request for delivered orders.</p>
      </div>

      {/* Existing RMAs */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Your Return Requests</h2>
        </div>
        <div className="overflow-x-auto">
          {loadingRmas ? (
            <p className="px-6 py-4 text-sm text-gray-500">Loading...</p>
          ) : rmaList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">No return requests yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">RMA #</th>
                  <th className="px-6 py-3 text-left">Order</th>
                  <th className="px-6 py-3 text-left">Submitted</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rmaList.map((rma: any) => (
                  <tr key={rma.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs">{rma.rma_number}</td>
                    <td className="px-6 py-3">{rma.order?.order_number ?? rma.order_id}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(rma.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">{statusBadge(rma.status)}</td>
                    <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{rma.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New RMA Form */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Submit New Return Request</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {success && (
            <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-800">
              {success}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Order selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Order <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">-- Select a delivered order --</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {new Date(o.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {/* Overall reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Overall Return Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rmaReason}
              onChange={(e) => setRmaReason(e.target.value)}
              rows={3}
              placeholder="Describe why you are returning these items..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Item selection */}
          {selectedOrder && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Items to Return <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                {selectedOrder.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      itemForms[idx]?.selected
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={itemForms[idx]?.selected ?? false}
                        onChange={() => toggleItem(idx)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {item.product_name}{" "}
                          {item.variant_name && (
                            <span className="text-gray-500">— {item.variant_name}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          SKU: {item.sku} | Ordered: {item.quantity} | Unit: ${Number(item.unit_price).toFixed(2)}
                        </p>

                        {itemForms[idx]?.selected && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Return Qty
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={item.quantity}
                                value={itemForms[idx].quantity}
                                onChange={(e) =>
                                  updateItemField(idx, "quantity", parseInt(e.target.value) || 1)
                                }
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Item Reason
                              </label>
                              <select
                                value={itemForms[idx].reason}
                                onChange={(e) => updateItemField(idx, "reason", e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                required
                              >
                                <option value="">Select reason...</option>
                                {RMA_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !selectedOrderId}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Return Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
