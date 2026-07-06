"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Category } from "@/types/product.types";

interface FilterSidebarProps {
  categories: Category[];
  sizes: string[];
  colors: string[];
  isOpen?: boolean;
  onClose?: () => void;
}

export function FilterSidebar({
  categories,
  sizes,
  colors,
  isOpen = true,
  onClose,
}: FilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category") ?? "";
  const currentSize = searchParams.get("size") ?? "";
  const currentColor = searchParams.get("color") ?? "";
  const currentQ = searchParams.get("q") ?? "";

  function buildUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page"); // reset to page 1 on filter change
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    return `/products?${params.toString()}`;
  }

  function handleCategoryClick(slug: string) {
    const next = currentCategory === slug ? null : slug;
    router.push(buildUrl({ category: next }));
    onClose?.();
  }

  function handleSizeClick(size: string) {
    const next = currentSize === size ? null : size;
    router.push(buildUrl({ size: next }));
    onClose?.();
  }

  function handleColorClick(color: string) {
    const next = currentColor === color ? null : color;
    router.push(buildUrl({ color: next }));
    onClose?.();
  }

  function handleClearAll() {
    router.push("/products");
    onClose?.();
  }

  const hasFilters = currentCategory || currentSize || currentColor;

  const sidebar = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Filters</h2>
        {hasFilters && (
          <button
            onClick={handleClearAll}
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-2">Category</h3>
        <ul className="space-y-1">
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                onClick={() => handleCategoryClick(cat.slug)}
                className={`text-sm w-full text-left py-1 px-2 rounded transition-colors ${
                  currentCategory === cat.slug
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {cat.name}
              </button>
              {(cat.children?.length ?? 0) > 0 && (
                <ul className="ml-3 mt-1 space-y-1">
                  {cat.children!.map((child) => (
                    <li key={child.id}>
                      <button
                        onClick={() => handleCategoryClick(child.slug)}
                        className={`text-sm w-full text-left py-1 px-2 rounded transition-colors ${
                          currentCategory === child.slug
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                        }`}
                      >
                        {child.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Sizes */}
      {sizes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Size</h3>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => (
              <button
                key={size}
                onClick={() => handleSizeClick(size)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  currentSize === size
                    ? "bg-brand-600 text-white border-brand-600"
                    : "border-gray-300 text-gray-700 hover:border-brand-400"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Colors */}
      {colors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Color</h3>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => handleColorClick(color)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  currentColor === color
                    ? "bg-brand-600 text-white border-brand-600"
                    : "border-gray-300 text-gray-700 hover:border-brand-400"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Desktop: always visible; Mobile: slide-in overlay
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:block w-56 flex-shrink-0">{sidebar}</aside>

      {/* Mobile slide-in */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40"
            aria-hidden="true"
            onClick={onClose}
          />
          <div className="relative ml-auto w-72 bg-white h-full shadow-xl p-6 overflow-y-auto">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              aria-label="Close filters"
            >
              ✕
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
