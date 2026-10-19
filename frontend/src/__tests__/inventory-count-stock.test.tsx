/**
 * Inventory → Products, and the Count stock switch.
 *
 * Brands saw "stock 0" and orders still coming in: a variant with no stock
 * record was drawn as 0 and sold without a limit, with no switch to say which
 * products count their stock. The screen must say what each product does,
 * save a size's count, and switch counting on or off for a product.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const get = vi.fn();
const patch = vi.fn();
const ask = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), patch: (...a: unknown[]) => patch(...a) },
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { InventoryProducts } from "@/components/admin/InventoryProducts";

const tee = {
  id: "p-tee", name: "Premium Blank Tee", slug: "premium-blank-tee", status: "active", image: null,
  made_to_order: null, track_inventory: true, state: "low", total: 3,
  variants: [
    { id: "v-s", sku: "TEE-BLK-S", color: "Black", size: "S", quantity: 3, low_stock_threshold: 5, state: "low" },
    { id: "v-m", sku: "TEE-BLK-M", color: "Black", size: "M", quantity: 0, low_stock_threshold: 5, state: "out" },
  ],
};
const hoodie = {
  id: "p-hood", name: "Hoodie", slug: "hoodie", status: "active", image: null,
  made_to_order: null, track_inventory: false, state: "not_counted", total: 0,
  variants: [{ id: "v-h", sku: "HD-L", color: "Grey", size: "L", quantity: 0, low_stock_threshold: 10, state: "not_counted" }],
};
const gang = {
  id: "p-gang", name: "Gang Sheet", slug: "gang", status: "active", image: null,
  made_to_order: "Gang sheet", track_inventory: false, state: "made", total: 0, variants: [],
};
const answer = (items: object[]) => ({
  items, total: items.length, page: 1, pages: 1,
  counts: { all: 3, counted: 1, low: 1, out: 0, not_counted: 1, made: 1 },
});
const card = (id: string) => document.querySelector(`[data-product="${id}"]`) as HTMLElement;

beforeEach(() => {
  get.mockReset(); patch.mockReset(); ask.mockReset();
  get.mockResolvedValue(answer([tee, hoodie, gang]));
  patch.mockResolvedValue({ success: true });
});

describe("Inventory by product", () => {
  it("says what every product does with its stock", async () => {
    render(<InventoryProducts />);
    await screen.findByText("Premium Blank Tee");
    expect(get).toHaveBeenCalledWith("/api/v1/admin/inventory/products?show=all&page=1&page_size=20");
    expect(screen.getByRole("tab", { name: "Sold out 0" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Made to order 1" })).toBeInTheDocument();

    expect(within(card("p-tee")).getByText("3 in stock")).toBeInTheDocument();
    expect(within(card("p-tee")).getByLabelText("Stock for Black M")).toHaveValue(0);
    expect(within(card("p-tee")).getByRole("switch", { name: /Count stock/ })).toHaveAttribute("aria-checked", "true");

    expect(within(card("p-hood")).getByText(/sells without a limit, even at 0/)).toBeInTheDocument();
    expect(within(card("p-hood")).queryByLabelText(/Stock for/)).toBeNull();

    expect(within(card("p-gang")).getByText(/no stock to count/)).toBeInTheDocument();
    expect(within(card("p-gang")).queryByRole("switch")).toBeNull();
  });

  it("saves a size's count and shows sold out at 0", async () => {
    render(<InventoryProducts />);
    const box = await screen.findByLabelText("Stock for Black S");
    fireEvent.change(box, { target: { value: "0" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patch).toHaveBeenCalledWith(
      "/api/v1/admin/products/p-tee/variants/v-s", { stock_quantity: 0 }));
    await waitFor(() => expect(card("p-tee").dataset.state).toBe("out"));
    expect(within(card("p-tee")).getByText("0 in stock")).toBeInTheDocument();
  });

  it("does not save a count that is not a whole number", async () => {
    render(<InventoryProducts />);
    const box = await screen.findByLabelText("Stock for Black S");
    fireEvent.change(box, { target: { value: "2.5" } });
    fireEvent.blur(box);
    await screen.findByText("A whole number, 0 or more.");
    expect(patch).not.toHaveBeenCalled();
    expect(box).toHaveValue(3);
  });

  it("switches counting on after asking, and then shows the sizes to count", async () => {
    ask.mockResolvedValue(true);
    render(<InventoryProducts />);
    await screen.findByText("Hoodie");
    fireEvent.click(within(card("p-hood")).getByRole("switch", { name: /Count stock/ }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/admin/products/p-hood", { track_inventory: true }));
    expect(String(ask.mock.calls[0]?.[0])).toMatch(/shows as sold out until you enter how many you have/);
    await waitFor(() => expect(within(card("p-hood")).getByLabelText("Stock for Grey L")).toBeInTheDocument());
    expect(card("p-hood").dataset.state).toBe("out");
  });

  it("changes nothing when the question is answered no", async () => {
    ask.mockResolvedValue(false);
    render(<InventoryProducts />);
    await screen.findByText("Premium Blank Tee");
    fireEvent.click(within(card("p-tee")).getByRole("switch", { name: /Count stock/ }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(String(ask.mock.calls[0]?.[0])).toMatch(/sell without a limit, even when a size is at 0/);
    expect(patch).not.toHaveBeenCalled();
    expect(within(card("p-tee")).getByRole("switch", { name: /Count stock/ })).toHaveAttribute("aria-checked", "true");
  });

  it("asks the server for a tab and for a search", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<InventoryProducts />);
      await screen.findByText("Premium Blank Tee");
      fireEvent.click(screen.getByRole("tab", { name: /Sold out/ }));
      await waitFor(() => expect(get).toHaveBeenLastCalledWith("/api/v1/admin/inventory/products?show=out&page=1&page_size=20"));
      fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "tee" } });
      await act(async () => { vi.advanceTimersByTime(350); });
      await waitFor(() => expect(get).toHaveBeenLastCalledWith("/api/v1/admin/inventory/products?show=out&page=1&page_size=20&q=tee"));
    } finally {
      vi.useRealTimers();
    }
  });
});
