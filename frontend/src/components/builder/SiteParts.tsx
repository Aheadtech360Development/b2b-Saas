/**
 * A builder shop's pieces as the storefront draws them: the look (fonts,
 * colours, base styles), the header and footer, and a page.
 *
 * Server components. The storefront shell draws the head and the chrome
 * around every page — the builder's own pages and the app's working ones
 * (cart, checkout, account) alike — so the shop never changes into a
 * different shop halfway through buying something.
 */
import type { ReactNode } from "react";
import type { BuilderNode, SitePayload, SiteSettings } from "@/lib/builder/types";
import { treeCss, themeCss } from "@/lib/builder/style";
import { fontFaceCss, googleCssUrl } from "@/lib/builder/fonts";
import { BASE_CSS } from "@/lib/builder/baseCss";
import ThemeProductBuy, { type ThemeProductData } from "@/components/storefront/ThemeProductBuy";
import { Tree, type RenderCtx } from "./render";

/** The context a server-cleaned payload renders with. */
export function payloadCtx(payload: SitePayload, extra: Partial<RenderCtx> = {}): RenderCtx {
  return {
    data: payload.data,
    globals: payload.globals ?? {},
    page: payload.page ? { title: payload.page.title, tree: payload.page.tree } : null,
    query: payload.query ?? "",
    route: payload.route,
    trusted: true,
    ...extra,
  };
}

/** Styles text, minus anything that could close the tag it sits in. */
function styleText(css: string): string {
  return css.replace(/<\/?style/gi, "");
}

/** Fonts, colours and the base look — once per page, above everything. */
export function SiteHead({ settings, fonts }: { settings: SiteSettings; fonts: SitePayload["fonts"] }) {
  const google = googleCssUrl(fonts?.google ?? []);
  const faces = fontFaceCss(fonts?.custom ?? []);
  return (
    <>
      {google && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={google} />
        </>
      )}
      <style dangerouslySetInnerHTML={{ __html: styleText(`${BASE_CSS}\n${faces}\n${themeCss(settings ?? {})}`) }} />
    </>
  );
}

function sticky(tree: BuilderNode | null | undefined): boolean {
  if (!tree) return false;
  if (tree.type === "section" && (tree.props as Record<string, unknown> | undefined)?.sticky) return true;
  return tree.type === "stack" && (tree.children ?? []).some((c) => c.type === "section" && !!(c.props as Record<string, unknown> | undefined)?.sticky);
}

/** One part — the announcement bar, the header or the footer. */
export function SitePart({ payload, part }: { payload: SitePayload; part: "announcement" | "header" | "footer" }): ReactNode {
  const tree = payload.parts?.[part];
  if (!tree) return null;
  const ctx = payloadCtx(payload);
  const css = treeCss(tree, ...Object.values(payload.globals ?? {}));
  const Wrapper = part === "footer" ? "footer" : part === "header" ? "header" : "div";
  return (
    <Wrapper className="bsite" data-part={part} data-sticky={part === "header" && sticky(tree) ? "" : undefined}>
      <style dangerouslySetInnerHTML={{ __html: styleText(css) }} />
      <div className="bsite-in"><Tree tree={tree} ctx={ctx} /></div>
    </Wrapper>
  );
}

/**
 * A builder page's body. On a product page the buying controls are bound by
 * the same component the imported-theme product page uses, so there is one
 * cart and one set of stock and price rules — not a second copy of them.
 */
export function BuilderPage({ payload, sort }: { payload: SitePayload; sort?: string }) {
  const ctx = payloadCtx(payload, { sort });
  const css = treeCss(payload.template, payload.page?.tree, ...Object.values(payload.globals ?? {}));
  const product = payload.data.product as unknown as ThemeProductData | null;
  return (
    <div className="bsite" data-route={payload.templateType} data-product-id={product?.id}>
      <style dangerouslySetInnerHTML={{ __html: styleText(css) }} />
      <div className="bsite-in"><Tree tree={payload.template} ctx={ctx} /></div>
      {product && <ThemeProductBuy product={product} />}
    </div>
  );
}
