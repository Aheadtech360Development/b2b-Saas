"use client";

/**
 * ThemeRenderer — draws a page of the brand's own theme.
 *
 * The HTML comes from the design file we imported for that brand, with the
 * admin's saved text, links and images already in it (see backend
 * services/theme_render.py). It is not built here and not rewritten here: the
 * design's own markup and CSS render as they were drawn, which is why the
 * spacing and responsive behaviour survive.
 *
 * The theme brings its own header and footer, so the app's own chrome steps
 * aside while a themed page is on screen.
 */
import { useEffect } from "react";

export interface ThemePage {
  key: string;
  label: string;
  kind: string;
  css: string;
  stylesheets: string[];
  svg_defs: string;
  sections: { id: string; html: string; role?: string }[];
}

export default function ThemeRenderer({ page, chromeInLayout = false }: {
  page: ThemePage;
  /** The layout already drew the store's header and footer, so this page
   *  leaves its own copies out. False keeps them, which is what a page needs
   *  if the chrome could not be loaded. */
  chromeInLayout?: boolean;
}) {
  useEffect(() => {
    // The theme draws its own header and footer; hide the app's while it is up.
    document.body.dataset.themeActive = "1";
    return () => { delete document.body.dataset.themeActive; };
  }, []);

  return (
    <div className="brand-theme" data-theme-page={page.key}>
      {page.stylesheets.map((tag, i) => (
        <link key={i} rel="stylesheet" href={hrefOf(tag)} />
      ))}
      {/* The design's own stylesheet, and the app chrome it replaces. */}
      <style dangerouslySetInnerHTML={{ __html: `${page.css}\nbody[data-theme-active] [data-app-chrome]{display:none!important}` }} />
      {page.svg_defs && <div aria-hidden style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: page.svg_defs }} />}
      {pageBody(page, chromeInLayout).map((section) => (
        <div key={section.id} id={`${ANCHOR_PREFIX}${section.id}`} data-theme-section={section.id} dangerouslySetInnerHTML={{ __html: section.html }} />
      ))}
    </div>
  );
}

/** The design's own header and footer are drawn once by the layout, around
 *  every page of the shop, so a page does not carry a second copy. */
export function pageBody(page: ThemePage, chromeInLayout: boolean): ThemePage["sections"] {
  if (!chromeInLayout) return page.sections;
  return page.sections.filter((s) => !CHROME_ROLES.has(s.role ?? ""));
}

const CHROME_ROLES = new Set(["announcement", "header", "footer"]);

/** Every section answers to an id, so a menu or footer link can point at a
 *  part of a page — "/#s-<section>" — and land on it. Matches the prefix the
 *  admin's link picker offers (backend services/theme_render.ANCHOR_PREFIX). */
export const ANCHOR_PREFIX = "s-";

/** The href out of a <link …> the design carried (fonts, mostly). */
function hrefOf(tag: string): string {
  const match = /href="([^"]+)"/.exec(tag);
  return match?.[1] ?? "";
}
