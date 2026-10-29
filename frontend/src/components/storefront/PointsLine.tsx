"use client";

/**
 * The buyer's points under the cart (backend services/loyalty): what they
 * have, and how far the next reward is. Nothing when the shop has no rewards
 * program or nobody is signed in.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

interface Summary {
  enabled: boolean;
  balance?: number;
  points_name?: string;
  program_name?: string;
  next_reward?: { points: number; reward: number; needed: number } | null;
}

export function PointsLine({ signedIn }: { signedIn: boolean }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    if (!signedIn) { setS(null); return; }
    apiClient.get<Summary>("/api/v1/account/rewards/summary").then(setS).catch(() => setS(null));
  }, [signedIn]);
  if (!s?.enabled) return null;
  const name = s.points_name ?? "points";
  return (
    <div data-points-line style={{ marginTop: "14px", padding: "12px 14px", border: "1px solid var(--ui-line, #E2E2DE)", background: "#fff", fontSize: "13.5px", lineHeight: 1.55 }}>
      <strong>{(s.balance ?? 0).toLocaleString()} {name}</strong> in {s.program_name ?? "Rewards"}.
      {s.next_reward ? ` ${s.next_reward.needed.toLocaleString()} more for $${s.next_reward.reward} off.` : ""}
      {" "}<Link href="/account/rewards" style={{ color: "var(--brand-primary, #1C3557)", fontWeight: 600 }}>Use them</Link>
    </div>
  );
}
