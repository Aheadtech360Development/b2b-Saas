/**
 * The page after a checkout has an address of its own for each order and
 * reads the order back from the server.
 *
 * Every order used to land on /checkout/confirmed, one address for all of
 * them, drawn from what the browser had kept: a reload in a new tab sent the
 * buyer to an empty cart, and the checkout's steps stayed on top. Now the
 * review page replaces itself with /checkout/thank-you/<number>, which this
 * browser opens with the key the checkout answered with, or with the
 * signed-in buyer's sign-in.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const auth = { isAuthenticated: () => false, isLoading: false };

vi.mock("next/navigation", () => ({ useParams: () => ({ number: "1045" }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => auth }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));
const sendHeld = vi.fn();
vi.mock("@/lib/tracking", () => ({ sendHeldPurchase: (...args: unknown[]) => sendHeld(...args) }));

import ThankYouPage from "@/app/(customer)/checkout/thank-you/[number]/page";
import { forgetOrderKeys, orderKey, rememberOrderKey, thankYouPath } from "@/lib/orderThanks";

const KEY = "a1".repeat(20);

const ORDER = {
  order_number: "1045", created_at: "2026-10-14T12:00:00Z", status: "pending",
  payment_status: "unpaid", payment_method: "cod",
  first_name: "Sara", email: "sara@example.com", company_name: null, po_number: null,
  items: [
    { name: "Classic Tee", color: "Black", size: "L", quantity: 12, unit_price: 6.5, line_total: 78,
      configuration: null, image_url: null, gang_sheet: false },
    { name: "Gang Sheet GS-1001 — 22 x 60", color: null, size: null, quantity: 1, unit_price: 25, line_total: 25,
      configuration: null, image_url: null, gang_sheet: true },
  ],
  subtotal: 103, discounts: [], shipping_cost: 9.99, tax_amount: 8.5, tax_label: "Sales tax", convenience_fee: 0,
  total: 121.49, shipping_method: "standard", carrier: null, courier_service: null,
  ship_to: { full_name: "Sara Khan", line1: "5 Main St", line2: "", city: "Dallas", state: "TX",
             postal_code: "75201", country: "US", phone: "" },
  pickup: null, has_gang_sheet: true,
};

const SRC = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

beforeEach(() => {
  get.mockReset();
  sendHeld.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  auth.isAuthenticated = () => false;
  auth.isLoading = false;
});

describe("the thank-you page", () => {
  it("asks for the order with this browser's key and shows it", async () => {
    rememberOrderKey("1045", KEY);
    get.mockResolvedValue(ORDER);
    render(<ThankYouPage />);

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thank you, Sara!"));
    expect(get).toHaveBeenCalledTimes(1);
    // The key goes in a header: a query string lands in the API's access log.
    expect(get).toHaveBeenCalledWith("/api/v1/guest/orders/1045/thank-you", { headers: { "X-Order-Key": KEY } });
    expect(screen.getByText("Your order is placed")).toBeInTheDocument();
    expect(screen.getAllByText("sara@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("5 Main St")).toBeInTheDocument();
    expect(screen.getByText("Classic Tee")).toBeInTheDocument();
    expect(screen.getByText("Black / L")).toBeInTheDocument();
    expect(screen.getByText("Pay $121.49 when it arrives")).toBeInTheDocument();
    expect(screen.getByText(/print team/)).toBeInTheDocument();
    expect(screen.getAllByText("$121.49").length).toBeGreaterThan(0);
    // A guest follows the order on the lookup page.
    expect(screen.getByRole("link", { name: "Track this order" })).toHaveAttribute("href", "/track-order");
    // The Purchase goes as the page opens, with the server's figures.
    expect(sendHeld).toHaveBeenCalledTimes(1);
    expect(sendHeld).toHaveBeenCalledWith("1045", { total: 121.49, tax: 8.5, shipping: 9.99 });
  });

  it("waits for the sign-in to be read before asking without a key", async () => {
    auth.isLoading = true;
    get.mockResolvedValue({ ...ORDER, payment_status: "paid", payment_method: "card" });
    const { rerender } = render(<ThankYouPage />);
    expect(get).not.toHaveBeenCalled();

    auth.isLoading = false;
    auth.isAuthenticated = () => true;
    rerender(<ThankYouPage />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/guest/orders/1045/thank-you", undefined));
    expect(await screen.findByText("Paid")).toBeInTheDocument();
    // A signed-in buyer goes to the order in their account.
    expect(screen.getByRole("link", { name: "Track this order" })).toHaveAttribute("href", "/account/orders/1045");
  });

  it("says plainly when this browser cannot open the order, and where to look", async () => {
    get.mockRejectedValue(Object.assign(new Error("Order not found."), { status: 404 }));
    render(<ThankYouPage />);
    expect(await screen.findByRole("heading", { name: "Order 1045" })).toBeInTheDocument();
    expect(screen.getByText(/could not open this order here/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Track an order" })).toHaveAttribute("href", "/track-order");
  });

  it("still thanks the tab that just placed the order when the order cannot be read back", async () => {
    // The minutes while a release reaches the API, or a network blip.
    sessionStorage.setItem("af_confirmed_order", JSON.stringify({ id: "x", number: "1045" }));
    get.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    render(<ThankYouPage />);
    expect(await screen.findByRole("heading", { name: "Thank you for your order!" })).toBeInTheDocument();
    expect(screen.getByText("1045")).toBeInTheDocument();
    expect(screen.queryByText(/could not open this order/)).not.toBeInTheDocument();
    // Its Purchase still goes, with the figures held when it was placed.
    expect(sendHeld).toHaveBeenCalledWith("1045");
    sessionStorage.clear();
  });

  it("shows where to collect a will-call order, not an address", async () => {
    rememberOrderKey("1045", KEY);
    get.mockResolvedValue({
      ...ORDER, shipping_method: "will_call", shipping_cost: 0, ship_to: null,
      pickup: { name: "Acme Counter", address: "9 Dock Rd, Garland, TX 75040", hours: "Mon to Fri, 9 to 5", note: "" },
    });
    render(<ThankYouPage />);
    expect(await screen.findByText("Pickup location")).toBeInTheDocument();
    expect(screen.getByText("9 Dock Rd, Garland, TX 75040")).toBeInTheDocument();
    expect(screen.getByText("Will Call Pickup")).toBeInTheDocument();
    expect(screen.queryByText("Shipping address")).not.toBeInTheDocument();
  });

  it("says a bank transfer is still to come, not that it is paid", async () => {
    // Checkout takes the bank details, not the money: the order is unpaid
    // until the shop marks it paid.
    rememberOrderKey("1045", KEY);
    get.mockResolvedValue({ ...ORDER, payment_method: "ach", payment_status: "unpaid" });
    render(<ThankYouPage />);
    expect(await screen.findByText("ACH / Bank transfer")).toBeInTheDocument();
    expect(screen.getByText("Waiting for your bank transfer")).toBeInTheDocument();
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });
});

describe("the key this browser keeps", () => {
  it("stays out of the page's address", () => {
    expect(thankYouPath("1045")).toBe("/checkout/thank-you/1045");
    rememberOrderKey("1045", KEY);
    expect(orderKey("1045")).toBe(KEY);
    expect(orderKey("1046")).toBeNull();
  });

  it("is forgotten after 30 days, and only the last ten are kept", () => {
    localStorage.setItem("pc_order_views", JSON.stringify({ "1001": { key: KEY, at: Date.now() - 31 * 86_400_000 } }));
    expect(orderKey("1001")).toBeNull();
    for (let n = 2000; n < 2012; n++) rememberOrderKey(String(n), KEY);
    const kept = Object.keys(JSON.parse(localStorage.getItem("pc_order_views") || "{}"));
    expect(kept).toHaveLength(10);
    expect(kept).not.toContain("2000");
    expect(kept).not.toContain("1001");
  });

  it("is forgotten on signing out, from the header and from the account", () => {
    rememberOrderKey("1045", KEY);
    forgetOrderKeys();
    expect(orderKey("1045")).toBeNull();
    for (const file of ["components/layout/Header.tsx", "app/(customer)/account/layout.tsx"]) {
      expect(read(file)).toMatch(/clearAuth\(\);\s*forgetOrderKeys\(\);/);
    }
  });
});

describe("placing the order", () => {
  const review = read("app/(customer)/checkout/review/page.tsx");

  it("replaces the review page with the order's own page, guest and signed-in alike", () => {
    expect(review.match(/router\.replace\(thankYouPath\(order\.order_number\)\)/g)).toHaveLength(2);
    expect(review.match(/rememberOrderKey\(order\.order_number, order\.view_key\)/g)).toHaveLength(2);
    expect(review).not.toContain('router.push("/checkout/confirmed")');
  });

  it("holds the Purchase for the thank-you page instead of sending it from the review page", () => {
    expect(review.match(/holdPurchase\(order\.order_number,/g)).toHaveLength(2);
    expect(review).not.toContain("trackPurchase(");
    const page = read("app/(customer)/checkout/thank-you/[number]/page.tsx");
    expect(page).toContain("sendHeldPurchase(number, { total: o.total, tax: o.tax_amount, shipping: o.shipping_cost })");
    expect(page).not.toContain("trackPurchase(");
  });
});
