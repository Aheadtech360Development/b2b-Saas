/**
 * The returns and exchanges portal (Retail launch, package 4) on the buyer's
 * side: a guest finds the order, picks what comes back and why, and the key
 * the lookup answered with goes with the request; final sale lines cannot be
 * picked; an exchange asks what instead; a closed order says why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const post = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import GuestReturnsPage from "@/app/(customer)/returns/page";

const info = {
  open: true, why: null, order_id: "o1", order_number: "1051", window_ends: "2026-11-28T00:00:00Z",
  reasons: ["Doesn't fit", "Arrived damaged"], methods: ["original", "store_credit", "exchange"],
  shipping_payer: "shop", instructions: "", token: "o1.9999999999.sig",
  returns: [{ rma_number: "RMA-100001", kind: "return", status_words: "Approved", created_at: null }],
  lines: [
    { order_item_id: "i1", product_name: "Youth Tee", sku: "TEE-L", color: "Black", size: "L", quantity: 2, returnable: 2,
      unit_price: 8, final_sale: null,
      exchange_options: [{ variant_id: "v-m", label: "Black / M", sku: "TEE-M", price: 8, in_stock: 5 }] },
    { order_item_id: "i2", product_name: "Gift card 50.00 for Ann", sku: "GIFT-CARD", color: null, size: null, quantity: 1,
      returnable: 0, unit_price: 50, final_sale: "Gift cards can't be returned.", exchange_options: [] },
  ],
};

async function findOrder() {
  render(<GuestReturnsPage />);
  fireEvent.change(screen.getByLabelText("Order number"), { target: { value: "1051" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Find my order" }));
  await screen.findByText("Items from order 1051");
}

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url: string) => url.endsWith("/lookup")
    ? Promise.resolve(info) : Promise.resolve({ rma_number: "RMA-200002", status: "pending" }));
});

describe("a guest's return", () => {
  it("finds the order by number and email, and shows earlier requests", async () => {
    await findOrder();
    expect(post.mock.calls[0]).toEqual(["/api/v1/storefront/returns/lookup", { order_number: "1051", email: "sam@example.com" }]);
    expect(screen.getByText(/RMA-100001/)).toBeInTheDocument();
  });

  it("cannot pick a final sale line", async () => {
    await findOrder();
    expect(screen.getByLabelText("Return Gift card 50.00 for Ann")).toBeDisabled();
    expect(screen.getByText("Gift cards can't be returned.")).toBeInTheDocument();
  });

  it("sends what comes back, why, and the refund wanted, with the order's key", async () => {
    await findOrder();
    fireEvent.click(screen.getByLabelText("Return Youth Tee"));
    fireEvent.click(screen.getByRole("button", { name: "Request return" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reason");
    fireEvent.change(screen.getByLabelText("Why, Youth Tee"), { target: { value: "Doesn't fit" } });
    fireEvent.change(screen.getByLabelText("How many Youth Tee"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "As store credit" }));
    fireEvent.click(screen.getByRole("button", { name: "Request return" }));
    expect(await screen.findByText("RMA-200002")).toBeInTheDocument();
    const [url, body, opts] = post.mock.calls[1]!;
    expect(url).toBe("/api/v1/storefront/returns");
    expect(body).toEqual({ kind: "return", refund_method: "store_credit",
      items: [{ order_item_id: "i1", quantity: 2, reason: "Doesn't fit" }] });
    expect(opts).toEqual({ headers: { "X-Return-Token": "o1.9999999999.sig" } });
  });

  it("asks what the buyer wants instead, for an exchange", async () => {
    await findOrder();
    fireEvent.click(screen.getByRole("button", { name: "Exchange" }));
    fireEvent.click(screen.getByLabelText("Return Youth Tee"));
    fireEvent.change(screen.getByLabelText("Why, Youth Tee"), { target: { value: "Doesn't fit" } });
    fireEvent.click(screen.getByRole("button", { name: "Request exchange" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("instead");
    fireEvent.change(screen.getByLabelText("Instead of Youth Tee"), { target: { value: "v-m" } });
    fireEvent.click(screen.getByRole("button", { name: "Request exchange" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![1]).toEqual({ kind: "exchange",
      items: [{ order_item_id: "i1", quantity: 1, reason: "Doesn't fit", replacement_variant_id: "v-m" }] });
  });

  it("says why an order cannot be returned", async () => {
    post.mockImplementation(() => Promise.resolve({ ...info, open: false, why: "The 30-day return window for this order ended on October 19, 2026." }));
    render(<GuestReturnsPage />);
    fireEvent.change(screen.getByLabelText("Order number"), { target: { value: "1051" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my order" }));
    expect(await screen.findByText(/return window for this order ended/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request return" })).toBeNull();
  });
});
