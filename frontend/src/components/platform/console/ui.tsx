"use client";

/**
 * The Platform Console's small shared parts, drawn with the admin's own kit
 * (app/(admin)/admin-shell.css, `.pc-*`): page heads, numbers, the pills a
 * brand's state is shown with, and the loading of a screen's data.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiClientError } from "@/lib/api-client";
import type { Brand } from "./api";

export function PageHead({ eyebrow, title, lede, actions }: {
  eyebrow: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="pc-head">
      <div>
        <div className="pc-eyebrow">{eyebrow}</div>
        <h1 className="pc-h1">{title}</h1>
        {lede ? <p className="pc-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="pc-row-actions">{actions}</div> : null}
    </div>
  );
}

export function Stat({ value, label, sub, tone }: { value: ReactNode; label: string; sub?: ReactNode; tone?: "amber" | "red" }) {
  return (
    <div className="pc-card pc-stat4">
      <div className="pc-stat4-v" style={tone === "red" ? { color: "var(--pc-red)" } : tone === "amber" ? { color: "var(--pc-amber)" } : undefined}>{value}</div>
      <div className="pc-stat4-l">{label}</div>
      {sub ? <div className="pc-stat4-s">{sub}</div> : null}
    </div>
  );
}

export function errorText(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof ApiClientError && e.message ? e.message : fallback;
}

/** A screen's data: loading, the error if it failed, and a way to load it again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(load);
  latest.current = load;
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await latest.current());
    } catch (e) {
      setError(errorText(e, "Could not load this."));
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run(); }, deps);
  return { data, error, loading, reload: run, setData };
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <div className="pc-empty">{what}…</div>;
}

export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="pc-flash" data-bad="">
      <span>{message}</span>
      {onRetry ? <button type="button" className="pc-link" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function money(cents: number, opts: { whole?: boolean } = {}): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2,
  });
}

export function dollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "59 min ago", "3 days ago", or the date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return day(iso);
}

export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** What the brand's billing is, in one word or two. */
export function billingOf(b: Pick<Brand, "billing_status" | "paying" | "trial">): { label: string; tone: "green" | "blue" | "amber" | "red" | "" } {
  switch (b.billing_status) {
    case "active": return { label: "Paid", tone: "green" };
    case "trialing": return { label: "Card on file", tone: "blue" };
    case "past_due": return { label: "Past due", tone: "red" };
    case "unpaid": return { label: "Unpaid", tone: "red" };
    case "canceled": return { label: "Plan cancelled", tone: "red" };
    default:
      if (b.trial.on_trial) return { label: "Free trial", tone: "blue" };
      if (b.trial.expired) return { label: "Trial over, no card", tone: "amber" };
      return { label: "No card yet", tone: "amber" };
  }
}

export function BillingPill({ brand }: { brand: Pick<Brand, "billing_status" | "paying" | "trial"> }) {
  const b = billingOf(brand);
  return <span className="pc-pill" data-tone={b.tone || undefined}>{b.label}</span>;
}

export function HealthPill({ health }: { health: Brand["health"] }) {
  const map = { selling: ["Selling", "green"], no_sales: ["No sales", "amber"], empty: ["Empty", ""] } as const;
  const [label, tone] = map[health] ?? ["", ""];
  return <span className="pc-pill" data-tone={tone || undefined}>{label}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === "active" ? "green" : status === "suspended" ? "amber" : "red";
  return <span className="pc-pill" data-tone={tone}>{status}</span>;
}

/** "12 of 300", or just "12" when the plan has no limit. */
export function ofLimit(n: number, limit: number | null): string {
  return limit === null || limit === undefined ? `${n.toLocaleString()}` : `${n.toLocaleString()} of ${limit.toLocaleString()}`;
}

/** Why a brand needs somebody to look at it, most urgent first. */
export function needs(b: Brand): { level: "fix" | "watch"; title: string; detail: string }[] {
  const out: { level: "fix" | "watch"; title: string; detail: string }[] = [];
  if (!b.plan_detail.known) {
    out.push({ level: "fix", title: `${b.name} is on a plan that does not exist`,
      detail: `"${b.plan || "none"}" is treated as ${cap(b.plan_detail.treated_as || "starter")}. Move it to a real plan.` });
  }
  if (b.billing_status === "past_due" || b.billing_status === "unpaid") {
    out.push({ level: "fix", title: `${b.name}'s payment failed`, detail: "Stripe could not charge the card on file." });
  }
  if (b.status === "active" && b.trial.expired && !b.paying) {
    out.push({ level: "watch", title: `${b.name}'s free trial is over`, detail: "No card on file, so its plan has not started." });
  } else if (b.trial.on_trial && (b.trial.days_left ?? 99) <= 3) {
    out.push({ level: "watch", title: `${b.name}'s trial ends ${day(b.trial.ends_at)}`,
      detail: `${b.trial.days_left} day${b.trial.days_left === 1 ? "" : "s"} left.` });
  }
  if (b.status === "active" && b.health === "empty") {
    out.push({ level: "watch", title: `${b.name}'s store is empty`, detail: "No products and no orders yet." });
  }
  return out;
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
