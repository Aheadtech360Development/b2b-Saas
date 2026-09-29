/**
 * The briefing the console opens with, and the question box under it.
 *
 * Both come from the same place the website's Command Center uses, so the
 * phone and the desktop tell a shop the same thing on the same morning.
 */
import { call } from "@/api/client";

export type Severity = "urgent" | "attention" | "info";

export interface Priority {
  key: string;
  severity: Severity;
  count: number;
  title: string;
  detail: string;
  /** Where the website would send you. Mapped to a section here. */
  href: string;
}

export interface Pulse {
  ordersToday: number;
  revenueToday: number;
  orders7d: number;
  revenue7d: number;
}

export interface Briefing {
  pulse: Pulse;
  items: Priority[];
  aiEnabled: boolean;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

export async function briefing(): Promise<Briefing> {
  const res = await call<Record<string, any>>("/api/v1/admin/copilot/briefing");
  const p = res.pulse ?? {};
  return {
    pulse: {
      ordersToday: num(p.orders_today),
      revenueToday: num(p.revenue_today),
      orders7d: num(p.orders_7d),
      revenue7d: num(p.revenue_7d),
    },
    items: (res.items ?? []).map((i: any): Priority => ({
      key: String(i.key ?? ""),
      severity: (["urgent", "attention", "info"].includes(i.severity) ? i.severity : "info") as Severity,
      count: num(i.count),
      title: String(i.title ?? ""),
      detail: String(i.detail ?? ""),
      href: String(i.href ?? ""),
    })).filter((i: Priority) => i.title),
    aiEnabled: res.ai_enabled === true,
  };
}

/** The section a briefing item's link belongs to, so tapping it lands right. */
export function sectionForHref(href: string): string {
  const map: Record<string, string> = {
    "/admin/gang-sheets": "gang-sheets",
    "/admin/orders": "orders",
    "/admin/customers": "customers",
    "/admin/returns": "returns",
    "/admin/suppliers": "suppliers",
    "/admin/abandoned-carts": "abandoned",
    "/admin/inventory": "inventory",
    "/admin/products": "products",
  };
  return map[href] ?? "orders";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask about the shop.
 *
 * The whole conversation is sent back each turn because the server keeps
 * none of it: tool rounds happen there and never travel, so a crafted
 * request cannot plant a fake tool result in the history.
 */
export async function ask(history: ChatTurn[]): Promise<string> {
  const res = await call<Record<string, any>>("/api/v1/admin/copilot/chat", {
    method: "POST",
    body: { messages: history },
  });
  return String(res.reply ?? res.message ?? res.content ?? "").trim();
}
