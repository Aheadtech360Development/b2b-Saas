"use client";

/**
 * Where "View as affiliate" lands. The read-only token comes in the
 * address's fragment, which never reaches a server or a log; it is held in
 * memory and the fragment is cleared before the portal opens.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Banner, ROOT } from "@/components/partners/ui";
import { setPartnerToken } from "@/lib/partnerApi";

export default function ViewAsPage() {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    history.replaceState(null, "", window.location.pathname);
    if (!token) { setMissing(true); return; }
    setPartnerToken(token, { viewAs: true });
    router.replace("/partners/dashboard");
  }, [router]);

  return (
    <div className={ROOT} style={{ minHeight: "100vh" }}>
      <div className="content" style={{ margin: "0 auto", maxWidth: 560 }}>
        {missing ? <Banner tone="warn">Open this from the Affiliates tab, with View as affiliate.</Banner> : <p className="muted">Opening the portal...</p>}
      </div>
    </div>
  );
}
