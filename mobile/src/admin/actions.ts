/**
 * The things a shop's own people do to a row, rather than read on it.
 *
 * Kept apart from the lists because an action is a different sort of thing: it
 * changes somebody else's order, and it needs to be confirmed, to say what it
 * did, and to leave the list refreshed.
 */
import { call } from "@/api/client";

export interface Action {
  key: string;
  label: string;
  /** Spelled out before it runs. Money and mail are not undoable. */
  confirm: string;
  /** Said back when it worked. */
  done: string;
  /** Marked so the button can be drawn as the serious one it is. */
  destructive?: boolean;
  run: (id: string) => Promise<void>;
}

const patch = (path: string, body: unknown) => call(path, { method: "PATCH", body });
const post = (path: string, body?: unknown) => call(path, { method: "POST", body });

const setStatus = (status: string) => (id: string) =>
  patch(`/api/v1/admin/orders/${id}/status`, { status }).then(() => undefined);

export const ORDER_ACTIONS: Action[] = [
  {
    key: "confirm", label: "Confirm order",
    confirm: "Confirm this order and move it to processing?",
    done: "Order confirmed.",
    run: setStatus("processing"),
  },
  {
    key: "shipped", label: "Mark shipped",
    confirm: "Mark this order as shipped? The customer is emailed.",
    done: "Marked shipped.",
    run: setStatus("shipped"),
  },
  {
    key: "delivered", label: "Mark delivered",
    confirm: "Mark this order as delivered?",
    done: "Marked delivered.",
    run: setStatus("delivered"),
  },
  {
    key: "paid", label: "Mark paid",
    confirm: "Record this order as paid? Use this only for money already received.",
    done: "Marked paid.",
    run: (id) => post(`/api/v1/admin/orders/${id}/mark-paid`).then(() => undefined),
  },
  {
    key: "invoice", label: "Send invoice",
    confirm: "Email the invoice to this customer?",
    done: "Invoice sent.",
    run: (id) => post(`/api/v1/admin/orders/${id}/send-invoice`).then(() => undefined),
  },
  {
    key: "cancel", label: "Cancel order", destructive: true,
    confirm: "Cancel this order? This cannot be undone.",
    done: "Order cancelled.",
    run: (id) => post(`/api/v1/admin/orders/${id}/cancel`).then(() => undefined),
  },
];

export const APPLICATION_ACTIONS: Action[] = [
  {
    key: "approve", label: "Approve",
    confirm: "Approve this application? A company is created and they are emailed "
      + "that they can sign in and order.",
    done: "Approved.",
    run: (id) => post(`/api/v1/admin/wholesale-applications/${id}/approve`, {}).then(() => undefined),
  },
  {
    key: "reject", label: "Reject", destructive: true,
    confirm: "Reject this application? They are emailed the decision.",
    done: "Rejected.",
    // The reason is required by the server and has a floor of ten characters,
    // so a default is sent rather than failing validation on a phone where
    // typing one is a chore. A fuller reason can be written on the website.
    run: (id) => post(`/api/v1/admin/wholesale-applications/${id}/reject`, {
      rejection_reason: "Not approved at this time.",
    }).then(() => undefined),
  },
];

export const RETURN_ACTIONS: Action[] = [
  {
    key: "approve-return", label: "Approve return",
    confirm: "Approve this return?",
    done: "Return approved.",
    run: (id) => patch(`/api/v1/admin/rma/${id}`, { status: "approved" }).then(() => undefined),
  },
  {
    key: "reject-return", label: "Reject return", destructive: true,
    confirm: "Reject this return?",
    done: "Return rejected.",
    run: (id) => patch(`/api/v1/admin/rma/${id}`, { status: "rejected" }).then(() => undefined),
  },
];

export const GANG_SHEET_ACTIONS: Action[] = [
  {
    key: "gs-approve", label: "Approve artwork",
    confirm: "Approve this artwork and send the job to production?",
    done: "Sent to production.",
    run: (id) => patch(`/api/v1/admin/gang-sheets/orders/${id}/status`, {
      status: "in_production",
    }).then(() => undefined),
  },
  {
    key: "gs-revision", label: "Ask for a revision", destructive: true,
    confirm: "Ask the customer to fix their artwork?",
    done: "Revision requested.",
    run: (id) => patch(`/api/v1/admin/gang-sheets/orders/${id}/status`, {
      status: "revision_requested",
    }).then(() => undefined),
  },
];

/** Which actions belong to a section, if any. */
export function actionsFor(sectionKey: string): Action[] {
  switch (sectionKey) {
    case "orders":
    case "drafts":
      return ORDER_ACTIONS;
    case "applications":
      return APPLICATION_ACTIONS;
    case "returns":
      return RETURN_ACTIONS;
    case "gang-sheets":
      return GANG_SHEET_ACTIONS;
    default:
      return [];
  }
}
