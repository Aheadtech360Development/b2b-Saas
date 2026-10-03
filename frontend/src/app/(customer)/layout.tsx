import { headers } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { loadThemeChrome } from "@/components/storefront/ThemeChrome";
import StorefrontShell from "@/components/storefront/StorefrontShell";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The account portal is a clean dashboard — no store footer there.
  const hideFooter = pathname.startsWith("/account");
  // A themed brand has a footer of its own, drawn by the shell around every
  // page. Two footers on the cart is what the old one looked like.
  const themed = (await loadThemeChrome()) !== null;

  // Which pages wear the shop is decided inside the shell, on the client —
  // this layout is shared, so it is not re-rendered when the App Router moves
  // between routes, and anything decided here from the path outlives the page
  // it was decided for.
  return (
    <StorefrontShell footer={!hideFooter && !themed ? <Footer /> : null}>
      {children}
    </StorefrontShell>
  );
}
