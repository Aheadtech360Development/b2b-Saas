/**
 * An order whose artwork is still open does not leave by a slip of the hand.
 *
 * On the order page a pickup order could be marked ready, then collected,
 * while its print job still said "In review". And a gang sheet's line could be
 * taken off an order under "Edit items", leaving its job in Production with no
 * line to belong to. The page now says the artwork is open in the Fulfil card,
 * asks before the order goes out, and keeps a line that has a print job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { GangSheetProduction } from "@/components/admin/GangSheetLineFiles";

const asked: { message: string; ok?: string }[] = [];
const sent: [string, string, unknown][] = [];
let answer = false;
let order: Record<string, unknown> = {};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ord-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/dialog", () => ({
  ask: (message: string, opts?: { ok?: string }) => { asked.push({ message, ok: opts?.ok }); return Promise.resolve(answer); },
  tell: () => Promise.resolve(),
  askText: () => Promise.resolve(null),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: () => Promise.resolve({}),
    post: (url: string, body: unknown) => { sent.push(["POST", url, body]); return Promise.resolve({}); },
    patch: (url: string, body: unknown) => { sent.push(["PATCH", url, body]); return Promise.resolve({}); },
    delete: (url: string) => { sent.push(["DELETE", url, null]); return Promise.resolve({}); },
  },
}));
vi.mock("@/services/admin.service", () => ({ adminService: { getOrder: () => Promise.resolve(order) } }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ isAuthenticated: () => true, isLoading: false }) }));
vi.mock("@/components/providers/BrandingProvider", () => ({ useBranding: () => ({ store_name: "Print Shop" }) }));
vi.mock("@/components/admin/OrderGangSheets", () => ({ OrderGangSheets: () => null }));
vi.mock("@/components/admin/OrderRefunds", () => ({ OrderRefunds: () => null }));

import AdminOrderDetailPage from "@/app/(admin)/admin/orders/[id]/page";

function sheet(status: string): GangSheetProduction {
  return {
    id: "s1", reference: "GS-SL-2610-0018", kind: "gang_sheet", status, sheet_name: "22x10",
    width_in: 22, height_in: 10, quantity: 1, preview_url: null, print_file: null,
    needs_layout: false, left_out: [], edit_url: null, admin_edit_url: "/admin/gang-sheets?sheet=s1", originals: [],
    resolution: { low: false, low_files: [], lowest_dpi: 300, designs: 1, unchecked: 0, threshold_dpi: 200 },
  };
}

/** What the server says about the order: the page only reads it. */
function progress(artwork: string, pickup = false) {
  const open = artwork === "in_review" || artwork === "revision";
  return {
    payment: { key: "paid", label: "Paid", tone: "green" },
    artwork: { key: artwork, label: artwork, tone: "" },
    fulfilment: { key: open ? "waiting_artwork" : "to_ship", label: open ? "Waiting on artwork" : "To ship", tone: "" },
    next: open
      ? { key: artwork === "revision" ? "customer" : "artwork", label: "Review the artwork", hint: "" }
      : { key: pickup ? "ready" : "ship", label: "Next", hint: "" },
    packed: false, pickup, steps: [{ key: "placed", label: "Placed", state: "done" }],
  };
}

function anOrder(artwork: string, over: Record<string, unknown> = {}) {
  const job = artwork === "in_review" ? "in_review" : artwork === "revision" ? "revision_requested" : "approved";
  return {
    id: "ord-1", order_number: "1042", company_name: "Sam Prints", company_id: "", status: "confirmed",
    payment_status: "paid", po_number: null, order_notes: null, tracking_number: null, courier: null,
    courier_service: null, shipped_at: null, subtotal: "34.00", shipping_cost: "8.95", tax_amount: "0.00",
    tax_label: "Tax", discounts: [], total: "42.95", created_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:00:00Z", shipping_method: "standard", carriers: [], events: [],
    progress: progress(artwork),
    items: [
      { id: "i1", sku: "GANG-SHEET", product_name: "Gang Sheet GS-SL-2610-0018", color: null, size: null,
        quantity: 1, unit_price: "20.00", line_total: "20.00", gang_sheet: sheet(job) },
      { id: "i2", sku: "TEE-BLK-M", product_name: "Heavyweight Tee", color: "Black", size: "M",
        quantity: 1, unit_price: "14.00", line_total: "14.00" },
    ],
    ...over,
  };
}

const fulfil = () => document.querySelector("[data-fulfil]") as HTMLElement;

beforeEach(() => { asked.length = 0; sent.length = 0; answer = false; });

describe("an order whose print job is not approved yet", () => {
  it("says so where it is sent from, with the way to the artwork", async () => {
    order = anOrder("in_review");
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    const note = fulfil().querySelector("[data-art-open]") as HTMLElement;
    expect(note.textContent).toContain("A print job on this order is not approved yet.");
    expect(within(note).getByRole("link", { name: "Review the artwork" })).toHaveAttribute("href", "/admin/gang-sheets?sheet=s1");
  });

  it("asks before it is marked shipped, and sends nothing when the answer is no", async () => {
    order = anOrder("in_review");
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    fireEvent.click(within(fulfil()).getByRole("button", { name: "Mark shipped without a label" }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]!.message.startsWith("The artwork on this order is not approved yet. ")).toBe(true);
    expect(asked[0]!.ok).toBe("Mark shipped anyway");
    expect(sent).toEqual([]);
  });

  it("is still shipped when the shop says to go ahead", async () => {
    order = anOrder("in_review");
    answer = true;
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    fireEvent.click(within(fulfil()).getByRole("button", { name: "Mark shipped without a label" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual(["PATCH", "/api/v1/admin/orders/ord-1/status", { status: "shipped", tracking_number: undefined, notify: true }]);
  });

  it("a pickup order is not marked ready without being asked either", async () => {
    order = anOrder("revision", { shipping_method: "will_call", progress: progress("revision", true) });
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    expect(fulfil().querySelector("[data-art-open]")!.textContent).toContain("The customer was asked to send the artwork again");
    fireEvent.click(within(fulfil()).getByRole("button", { name: "Mark ready for pickup" }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]!.ok).toBe("Mark ready anyway");
    expect(sent).toEqual([]);
  });
});

describe("an order whose artwork is approved", () => {
  it("has no warning, and the usual question", async () => {
    order = anOrder("approved");
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    expect(fulfil().querySelector("[data-art-open]")).toBeNull();
    fireEvent.click(within(fulfil()).getByRole("button", { name: "Mark shipped without a label" }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]!.message.startsWith("Mark this order shipped")).toBe(true);
    expect(asked[0]!.ok).toBe("Mark shipped");
  });
});

describe("editing an order's lines", () => {
  it("a line with a print job stays, and a plain line can be removed", async () => {
    order = anOrder("approved");
    render(<AdminOrderDetailPage />);
    await screen.findByText("Order 1042");
    fireEvent.click(screen.getByRole("button", { name: "Edit items" }));
    const sheetLine = document.querySelector('tr[data-line="GANG-SHEET"]') as HTMLElement;
    expect(within(sheetLine).queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(within(sheetLine).getByLabelText("Has a print job")).toBeInTheDocument();
    expect(screen.getByText(/A line with a print job can.t be removed here/)).toBeInTheDocument();
    const teeLine = document.querySelector('tr[data-line="TEE-BLK-M"]') as HTMLElement;
    answer = true;
    fireEvent.click(within(teeLine).getByRole("button", { name: "Remove Heavyweight Tee" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual(["DELETE", "/api/v1/admin/orders/ord-1/items/i2", null]);
  });
});
