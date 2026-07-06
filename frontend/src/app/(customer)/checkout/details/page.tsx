"use client";

import { useRouter } from "next/navigation";
import { useCheckoutStore } from "@/stores/checkout.store";

export default function CheckoutDetailsPage() {
  const router = useRouter();
  const { poNumber, orderNotes, setPoNumber, setOrderNotes } = useCheckoutStore();

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Step 2 — Order Details</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 mb-6">
        <div>
          <label htmlFor="po_number" className="block text-sm font-medium text-gray-700 mb-1">
            PO Number
          </label>
          <input
            id="po_number"
            type="text"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="Optional purchase order reference"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label htmlFor="order_notes" className="block text-sm font-medium text-gray-700 mb-1">
            Order Notes
          </label>
          <textarea
            id="order_notes"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            rows={3}
            placeholder="Special instructions or delivery notes"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => router.push("/checkout/address")}
          className="flex-1 rounded-md border border-gray-300 bg-white text-gray-700 py-3 text-sm font-medium hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => router.push("/checkout/payment")}
          className="flex-1 rounded-md bg-brand-600 text-white py-3 text-sm font-medium hover:bg-brand-700"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
