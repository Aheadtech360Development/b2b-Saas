"use client";

import Link from "next/link";

import { Icon, ROOT } from "@/components/partners/ui";

// Where a partner's link lands while it is off: the partner is paused,
// suspended or gone, or the program is not taking new referrals.
export default function LinkUnavailablePage() {
  return (
    <div className={ROOT} style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card pad col" style={{ maxWidth: 480, textAlign: "center", alignItems: "center" }}>
        <span className="muted"><Icon name="link" size="xl" /></span>
        <h1>This referral link is not available right now.</h1>
        <p className="muted">The shop can still start a free trial. Shops already referred keep earning for their partner.</p>
        <Link className="btn pri" href="/signup">Start a free trial</Link>
      </div>
    </div>
  );
}
