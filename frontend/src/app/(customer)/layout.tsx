import { headers } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import StorefrontShell from "@/components/storefront/StorefrontShell";
import { loadStore } from "@/lib/store";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The account portal is a clean dashboard — no store footer there. Nor on
  // the platform's own address, which is not a shop: its pages there (About,
  // Contact, Pricing, …) are the marketing site's, with a footer of their own.
  // Decided by the address, not the path, so it cannot go stale across
  // client-side navigation.
  const { brand } = await loadStore();
  const hideFooter = pathname.startsWith("/account") || brand === null;

  // Which pages wear the shop is decided inside the shell, on the client —
  // this layout is shared, so it is not re-rendered when the App Router moves
  // between routes, and anything decided here from the path outlives the page
  // it was decided for. A shop on the website builder has a footer of its own,
  // which the shell draws instead of this one.
  return (
    <StorefrontShell footer={!hideFooter ? <Footer /> : null}>
      {children}
    </StorefrontShell>
  );
}
