/**
 * The brand's own header, announcement bar and footer.
 *
 * The theme draws these once in the design; the backend renders them on their
 * own (services/theme_render.render_chrome) so every storefront page can wear
 * them — the cart and the checkout included, which the design has no page of
 * its own for. Without this the shop changed into a different shop halfway
 * through buying something.
 *
 * Server-rendered, so it is in the HTML that arrives rather than appearing
 * after it.
 */
import { cache } from "react";
import { ANCHOR_PREFIX } from "@/components/storefront/ThemeRenderer";

export interface ThemeChromeData {
  css: string;
  stylesheets: string[];
  svg_defs: string;
  top: { id: string; html: string; role?: string }[];
  bottom: { id: string; html: string; role?: string }[];
}

/** The theme this brand publishes, and the chrome that goes around every page.
 *  Cached per request: the root layout and the storefront layout both ask. */
export const loadThemeChrome = cache(async (): Promise<ThemeChromeData | null> => {
  return (await loadStore()).chrome;
});

/** Which brand this address belongs to, what its shop wears, and what the
 *  browser tab should say and show for it. */
export interface Store {
  brand: string | null;
  chrome: ThemeChromeData | null;
  icon: string | null;
  title: string | null;
}

/** Which brand this address belongs to, and the chrome its shop wears.
 *  `brand: null` means no brand at all — the platform's own address. */
export const loadStore = cache(async (): Promise<Store> => {
  try {
    const { apiClient } = await import("@/lib/api-client");
    const r = await apiClient.get<{ active: boolean; chrome: ThemeChromeData | null; brand: string | null; icon?: string | null; title?: string | null }>(
      "/api/v1/storefront/theme-active", { skipAuth: true },
    );
    return {
      brand: r?.brand ?? null,
      chrome: r?.active ? (r.chrome ?? null) : null,
      icon: r?.icon ?? null,
      title: r?.title ?? null,
    };
  } catch {
    return { brand: null, chrome: null, icon: null, title: null };
  }
});

/** The stylesheet and symbols the chrome needs — once, above everything. */
export function ThemeChromeHead({ chrome }: { chrome: ThemeChromeData }) {
  return (
    <>
      {chrome.stylesheets.map((tag, i) => {
        const href = /href="([^"]+)"/.exec(tag)?.[1];
        return href ? <link key={i} rel="stylesheet" href={href} /> : null;
      })}
      <style dangerouslySetInnerHTML={{ __html: `${chrome.css}\n[data-app-chrome]{display:none!important}` }} />
      {chrome.svg_defs && (
        <div aria-hidden style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: chrome.svg_defs }} />
      )}
    </>
  );
}

export default function ThemeChrome({ sections }: { sections: ThemeChromeData["top"] }) {
  if (!sections.length) return null;
  return (
    <div className="brand-theme" data-theme-chrome>
      {sections.map((section) => (
        <div key={section.id} id={`${ANCHOR_PREFIX}${section.id}`} data-theme-section={section.id} dangerouslySetInnerHTML={{ __html: section.html }} />
      ))}
    </div>
  );
}
