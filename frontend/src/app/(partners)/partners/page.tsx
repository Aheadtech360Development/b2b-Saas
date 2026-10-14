import type { Metadata } from "next";

import { ProgramPage } from "@/components/partners/ProgramPage";

// The one page of the program that is meant to be found.
export const metadata: Metadata = {
  title: "Partner program",
  description: "Refer print shops to PrintCoPilot and earn a share of their plan every month they stay.",
  robots: { index: true, follow: true },
};

export default function PartnerProgramPage() {
  return <ProgramPage />;
}
