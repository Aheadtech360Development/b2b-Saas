/**
 * The buyer's order tracking (Retail launch, package 2): a timeline per parcel,
 * the courier's link, the shop's message, and where it goes as city and
 * postcode only. The lookup sends the email in a POST body, never the address.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: { post: vi.fn(), get: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (...a: unknown[]) => api.post(...a), get: (...a: unknown[]) => api.get(...a) },
}));

import { TrackingLookup, TrackingView, type TrackingPage } from "@/components/storefront/OrderTracking";

const steps = (n: number) => ["paid", "packed", "shipped", "out_for_delivery", "delivered"].map((key, i) => ({
  key, label: ["Paid", "Packed", "Shipped", "Out for delivery", "Delivered"][i]!, done: i < n,
}));

const PAGE: TrackingPage = {
  order_number: "1042", placed_at: "2026-10-20T10:00:00Z", status: "shipped", status_words: "On its way", paid: true,
  ship_to: { city: "Austin", state: "TX", postal_code: "78701", country: "US" },
  steps: steps(3), message: "Orders ship Monday to Friday.",
  shipments: [
    { id: "s1", carrier: "UPS", service: "Ground", tracking_number: "1Z999", tracking_url: "https://ups.example/1Z999",
      status: "out_for_delivery", status_words: "Out for delivery", detail: null, shipped_at: null, delivered_at: null, steps: steps(4) },
    { id: "s2", carrier: "USPS", service: null, tracking_number: "9400", tracking_url: null,
      status: "delivered", status_words: "Delivered", detail: "Left at front door", shipped_at: null,
      delivered_at: "2026-10-24T15:00:00Z", steps: steps(5) },
  ],
};

describe("the order tracking page", () => {
  afterEach(() => { api.post.mockReset(); api.get.mockReset(); });

  it("shows each parcel's timeline, courier, number and link, and the shop's message", () => {
    render(<TrackingView data={PAGE} />);
    expect(screen.getByText("Orders ship Monday to Friday.")).toBeTruthy();
    expect(screen.getByText("Parcel 1 of 2")).toBeTruthy();
    expect(screen.getByText("1Z999")).toBeTruthy();
    expect(screen.getByRole("link", { name: /courier/ }).getAttribute("href")).toBe("https://ups.example/1Z999");
    expect(screen.getByText("Delivered: Left at front door")).toBeTruthy();
    const first = document.querySelector('[data-parcel="1Z999"]')!;
    expect(Array.from(first.querySelectorAll('[data-done="true"]')).map((s) => s.textContent?.replace(" (done)", "")))
      .toEqual(["Paid", "Packed", "Shipped", "Out for delivery"]);
    expect(screen.getByText(/Going to Austin, TX 78701/)).toBeTruthy();
  });

  it("looks an order up with its number and email in the body, not the address", async () => {
    api.post.mockResolvedValue(PAGE);
    const found = vi.fn();
    render(<TrackingLookup onFound={found} />);
    fireEvent.change(screen.getByLabelText("Order number"), { target: { value: " 1042 " } });
    fireEvent.change(screen.getByLabelText("Email used for the order"), { target: { value: "maya@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));
    await waitFor(() => expect(found).toHaveBeenCalledWith(PAGE));
    const [url, body] = api.post.mock.calls[0]!;
    expect(url).toBe("/api/v1/storefront/track");
    expect(body).toEqual({ order_number: "1042", email: "maya@example.com" });
  });

  it("says when the order is not found", async () => {
    api.post.mockRejectedValue(new Error("We could not find that order. Check the order number and the email it was placed with."));
    render(<TrackingLookup initialNumber="1042" onFound={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email used for the order"), { target: { value: "x@y.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not find that order");
  });
});
