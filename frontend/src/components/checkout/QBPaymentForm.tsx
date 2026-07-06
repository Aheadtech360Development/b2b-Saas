"use client";

/**
 * QBPaymentForm — card entry UI for QuickBooks Payments.
 *
 * Two modes:
 *  1. Manual entry: user types card details → backend tokenizes via POST /checkout/tokenize
 *  2. Saved card:   user picks a card from their QB wallet (future extension)
 *
 * On success, calls onToken(token) so the parent page can store it in the
 * checkout store and navigate to the review step.
 */

import { useState } from "react";
import { apiClient } from "@/lib/api-client";

interface QBPaymentFormProps {
  onToken: (token: string) => void;
  onBack: () => void;
  submitLabel?: string;
}

interface CardFields {
  card_number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
  name: string;
  postal_code: string;
}

const empty: CardFields = {
  card_number: "",
  exp_month: "",
  exp_year: "",
  cvc: "",
  name: "",
  postal_code: "",
};

export function QBPaymentForm({ onToken, onBack, submitLabel }: QBPaymentFormProps) {
  const [fields, setFields] = useState<CardFields>(empty);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof CardFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic client-side validation
    if (fields.card_number.replace(/\s/g, "").length < 13) {
      setError("Invalid card number");
      return;
    }
    if (!fields.exp_month || !fields.exp_year) {
      setError("Expiry month and year required");
      return;
    }
    if (!fields.cvc) {
      setError("CVC required");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await apiClient.post<{ token: string }>("/api/v1/checkout/tokenize", {
        card: {
          number: fields.card_number.replace(/\s/g, ""),
          expMonth: fields.exp_month.padStart(2, "0"),
          expYear: fields.exp_year,
          cvc: fields.cvc,
          name: fields.name || undefined,
          address: fields.postal_code ? { postalCode: fields.postal_code } : undefined,
        },
      });
      onToken(res.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Card tokenization failed");
      setIsProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Cardholder name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cardholder name
        </label>
        <input
          type="text"
          autoComplete="cc-name"
          value={fields.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Jane Smith"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Card number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Card number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={19}
          value={fields.card_number}
          onChange={(e) => {
            // Auto-space every 4 digits
            const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
            set("card_number", raw.replace(/(.{4})/g, "$1 ").trim());
          }}
          placeholder="1234 5678 9012 3456"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Month <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            maxLength={2}
            value={fields.exp_month}
            onChange={(e) => set("exp_month", e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="MM"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Year <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            maxLength={4}
            value={fields.exp_year}
            onChange={(e) => set("exp_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="YYYY"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CVC <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            value={fields.cvc}
            onChange={(e) => set("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="•••"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Billing postal code */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Billing zip / postal code
        </label>
        <input
          type="text"
          autoComplete="billing postal-code"
          maxLength={10}
          value={fields.postal_code}
          onChange={(e) => set("postal_code", e.target.value)}
          placeholder="10001"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Payments processed by QuickBooks Payments. Your card details are encrypted
        in transit and never stored on AF Apparels servers.
      </p>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-md border border-gray-300 bg-white text-gray-700 py-3 text-sm font-medium hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isProcessing}
          className="flex-1 rounded-md bg-brand-600 text-white py-3 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {isProcessing ? "Authorizing…" : (submitLabel ?? "Continue to Review")}
        </button>
      </div>
    </form>
  );
}
