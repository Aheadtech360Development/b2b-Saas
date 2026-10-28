"use client";

/**
 * The owner's notice at 80% and 100% of the orders a plan includes in a month.
 *
 * Only where the plan's limits bind (Retail); the server says so with
 * `notice`. It is a notice, never a stop: buyers keep checking out past the
 * limit (backend services/plan_usage), and the words say that, so an owner
 * does not think sales have been switched off.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

export interface PlanUsage {
  plan: string;
  plan_name: string;
  enforced: boolean;
  month: string;
  orders: number;
  orders_limit: number | null;
  orders_percent: number | null;
  notice: 80 | 100 | null;
  staff: number;
  staff_limit: number | null;
}

export function usageWords(u: PlanUsage): string | null {
  if (!u.notice || !u.orders_limit) return null;
  if (u.notice >= 100) {
    return `You have reached the ${u.orders_limit.toLocaleString()} orders your ${u.plan_name} plan includes this month `
      + `(${u.orders.toLocaleString()} so far). Buyers can still check out, nothing is stopped.`;
  }
  return `Your shop has taken ${u.orders.toLocaleString()} of the ${u.orders_limit.toLocaleString()} orders your `
    + `${u.plan_name} plan includes this month. Buyers can always check out.`;
}

export function PlanUsageNotice() {
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  useEffect(() => {
    apiClient.get<PlanUsage>("/api/v1/admin/billing/usage")
      .then(setUsage)
      // Staff without the billing permission cannot read it; the notice is the owner's.
      .catch(() => setUsage(null));
  }, []);
  const words = usage ? usageWords(usage) : null;
  if (!words) return null;
  return (
    <div className="pc-note" role="status" data-plan-usage={usage!.notice}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
               flexWrap: "wrap", marginBottom: "16px" }}>
      <span>{words}</span>
      <Link href="/admin/billing" className="pc-link" style={{ fontWeight: 600 }}>See plans</Link>
    </div>
  );
}
