import type { Metadata } from "next";
import type { ReactNode } from "react";

import { KEY_FROM_LINK } from "@/lib/orderThanks";

// One buyer's order: kept out of search results.
export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The shop's shipped / delivered email links here with the order's key
          in its #fragment: kept, and taken off the address before any tracking
          tool loads (lib/orderThanks). */}
      <script dangerouslySetInnerHTML={{ __html: KEY_FROM_LINK }} />
      {children}
    </>
  );
}
