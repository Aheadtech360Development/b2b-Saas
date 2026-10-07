// frontend/src/app/(customer)/products/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { productsService } from "@/services/products.service";
import { titleWithBrand } from "@/lib/brand";
import { ProductDetailClient } from "./ProductDetailClient";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await productsService.getProductBySlug(slug);
    return {
      title: product.meta_title ?? (await titleWithBrand(product.name)),
      description: product.meta_description ?? product.description ?? undefined,
      openGraph: {
        title: product.name,
        images: product.images?.[0]
          ? [{ url: product.images[0].url_large }]
          : [],
      },
    };
  } catch {
    return { title: "Product Not Found" };
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // let product;
  // try {
  //   product = await productsService.getProductBySlug(slug);
  // } catch {
  //   notFound();
  // }

  // Schema.org Product JSON-LD (T070, T136)
  // const jsonLd = {
  //   "@context": "https://schema.org",
  //   "@type": "Product",
  //   name: product.name,
  //   description: product.description,
  //   image: product.images?.map((i) => i.url_large) ?? [],
  //   sku: product.variants?.[0]?.sku,
  //   offers: product.variants?.map((v) => ({
  //     "@type": "Offer",
  //     sku: v.sku,
  //     price: v.effective_price ?? v.retail_price,
  //     priceCurrency: "USD",
  //     availability:
  //       (v.stock_quantity ?? 0) > 0
  //         ? "https://schema.org/InStock"
  //         : "https://schema.org/OutOfStock",
  //   })),
  // };

  // return (
  //   <>
  //     <script
  //       type="application/ld+json"
  //       dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
  //     />
  //     <ProductDetailClient product={product} />
  //   </>
  // );
  // A shop on the website builder draws the product in its product template.
  // A product that is not for sale here is a real 404 — status and all — and
  // the shop's own "page not found" template is drawn by app/not-found.tsx.
  // A shop that is not on the builder yet gets the app's own product page.
  const site = await loadBuilderPage("product", slug);
  if (site) {
    if (site.notFound) notFound();
    return <BuilderPage payload={site} />;
  }

  return <ProductDetailClient slug={slug} />;
}
