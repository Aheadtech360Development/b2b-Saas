import { formatCurrency } from "@/lib/utils";

interface CartSummaryProps {
  subtotal: number;
  estimatedShipping: number;
  isValid: boolean;
  onCheckout: () => void;
  checkoutDisabledReason?: string;
}

export function CartSummary({
  subtotal,
  estimatedShipping,
  isValid,
  onCheckout,
  checkoutDisabledReason,
}: CartSummaryProps) {
  const total = subtotal + estimatedShipping;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Order Summary</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Estimated shipping</span>
          <span>
            {estimatedShipping > 0 ? formatCurrency(estimatedShipping) : "Calculated at checkout"}
          </span>
        </div>
        <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2 text-base">
          <span>Estimated total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <button
        onClick={onCheckout}
        disabled={!isValid}
        title={checkoutDisabledReason}
        className="w-full rounded-md bg-brand-600 text-white py-3 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Proceed to Checkout
      </button>

      {checkoutDisabledReason && (
        <p className="text-xs text-red-600 text-center">{checkoutDisabledReason}</p>
      )}
    </div>
  );
}
