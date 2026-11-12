/**
 * A page the shop does not have, asked for inside the shop (a product, a
 * collection or a page nobody made). This segment's layout already draws the
 * shop's header and footer around it (StorefrontShell), so only the page goes
 * here: the site-wide not-found (app/not-found.tsx) draws a header and footer
 * of its own, which put two of each on the screen (Sidequest, 2026-11-12).
 */
import BuiltinNotFound from "next/dist/client/components/builtin/not-found";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadStore } from "@/lib/store";

export default async function ShopNotFound() {
  const store = await loadStore();
  const site = store.brand ? store.builder : null;
  if (!site) return <BuiltinNotFound />;
  return <main><BuilderPage payload={site} /></main>;
}
