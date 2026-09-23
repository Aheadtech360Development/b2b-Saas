"use client";

/**
 * A product page in the brand's theme.
 *
 * The design's sections are drawn as they were designed, and where the design
 * put its gallery and buy box the store's own product controls go instead —
 * the same gallery, colour/size matrix, option configurator, quantities and
 * add to cart that a product page has without a theme. So buying, the cart
 * and checkout behave exactly as before; only what surrounds them changes.
 */
import { useEffect } from "react";
import { ProductDetailClient } from "@/app/(customer)/products/[slug]/ProductDetailClient";
import type { ThemePage } from "@/components/storefront/ThemeRenderer";

export default function ThemeProductPage({ page, slug }: { page: ThemePage; slug: string }) {
  useEffect(() => {
    document.body.dataset.themeActive = "1";
    return () => { delete document.body.dataset.themeActive; };
  }, []);

  return (
    <div className="brand-theme" data-theme-page={page.key}>
      {page.stylesheets.map((tag, i) => {
        const href = /href="([^"]+)"/.exec(tag)?.[1];
        return href ? <link key={i} rel="stylesheet" href={href} /> : null;
      })}
      <style dangerouslySetInnerHTML={{ __html: `${page.css}\nbody[data-theme-active] [data-app-chrome]{display:none!important}` }} />
      {page.svg_defs && <div aria-hidden style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: page.svg_defs }} />}
      {page.sections.map((section) =>
        section.role === "product_block" ? (
          <ProductDetailClient key={section.id} slug={slug} />
        ) : (
          <div key={section.id} data-theme-section={section.id} dangerouslySetInnerHTML={{ __html: section.html }} />
        ),
      )}
    </div>
  );
}
