"use client";

import { useState } from "react";
import { adminService } from "@/services/admin.service";

interface VariantGeneratorProps {
  productId: string;
  onGenerated: () => void;
}

export function VariantGenerator({ productId, onGenerated }: VariantGeneratorProps) {
  const [colorInput, setColorInput] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [basePrice, setBasePrice] = useState("0.00");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ generated: number } | null>(null);

  const colors = colorInput.split(",").map((c) => c.trim()).filter(Boolean);
  const sizes = sizeInput.split(",").map((s) => s.trim()).filter(Boolean);
  const preview = colors.flatMap((c) => sizes.map((s) => `${c} / ${s}`));

  async function handleGenerate() {
    if (!colors.length || !sizes.length) return;
    setIsGenerating(true);
    try {
      const res = await adminService.bulkGenerateVariants(productId, {
        colors,
        sizes,
        base_retail_price: parseFloat(basePrice),
      }) as { generated: number };
      setResult(res);
      onGenerated();
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Colors <span className="text-gray-400">(comma-separated)</span>
          </label>
          <input
            type="text"
            placeholder="Black, White, Navy"
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sizes <span className="text-gray-400">(comma-separated)</span>
          </label>
          <input
            type="text"
            placeholder="S, M, L, XL"
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Base Retail Price</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {preview.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">
            Preview: {preview.length} variant{preview.length !== 1 ? "s" : ""} will be generated
          </p>
          <div className="flex flex-wrap gap-1">
            {preview.slice(0, 20).map((v) => (
              <span key={v} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                {v}
              </span>
            ))}
            {preview.length > 20 && (
              <span className="text-xs text-gray-400">+{preview.length - 20} more</span>
            )}
          </div>
        </div>
      )}

      {result && (
        <p className="text-sm text-green-600">
          {result.generated} variant{result.generated !== 1 ? "s" : ""} generated successfully.
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || !colors.length || !sizes.length}
        className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
      >
        {isGenerating ? "Generating…" : "Generate Variants"}
      </button>
    </div>
  );
}
