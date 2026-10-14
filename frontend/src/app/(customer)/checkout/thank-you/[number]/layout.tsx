import type { Metadata } from "next";
import type { ReactNode } from "react";

import { KEY_FROM_LINK } from "@/lib/orderThanks";

// One buyer's order: kept out of search results.
export const metadata: Metadata = {
  title: "Thank you for your order",
  robots: { index: false, follow: false },
};

export default function ThankYouLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The order email's link carries the key in its #fragment: kept, and
          taken off the address before any tracking tool loads. */}
      <script dangerouslySetInnerHTML={{ __html: KEY_FROM_LINK }} />
      {children}
    </>
  );
}
