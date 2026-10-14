import type { Metadata } from "next";
import type { ReactNode } from "react";

// The partner program lives on the platform's own address. Its pages are
// private to partners, apart from the program page itself, which says so.
export const metadata: Metadata = {
  title: { default: "PrintCoPilot Partners", template: "%s | PrintCoPilot Partners" },
  robots: { index: false, follow: false },
};

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return children;
}
