/**
 * Every 404 the app serves: a URL nothing matches, and every page that calls
 * notFound() — a product or collection that does not exist, a page nobody
 * made.
 *
 * A shop live on the visual builder gets its own "page not found" template,
 * inside its own header and footer, with a real 404 status, so search
 * engines drop the address instead of indexing an error page as content.
 *
 * Every other shop — and the platform's own address — gets exactly what it
 * got before this file existed: Next's built-in 404, the same component Next
 * renders when there is no not-found file at all.
 */
import BuiltinNotFound from "next/dist/client/components/builtin/not-found";
import { loadStore } from "@/lib/store";
import { BuilderPage, SiteHead, SitePart } from "@/components/builder/SiteParts";

export default async function NotFound() {
  // Next renders this on every request, as the fallback a page might need, so
  // it must not cost a request: the shop's answer every page already fetches
  // carries the builder's not-found template with its header and footer.
  const store = await loadStore();
  const site = store.brand ? store.builder : null;
  if (!site) return <BuiltinNotFound />;
  return (
    <>
      <SiteHead settings={site.settings} fonts={site.fonts} />
      <SitePart payload={site} part="announcement" />
      <SitePart payload={site} part="header" />
      <main><BuilderPage payload={site} /></main>
      <SitePart payload={site} part="footer" />
    </>
  );
}
