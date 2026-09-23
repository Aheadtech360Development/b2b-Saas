import { headers } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { loadThemeChrome } from "@/components/storefront/ThemeChrome";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The account portal is a clean dashboard — no store footer there.
  const hideFooter = pathname.startsWith("/account");
  // A themed brand has a footer of its own, drawn by the root layout around
  // every page. Two footers on the cart is what the old one looked like.
  const themed = (await loadThemeChrome()) !== null;
  return (
    <>
      <main>{children}</main>
      {!hideFooter && !themed && <Footer />}
    </>
  );
}
