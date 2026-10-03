import { headers } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { loadThemeChrome } from "@/components/storefront/ThemeChrome";
import StorefrontShell from "@/components/storefront/StorefrontShell";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The account portal is a clean dashboard — no store footer there.
  const hideFooter = pathname.startsWith("/account");
  // The gang sheet builder is a full-screen application, not a page in a shop.
  // Drawing the storefront around it left a whole page standing behind it —
  // taller than the window, with the shop's own footer at the bottom — which
  // is what kept showing underneath the builder and in every screenshot of it.
  // Here the page *is* the builder, so there is nothing behind it to show.
  const bare = pathname.startsWith("/gang-sheets");
  // A themed brand has a footer of its own, drawn by the shell around every
  // page. Two footers on the cart is what the old one looked like.
  const themed = (await loadThemeChrome()) !== null;
  return (
    // The brand's own header and footer belong to this segment, not to the
    // root layout: a shared layout is not re-rendered when the App Router
    // moves between routes, so chrome decided up there outlived the pages it
    // was drawn for and turned up over the admin console.
    bare ? children : (
      <StorefrontShell>
        <main>{children}</main>
        {!hideFooter && !themed && <Footer />}
      </StorefrontShell>
    )
  );
}
