/**
 * Where a link inside the draft's preview leads — inside the preview.
 *
 * The preview draws the draft at /site-builder/preview, but the draft's links
 * are the shop's own addresses: /search, /products, a product's page. Followed
 * as they are, they leave the preview for the live shop, which is still
 * wearing its old design until the builder site is switched on — so searching
 * in the preview landed on a page that looked like a different shop.
 *
 * This turns a shop address the builder draws into the preview's address for
 * the same page. Anything else (the cart's checkout, an account page, the gang
 * sheet builder, another site) is not the draft's to draw: null.
 */
import { RESERVED_SLUGS } from "./doc";

export const PREVIEW_PATH = "/site-builder/preview";

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The app's own pages at one-word addresses, which the builder never draws
 *  even when the draft has a page by that name. */
const APP_PAGES = new Set(["quote", "policies", "print-guide", "private-label", "product-specs", "style-sheets"]);

/** What is carried from one preview address to the next when only the page or the sort changes. */
const PAGING = ["page", "sort"] as const;

export function previewTarget(url: URL, here: { origin: string; search: string }): URLSearchParams | null {
  if (url.origin !== here.origin) return null;
  const sp = url.searchParams;
  const out = (base: Record<string, string>, ...keep: string[]) => {
    const next = new URLSearchParams(base);
    for (const k of keep) {
      const v = sp.get(k);
      if (v) next.set(k, v);
    }
    return next;
  };

  if (url.pathname === PREVIEW_PATH) {
    // Already a preview address — or a #section of the page on screen, which
    // keeps the address it is on. Either way, the link as it is.
    if (sp.has("route")) return null;
    // "Load more", which links to ?page=2 of whatever page it is on.
    const next = new URLSearchParams(here.search);
    for (const k of PAGING) {
      next.delete(k);
      const v = sp.get(k);
      if (v) next.set(k, v);
    }
    return next;
  }

  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  const [first, second] = parts;
  if (!parts.length) return out({ route: "home" });
  if (parts.length === 1) {
    if (first === "search") return out({ route: "search" }, "q");
    if (first === "cart") return out({ route: "cart" });
    if (first === "products") {
      // Words in the catalogue's address are a search; ?category= an old link
      // to a category, which All products draws.
      if (sp.get("q")) return out({ route: "search" }, "q");
      const next = out({ route: "products" }, ...PAGING);
      const category = sp.get("category");
      if (category) next.set("slug", category);
      return next;
    }
    if (RESERVED_SLUGS.has(first!) || APP_PAGES.has(first!) || !SLUG.test(first!)) return null;
    return out({ route: "page", slug: first! });
  }
  if (parts.length === 2 && first === "products") return out({ route: "product", slug: second! });
  if (parts.length === 2 && first === "collections") return out({ route: "collection", slug: second! }, ...PAGING);
  return null;
}
