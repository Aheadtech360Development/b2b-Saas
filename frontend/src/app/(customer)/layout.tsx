import { headers } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import StorefrontShell from "@/components/storefront/StorefrontShell";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The account portal is a clean dashboard — no store footer there.
  const hideFooter = pathname.startsWith("/account");

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
