export const dynamic = "force-dynamic";

import { Suspense } from "react";
import type { Metadata } from "next";
import { productsService } from "@/services/products.service";
import { ProductListClient } from "./ProductListClient";
import { sortSizes } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Products — AF Apparels Wholesale",
  description: "Browse our wholesale apparel catalog",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters = {
    category: typeof params.category === "string" ? params.category : undefined,
    size: typeof params.size === "string" ? params.size : undefined,
    color: typeof params.color === "string" ? params.color : undefined,
    q: typeof params.q === "string" ? params.q : undefined,
    page: params.page ? Number(params.page) : 1,
    page_size: 24,
    gender: typeof params.gender === "string" ? params.gender : undefined,
    in_stock: params.in_stock === "true" ? true : undefined,
    price_min: params.price_min ? Number(params.price_min) : undefined,
    price_max: params.price_max ? Number(params.price_max) : undefined,
    product_code: typeof params.product_code === "string" ? params.product_code : undefined,
  };

  const [categoriesResult, productsResult] = await Promise.allSettled([
    productsService.getCategories(),
    productsService.listProducts(filters),
  ]);

  const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const productData =
    productsResult.status === "fulfilled"
      ? productsResult.value
      : { items: [], total: 0, page: 1, page_size: 24, pages: 0 };

  const sizes = sortSizes(
    Array.from(
      new Set(
        productData.items.flatMap((p) =>
          p.variants?.map((v) => v.size).filter(Boolean) ?? []
        )
      )
    ) as string[],
    s => s
  );

  const colors = Array.from(
    new Set(
      productData.items.flatMap((p) =>
        p.variants?.map((v) => v.color).filter(Boolean) ?? []
      )
    )
  ).sort() as string[];

  const collectionName = filters.category
    ? (categories.find(c => c.slug === filters.category)?.name ?? "All Products")
    : "All Products";

  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Collection header */}
      <div style={{ background: "#FFFFFF", padding: "40px 24px 24px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "36px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15 }}>
            {collectionName}
          </h1>
        </div>
      </div>

      {/* ProductListClient owns the full collection layout (sidebar + grid) */}
      <Suspense fallback={null}>
        <ProductListClient
          initialProducts={productData.items}
          total={productData.total}
          currentPage={productData.page}
          pages={productData.pages}
          categories={categories}
          sizes={sizes}
          colors={colors}
        />
      </Suspense>
    </div>
  );
}
