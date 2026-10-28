/**
 * Retail's order limit is a notice to the owner at 80% and 100%, never a stop
 * for buyers, and the words have to say so. Plans whose limits do not bind
 * (the print plans) show nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: (url: string) => api.get(url) } }));

import { PlanUsageNotice, usageWords, type PlanUsage } from "@/components/admin/PlanUsageNotice";

const RETAIL: PlanUsage = {
  plan: "retail", plan_name: "Retail", enforced: true, month: "2026-10", orders: 160, orders_limit: 200,
  orders_percent: 80, notice: 80, staff: 2, staff_limit: 2,
};

describe("the plan usage notice", () => {
  afterEach(() => api.get.mockReset());

  it("says how many of the plan's orders are used, and that buyers can check out", () => {
    expect(usageWords(RETAIL)).toBe(
      "Your shop has taken 160 of the 200 orders your Retail plan includes this month. Buyers can always check out.");
    expect(usageWords({ ...RETAIL, orders: 203, notice: 100 })).toContain("nothing is stopped");
    expect(usageWords({ ...RETAIL, notice: null })).toBeNull();
  });

  it("shows on Home only when the server raises a notice", async () => {
    api.get.mockResolvedValue({ ...RETAIL, orders: 205, notice: 100 });
    render(<PlanUsageNotice />);
    expect(await screen.findByRole("status")).toHaveTextContent("You have reached the 200 orders");
    expect(api.get).toHaveBeenCalledWith("/api/v1/admin/billing/usage");
  });

  it("shows nothing for a plan whose limits do not bind, or for staff who cannot read billing", async () => {
    api.get.mockResolvedValue({ ...RETAIL, plan: "starter", plan_name: "Starter", enforced: false, notice: null });
    const { container } = render(<PlanUsageNotice />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    api.get.mockRejectedValue(new Error("403"));
    const again = render(<PlanUsageNotice />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(again.container.textContent).toBe("");
  });
});
