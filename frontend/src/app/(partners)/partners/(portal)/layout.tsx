import type { ReactNode } from "react";

import { PartnerShell } from "@/components/partners/PartnerShell";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PartnerShell>{children}</PartnerShell>;
}
