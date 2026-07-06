"use client";

import { useRef, useState } from "react";

interface SkuInputProps {
  onSubmit: (items: { sku: string; quantity: number }[]) => void;
  isLoading?: boolean;
}

function parseLine(line: string): { sku: string; quantity: number } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/[,\t\s]+/);
  const sku = parts[0]?.trim();
  const qty = parseInt(parts[1] ?? "1", 10);
  if (!sku) return null;
  return { sku, quantity: isNaN(qty) || qty < 1 ? 1 : qty };
}

export function SkuInput({ onSubmit, isLoading = false }: SkuInputProps) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = text
      .split("\n")
      .map(parseLine)
      .filter((i): i is { sku: string; quantity: number } => i !== null);
    if (items.length > 0) onSubmit(items);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setText((prev) => (prev ? `${prev}\n${content}` : content));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const lineCount = text.split("\n").filter((l) => parseLine(l) !== null).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SKU List
          <span className="ml-1 text-xs text-gray-400">(one per line: SKU,Qty or SKU Qty)</span>
        </label>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"ABC-001, 12\nABC-002, 6\nXYZ-100, 24"}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {lineCount > 0 && (
          <p className="text-xs text-gray-500 mt-1">{lineCount} item{lineCount !== 1 ? "s" : ""} detected</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm text-brand-600 hover:text-brand-800 border border-brand-300 rounded-md px-3 py-1.5"
        >
          Upload CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="submit"
          disabled={isLoading || lineCount === 0}
          className="bg-brand-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {isLoading ? "Validating…" : "Validate & Add to Cart"}
        </button>
      </div>
    </form>
  );
}
