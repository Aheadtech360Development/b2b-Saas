"use client";

interface ValidationItem {
  sku: string;
  quantity: number;
  status: string;
  product_name?: string | null;
  available_quantity?: number | null;
}

interface QuickOrderResult {
  valid: ValidationItem[];
  invalid: ValidationItem[];
  insufficient_stock: ValidationItem[];
  added_to_cart: number;
}

interface SkuValidationResultsProps {
  result: QuickOrderResult;
}

export function SkuValidationResults({ result }: SkuValidationResultsProps) {
  const { valid, invalid, insufficient_stock, added_to_cart } = result;
  const total = valid.length + invalid.length + insufficient_stock.length;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        <div className="flex-1 bg-green-50 border border-green-200 rounded-md p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{valid.length}</p>
          <p className="text-green-600">Added to cart</p>
        </div>
        <div className="flex-1 bg-red-50 border border-red-200 rounded-md p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{invalid.length}</p>
          <p className="text-red-600">Not found</p>
        </div>
        <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-md p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{insufficient_stock.length}</p>
          <p className="text-yellow-600">Insufficient stock</p>
        </div>
      </div>

      {valid.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-green-700 mb-2">Added ({valid.length})</h3>
          <table className="w-full text-sm border border-green-200 rounded-md overflow-hidden">
            <thead className="bg-green-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">SKU</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Product</th>
                <th className="text-right px-3 py-2 text-gray-600 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {valid.map((item) => (
                <tr key={item.sku} className="border-t border-green-100">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.sku}</td>
                  <td className="px-3 py-2 text-gray-700">{item.product_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {insufficient_stock.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-yellow-700 mb-2">Insufficient Stock ({insufficient_stock.length})</h3>
          <table className="w-full text-sm border border-yellow-200 rounded-md overflow-hidden">
            <thead className="bg-yellow-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">SKU</th>
                <th className="text-right px-3 py-2 text-gray-600 font-medium">Requested</th>
                <th className="text-right px-3 py-2 text-gray-600 font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {insufficient_stock.map((item) => (
                <tr key={item.sku} className="border-t border-yellow-100">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.sku}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                  <td className="px-3 py-2 text-right text-red-600">{item.available_quantity ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {invalid.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-red-700 mb-2">Not Found ({invalid.length})</h3>
          <div className="flex flex-wrap gap-1">
            {invalid.map((item) => (
              <span key={item.sku} className="px-2 py-0.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded font-mono">
                {item.sku}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
