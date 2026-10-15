import type { Metadata } from "next";
import type { ReactNode } from "react";

import { KEY_FROM_LINK } from "@/lib/orderThanks";

// One customer's quote: kept out of search results.
export const metadata: Metadata = {
  title: "Your quote",
  robots: { index: false, follow: false },
};

export default function QuoteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The quote email's link carries the order's key in its #fragment:
          kept, and taken off the address before any tracking tool loads. */}
      <script dangerouslySetInnerHTML={{ __html: KEY_FROM_LINK }} />
      {children}
    </>
  );
}
