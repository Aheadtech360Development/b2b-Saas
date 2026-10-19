/**
 * Buy labels for several orders (design 33): one carrier and one service for
 * the batch, each order's own rate for it, a total, and an order that service
 * does not reach named and left out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const post = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { BuyLabelsDialog } from "@/components/admin/orders/BuyLabelsDialog";

const rate = (id: string, carrier: string, service: string, cost: number) => ({ rate_id: id, carrier, service, cost, currency: "USD", days: 2 });
const QUOTES: Record<string, object> = {
  o1: { rates: [rate("r1", "UPS", "Ground", 9.1), rate("r2", "USPS", "Priority", 8.4), rate("r3", "UPS", "2nd Day Air", 21)], to: { city: "Austin", state: "TX" }, weight_lbs: 2.5 },
  o2: { rates: [rate("r4", "UPS", "Ground", 11.25), rate("r5", "UPS", "2nd Day Air", 25)], to: { city: "Tulsa", state: "OK" }, weight_lbs: 4 },
  o3: { rates: [], error: "Address not found", to: { city: "Nowhere", state: "ZZ" }, weight_lbs: 1 },
};
const targets = [
  { id: "o1", order_number: "1003", customer: "A" },
  { id: "o2", order_number: "1002", customer: "B" },
  { id: "o3", order_number: "1001", customer: "C" },
];
const row = (n: string) => document.querySelector(`[data-label-order="${n}"]`) as HTMLElement;

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (url: string) => {
    const m = /orders\/(o\d)\/fetch-rates/.exec(url);
    if (m) return QUOTES[m[1]!];
    const b = /orders\/(o\d)\/generate-label-manual/.exec(url);
    if (b) return { success: true, tracking_number: `TRK-${b[1]}` };
    throw new Error(`unexpected ${url}`);
  });
});

describe("buying labels for a batch", () => {
  it("quotes each order and starts on the carrier and service that reach the most for the least", async () => {
    render(<BuyLabelsDialog targets={targets} carriers={["ups"]} notify onClose={() => {}} onBought={() => {}} />);
    expect(screen.getByRole("heading", { name: "Buy labels for 3 orders" })).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText("Carrier") as HTMLSelectElement).value).toBe("UPS"));
    await waitFor(() => expect((screen.getByLabelText("Service") as HTMLSelectElement).value).toBe("Ground"));
    expect(within(row("1003")).getByText("Austin, TX")).toBeInTheDocument();
    expect(within(row("1003")).getByText("2.5 lb")).toBeInTheDocument();
    // A select shows its first option before the dialog has chosen it: wait for the rate itself.
    expect(await within(row("1003")).findByText("$9.10")).toBeInTheDocument();
    expect(within(row("1002")).getByText("$11.25")).toBeInTheDocument();
    expect(within(row("1001")).getByText("Address not found")).toBeInTheDocument();
    expect(screen.getByText("Total $20.35")).toBeInTheDocument();
    expect(screen.getByText(/Tracking is saved on each order and emailed to the customer/)).toBeInTheDocument();
  });

  it("names an order the chosen service does not reach, and leaves it out of the total", async () => {
    render(<BuyLabelsDialog targets={targets} carriers={["ups"]} notify onClose={() => {}} onBought={() => {}} />);
    await waitFor(() => expect((screen.getByLabelText("Service") as HTMLSelectElement).value).toBe("Ground"));
    fireEvent.change(screen.getByLabelText("Carrier"), { target: { value: "USPS" } });
    await waitFor(() => expect((screen.getByLabelText("Service") as HTMLSelectElement).value).toBe("Priority"));
    expect(await within(row("1002")).findByText("Not offered")).toBeInTheDocument();
    expect(await screen.findByText("Total $8.40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy 1 label" })).toBeEnabled();
  });

  it("buys every reachable order on the chosen service and shows its tracking", async () => {
    const onBought = vi.fn();
    render(<BuyLabelsDialog targets={targets} carriers={["ups"]} notify onClose={() => {}} onBought={onBought} />);
    await waitFor(() => expect((screen.getByLabelText("Service") as HTMLSelectElement).value).toBe("Ground"));
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "2nd Day Air" } });
    expect(screen.getByText("Total $46.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy 2 labels" }));
    await waitFor(() => expect(onBought).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/admin/orders/o1/generate-label-manual",
      { rate_id: "r3", carrier: "UPS", service: "2nd Day Air", notify: true });
    expect(post).toHaveBeenCalledWith("/api/v1/admin/orders/o2/generate-label-manual",
      { rate_id: "r5", carrier: "UPS", service: "2nd Day Air", notify: true });
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining("o3/generate-label-manual"), expect.anything());
    expect(within(row("1003")).getByText(/Bought · TRK-o1/)).toBeInTheDocument();
  });

  it("says so when no carrier is connected, and asks for no rates", () => {
    render(<BuyLabelsDialog targets={targets} carriers={[]} notify onClose={() => {}} onBought={() => {}} />);
    expect(screen.getByText(/No carrier is connected yet/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
