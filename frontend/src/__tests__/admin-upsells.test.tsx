/**
 * Marketing → Upsells and Settings → Cart and checkout, the shop's side: the
 * list says when each offer shows, its price and what it sold; an offer is
 * made with a product found by search; the cart settings save the button's
 * colour and words.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const calls: { method: string; url: string; body?: unknown }[] = [];
let list: Record<string, unknown>[] = [];

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/upsells", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/admin/UpgradeNotice", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/admin/settings/SettingsFrame", () => ({ SettingsFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(() => Promise.resolve(true)), tell: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => {
      calls.push({ method: "GET", url });
      if (url === "/api/v1/admin/upsells") return Promise.resolve({ offers: list });
      if (url.startsWith("/api/v1/admin/products?")) return Promise.resolve([
        { id: "hoodie", name: "Heavyweight hoodie", status: "active", images: [], variants: [
          { id: "vh-m", color: "Black", size: "M", retail_price: "58.00" }, { id: "vh-l", color: "Black", size: "L", retail_price: "58.00" }] },
      ]);
      if (url.startsWith("/api/v1/admin/collections")) return Promise.resolve([{ id: "c1", name: "Tees" }]);
      if (url === "/api/v1/admin/storefront/cart-settings") return Promise.resolve({ button_color: "", checkout_text: "Checkout", place_order_text: "Place order", show_order_note: true });
      return Promise.resolve({});
    },
    post: (url: string, body: unknown) => { calls.push({ method: "POST", url, body }); return Promise.resolve({}); },
    put: (url: string, body: unknown) => { calls.push({ method: "PUT", url, body }); return Promise.resolve(body); },
    patch: (url: string, body: unknown) => { calls.push({ method: "PATCH", url, body }); return Promise.resolve({ ...list[0], ...(body as object) }); },
    delete: (url: string) => { calls.push({ method: "DELETE", url }); return Promise.resolve(null); },
  },
}));

import UpsellsPage from "@/app/(admin)/admin/upsells/page";
import CartSettingsPage from "@/app/(admin)/admin/settings/cart/page";
import { whenWords } from "@/lib/upsells";

const ROW = {
  id: "o1", name: "Hoodie with a tee", is_active: true, priority: 0, product_id: "hoodie", product_name: "Heavyweight hoodie",
  product_image: null, ready_made: true, variant_id: null, variant_label: null, headline: null, description: null,
  discount_type: "percent", discount_value: "10.00", discount_words: "10% off", trigger_kind: "products", trigger_ids: ["tee"],
  min_subtotal: null, max_subtotal: "499.99", orders: 3, revenue: "156.60",
};

beforeEach(() => { calls.length = 0; list = []; });

describe("the offers list", () => {
  it("says when an offer shows, in words", () => {
    expect(whenWords({ trigger_kind: "any", trigger_ids: [], min_subtotal: null, max_subtotal: null })).toBe("Every cart");
    expect(whenWords({ trigger_kind: "products", trigger_ids: ["a", "b"], min_subtotal: null, max_subtotal: "499.99" }))
      .toBe("Cart has one of 2 products, up to $499.99");
    expect(whenWords({ trigger_kind: "collections", trigger_ids: ["c"], min_subtotal: "50", max_subtotal: null }))
      .toBe("Cart has a product from a chosen collection, $50.00 or more");
  });

  it("shows each offer with its price and what it sold, and switches it off", async () => {
    list = [ROW];
    render(<UpsellsPage />);
    expect(await screen.findByText("Hoodie with a tee")).toBeInTheDocument();
    expect(screen.getByText("10% off")).toBeInTheDocument();
    expect(screen.getByText("3 orders, $156.60")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("switch", { name: "Hoodie with a tee on" })); });
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/v1/admin/upsells/o1/active", body: { is_active: false } });
  });

  it("makes a new offer from a product found by search", async () => {
    render(<UpsellsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Make your first offer/ }));
    fireEvent.change(screen.getByLabelText("Product to offer"), { target: { value: "hood" } });
    fireEvent.click(await screen.findByRole("option", { name: /Heavyweight hoodie/ }));
    fireEvent.click(screen.getByLabelText("A percentage off"));
    fireEvent.change(screen.getByLabelText("Percent off"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Cart value up to (optional)"), { target: { value: "499.99" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save offer" })); });
    const sent = calls.find((c) => c.method === "POST" && c.url === "/api/v1/admin/upsells")?.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      name: "Heavyweight hoodie offer", product_id: "hoodie", variant_id: null, discount_type: "percent", discount_value: "10",
      trigger_kind: "any", trigger_ids: [], min_subtotal: null, max_subtotal: "499.99", is_active: true,
    });
  });
});

describe("Settings, Cart and checkout", () => {
  it("saves the button's colour and words, and previews them", async () => {
    render(<CartSettingsPage />);
    const text = await screen.findByLabelText("Cart button");
    fireEvent.change(text, { target: { value: "Go to checkout" } });
    expect(document.querySelector("[data-preview-button]")?.textContent).toBe("Go to checkout");
    fireEvent.click(screen.getByLabelText("This colour"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ checkout_text: "Go to checkout", button_color: "#0F766E" });
  });
});
