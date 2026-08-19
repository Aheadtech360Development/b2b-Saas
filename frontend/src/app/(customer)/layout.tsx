"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/layout/Footer";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The account portal is a clean dashboard — no store footer there.
  const hideFooter = pathname?.startsWith("/account");
  return (
    <>
      <main>{children}</main>
      {!hideFooter && <Footer />}
    </>
  );
}
