/**
 * SanMar's "Orders to place" (components/admin/suppliers/ManualOrders.tsx).
 *
 * No orders are sent to SanMar from here, so the parts of orders its stock
 * covered (products with SanMar as a source) are listed for the shop to order
 * on SanMar's website: totals per SKU, a CSV, then "Mark as ordered".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { sup } = vi.hoisted(() => ({ sup: { orders: vi.fn(), markOrdered: vi.fn() } }));
vi.mock("@/services/suppliers.service", () => ({ suppliersService: sup }));

import { ManualOrders } from "@/components/admin/suppliers/ManualOrders";

const line = (sku: string, qty: number, color: string, size: string) => ({ sku, qty, name: "Check Tee", color, size });
const WAITING = [
  { order_id: "o1", order_number: "1001", created_at: "2026-11-05T10:00:00Z", customer: "Ana", status: "confirmed",
    payment_status: "paid", pieces: 98, lines: [line("5000-BLACK-S", 93, "Black", "S"), line("5000-WHITE-M", 5, "White", "M")], last_attempt: null },
  { order_id: "o2", order_number: "1002", created_at: "2026-11-05T11:00:00Z", customer: "Ben", status: "confirmed",
    payment_status: "paid", pieces: 7, lines: [line("5000-BLACK-S", 7, "Black", "S")], last_attempt: null },
];

afterEach(() => { sup.orders.mockReset(); sup.markOrdered.mockReset(); });

describe("ManualOrders", () => {
  it("lists what to order, totals each SKU, and marks the chosen orders as ordered", async () => {
    sup.orders.mockResolvedValueOnce({ waiting: WAITING, recent: [] }).mockResolvedValueOnce({
      waiting: [], recent: [{ id: "s1", order_id: "o1", order_number: "1001", status: "placed", test: false, trigger: "manual",
        po_number: "SM-778", supplier_order_numbers: null, error: null, tracking_number: null, carrier: null, pieces: 98,
        created_at: "2026-11-05T12:00:00Z", shipped_at: null }],
    });
    sup.markOrdered.mockResolvedValue({ results: [{ order_number: "1001", status: "placed", message: "" }] });
    const { container } = render(<ManualOrders id="sanmar" name="SanMar" />);
    await waitFor(() => expect(container.querySelector('[data-waiting="1001"]')).toBeTruthy());
    expect(container.querySelector("[data-totals]")?.textContent).toContain("5000-BLACK-S × 100");

    fireEvent.click(screen.getByLabelText("Order 1002"));
    expect(container.querySelector("[data-totals]")?.textContent).toContain("5000-BLACK-S × 93");
    fireEvent.change(screen.getByLabelText("SanMar order number"), { target: { value: "SM-778" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark 1 as ordered" }));
    await waitFor(() => expect(container.querySelector("[data-marked]")?.textContent).toContain("SM-778"));
    expect(sup.markOrdered).toHaveBeenCalledWith("sanmar", ["o1"], "SM-778");
    expect(screen.getByRole("status").textContent).toContain("1 order marked as ordered from SanMar");
    expect(container.querySelector("[data-nothing-to-place]")).toBeTruthy();
  });

  it("downloads the chosen orders as a CSV", async () => {
    sup.orders.mockResolvedValue({ waiting: WAITING, recent: [] });
    const made: Blob[] = [];
    const create = vi.fn((b: Blob) => { made.push(b); return "blob:x"; });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ManualOrders id="sanmar" name="SanMar" />);
    fireEvent.click(await screen.findByRole("button", { name: "Download the list (CSV)" }));
    expect(click).toHaveBeenCalled();
    const text = await made[0]!.text();
    expect(text.split("\n")[0]).toBe("Order,Date,Customer,SanMar SKU,Product,Colour,Size,Qty");
    expect(text).toContain("1001,2026-11-05,Ana,5000-BLACK-S,Check Tee,Black,S,93");
    click.mockRestore();
  });
});
