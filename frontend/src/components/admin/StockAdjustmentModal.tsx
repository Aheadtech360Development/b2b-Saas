"use client";

import { useState } from "react";
import { adminService } from "@/services/admin.service";

const REASONS = [
  { value: "received", label: "Received" },
  { value: "damaged", label: "Damaged" },
  { value: "returned", label: "Returned" },
  { value: "correction", label: "Correction" },
  { value: "sold", label: "Sold" },
  { value: "migration", label: "Migration" },
];

interface StockAdjustmentModalProps {
  sku: string;
  currentQty: number;
  variantId: string;
  warehouseId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function StockAdjustmentModal({
  sku,
  currentQty,
  variantId,
  warehouseId,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps) {
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("received");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newQty = currentQty + delta;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (delta === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminService.adjustStock({
        variant_id: variantId,
        warehouse_id: warehouseId,
        quantity_delta: delta,
        reason,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Adjust Stock</h2>
        <p className="text-sm text-gray-500 mb-4">SKU: <span className="font-mono">{sku}</span></p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded">
            <div className="text-center">
              <p className="text-xs text-gray-500">Current</p>
              <p className="text-lg font-bold text-gray-900">{currentQty}</p>
            </div>
            <div className="text-gray-400">→</div>
            <div className="text-center">
              <p className="text-xs text-gray-500">New</p>
              <p className={`text-lg font-bold ${newQty < 0 ? "text-red-600" : "text-gray-900"}`}>{newQty}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment</label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="+10 or -5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 rounded-md py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || delta === 0 || newQty < 0}
              className="flex-1 bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Apply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
