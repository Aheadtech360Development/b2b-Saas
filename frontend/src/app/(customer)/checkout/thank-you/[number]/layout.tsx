import type { Metadata } from "next";
import type { ReactNode } from "react";

// One buyer's order: kept out of search results.
export const metadata: Metadata = {
  title: "Thank you for your order",
  robots: { index: false, follow: false },
};

export default function ThankYouLayout({ children }: { children: ReactNode }) {
  return children;
}
