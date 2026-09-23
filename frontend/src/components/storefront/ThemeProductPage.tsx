"use client";

/**
 * A product page in the brand's theme.
 *
 * The design's page is drawn as it was designed, all of it. The section where
 * the product is bought is marked in the data (role: "product_block") so the
 * store can take that part over when we decide exactly how — putting a second
 * product page inside this one gave it two breadcrumbs and two descriptions.
 */
import { useEffect } from "react";
import { pageBody, type ThemePage } from "@/components/storefront/ThemeRenderer";
import ThemeProductBuy, { type ThemeProductData } from "@/components/storefront/ThemeProductBuy";

export default function ThemeProductPage({ page, product, chromeInLayout = false }: {
  page: ThemePage;
  /** The product the page is showing, for its buying controls. */
  product?: ThemeProductData | null;
  slug?: string;
  /** The layout already drew the store's header and footer. */
  chromeInLayout?: boolean;
}) {
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
      {pageBody(page, chromeInLayout).map((section) => (
        <div key={section.id} data-theme-section={section.id} dangerouslySetInnerHTML={{ __html: section.html }} />
      ))}
      {product && <ThemeProductBuy product={product} />}
    </div>
  );
}
