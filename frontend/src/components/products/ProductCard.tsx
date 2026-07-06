"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { ProductListItem } from "@/types/product.types";

interface ProductCardProps {
  product: ProductListItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const primaryImage = product.primary_image;
  const primaryVariant = product.variants?.[0];
  const price = primaryVariant?.effective_price ?? primaryVariant?.retail_price;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-lg border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-square bg-gray-100">
        {primaryImage ? (
          <Image
            src={primaryImage.url_medium_webp ?? primaryImage.url_medium}
            alt={primaryImage.alt_text ?? product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
            No image
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-xs text-gray-500 mb-1 truncate">
          {product.categories?.map((c) => c.name).join(", ")}
        </p>
        <h3 className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">
          {product.name}
        </h3>

        <div className="mt-2 flex items-baseline gap-2">
          {price && (
            <span className="text-base font-semibold text-brand-700">
              {formatCurrency(Number(price))}
            </span>
          )}
          {primaryVariant?.effective_price &&
            primaryVariant.effective_price !== primaryVariant.retail_price && (
              <span className="text-xs text-gray-400 line-through">
                {formatCurrency(Number(primaryVariant.retail_price))}
              </span>
            )}
        </div>

        <p className="mt-1 text-xs text-gray-400">
          {product.variants?.length ?? 0} variant{product.variants?.length !== 1 ? "s" : ""}
        </p>
      </div>
    </Link>
  );
}
