/**
 * What the portal's pages read, in one place: the shapes the account API
 * returns, and the few rules every page must apply the same way (where a print
 * job stands, what an invoice still owes, putting an order back in the cart).
 */
import { accountService } from "@/services/account.service";
import type { GangSheetOrder } from "@/services/gangSheets.service";
import { trackReorder } from "@/lib/tracking";

/** One row of GET /api/v1/orders. */
export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string | number;
  item_count: number;
  created_at: string;
}

export interface OrderPage {
  items: OrderRow[];
  total: number;
  page: number;
  pages: number;
}

/** One row of GET /api/v1/account/invoices: every order is its own invoice. */
export interface Invoice {
  id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  total_amt: number;
  balance: number;
  status: "open" | "partial" | "paid";
  order_status?: string;
  payment_status?: string;
}

/** One row of GET /api/v1/quotes. */
export interface QuoteRow {
  kind: "quote" | "request";
  number: string;
  order_id: string | null;
  order_number: string | null;
  requested_at: string | null;
  valid_until: string | null;
  total: number | null;
  status: "needs_pricing" | "draft" | "sent" | "expired" | "accepted" | "ordered";
  status_words: string;
  asked?: string | null;
}

/** The buyer's company and its terms (GET /api/v1/account/profile/full). */
export interface FullProfile {
  web_user: { first_name: string; last_name: string; email: string };
  company: {
    account_number: string;
    name: string;
    trading_name: string | null;
    phone: string | null;
    tax_id: string | null;
    business_type: string | null;
    company_email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state_province: string | null;
    postal_code: string | null;
    country: string | null;
    net30_enabled?: boolean;
    pricing_tier_name?: string | null;
    pricing_tier_discount?: number | null;
    [key: string]: unknown;
  } | null;
}

/** An order closed without money owed: nothing to pay, nothing to chase. */
export const CLOSED = new Set(["cancelled", "refunded"]);

/** What is still owed on an invoice, zero once the order is cancelled or refunded. */
export function owed(inv: Invoice): number {
  if (inv.order_status && CLOSED.has(inv.order_status)) return 0;
  return inv.balance > 0 ? inv.balance : 0;
}

/** When a Net 30 invoice falls due: thirty days from the day it was raised. */
export function dueDate(inv: Invoice, net30: boolean): Date | null {
  if (inv.due_date) return new Date(inv.due_date);
  if (!net30 || !inv.txn_date) return null;
  const d = new Date(inv.txn_date);
  d.setDate(d.getDate() + 30);
  return d;
}

/** [words, tone] for an invoice: overdue and due soon only where a due date exists. */
export function invoiceState(inv: Invoice, net30: boolean): [string, "ok" | "warn" | "bad" | "mute" | "info"] {
  if (inv.order_status === "cancelled") return ["Cancelled", "mute"];
  if (inv.order_status === "refunded") return ["Refunded", "mute"];
  if (owed(inv) <= 0) return ["Paid", "ok"];
  const due = dueDate(inv, net30);
  if (due) {
    const days = Math.floor((due.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return ["Overdue", "bad"];
    if (days <= 7) return ["Due soon", "warn"];
    return [inv.status === "partial" ? "Part paid" : "Open", "info"];
  }
  return [inv.status === "partial" ? "Part paid" : "Due now", "warn"];
}

/** Put an order's lines back in the cart, and tell the shop's tools what went in. */
export async function reorderToCart(orderId: string): Promise<void> {
  const order = await accountService.getOrder(orderId) as { items?: Parameters<typeof trackReorder>[0] } | null;
  const again = await accountService.reorder(orderId) as { added?: unknown } | null;
  trackReorder(order?.items, again?.added);
}

// ── Print jobs ───────────────────────────────────────────────────────────────

/** The steps a buyer sees, from the job's own status and its order's. */
export const JOB_STEPS = ["Received", "Artwork check", "Approved", "Printing", "Packed", "Shipped"];

export type Job = GangSheetOrder & {
  order_status?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  carrier?: string | null;
};

const JOB_AT: Record<string, number> = {
  submitted: 0, in_review: 1, revision_requested: 1, rejected: 1, approved: 2, production: 3, completed: 4,
};

/** Where a job stands on JOB_STEPS; shipped once the order it went out on is. */
export function jobStep(j: Job): { at: number; finished: boolean } {
  if (j.order_status === "delivered") return { at: 5, finished: true };
  if (j.order_status === "shipped") return { at: 5, finished: true };
  return { at: JOB_AT[j.status] ?? 0, finished: false };
}

/** [words, tone] for a job's chip. */
export function jobState(j: Job): [string, "ok" | "warn" | "bad" | "mute" | "info"] {
  if (j.order_status === "delivered") return ["Delivered", "ok"];
  if (j.order_status === "shipped") return ["Shipped", "ok"];
  if (j.order_status === "ready_for_pickup") return ["Ready for pickup", "ok"];
  switch (j.status) {
    case "revision_requested": return ["Needs a change", "bad"];
    case "rejected": return ["Not accepted", "bad"];
    case "in_review": return ["Artwork check", "warn"];
    case "approved": return ["Approved", "info"];
    case "production": return ["Printing", "info"];
    case "completed": return ["Packed", "info"];
    default: return ["Received", "mute"];
  }
}

export type JobTab = "all" | "action" | "production" | "shipped" | "delivered";

/** Which of the print jobs tabs a job is listed under, besides All. */
export function jobTab(j: Job): JobTab | null {
  if (j.order_status === "delivered") return "delivered";
  if (j.order_status === "shipped") return "shipped";
  if (j.status === "revision_requested") return "action";
  if (j.status === "approved" || j.status === "production" || j.status === "completed") return "production";
  return null;
}

/** Older rows predate `kind`; a job with no sheet size is an upload by size. */
export const jobKind = (j: GangSheetOrder) => j.kind ?? (j.sheet_size_id ? "gang_sheet" : "upload_by_size");

/** "22 x 60 in, 2 sheets, $24.00" */
export function jobLine(j: GangSheetOrder): string {
  const unit = jobKind(j) === "upload_by_size" ? "print" : "sheet";
  const size = j.sheet_name || `${j.sheet_width_in} x ${j.sheet_height_in} in`;
  return `${size}, ${j.sheet_quantity} ${unit}${j.sheet_quantity === 1 ? "" : "s"}, $${Number(j.subtotal || 0).toFixed(2)}`;
}

// ── Who the buyer is in their company ─────────────────────────────────────────

/** The buyer's role in their company (owner, buyer, viewer, finance), from the
 *  sign-in token: only an owner may invite or remove people. */
export function companyRoleOf(token: string | null | undefined): string | null {
  try {
    const part = (token ?? "").split(".")[1];
    if (!part) return null;
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { company_role?: string };
    return claims.company_role ?? null;
  } catch {
    return null;
  }
}

/** A trade account: the design's Wholesale portal (billing, team, quick order,
 *  price list, quotes, reports). A retail shopper's account also has a company
 *  behind it (activation makes one), so the company alone does not decide it:
 *  the account type does. */
export function isTradeAccount(user: { account_type?: string | null; company_id?: string | null } | null | undefined): boolean {
  return !!user?.company_id && (user.account_type ?? "wholesale") !== "retail";
}
