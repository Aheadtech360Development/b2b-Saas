/**
 * Home's Sales across the top: sessions and conversion rate beside the money,
 * for any days (components/admin/HomeSales.tsx → GET /admin/home/sales).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { asked } = vi.hoisted(() => ({ asked: [] as string[] }));

vi.mock("@/lib/shopClock", () => ({ reportOffsetMinutes: () => Promise.resolve(-300) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => {
      asked.push(url);
      const custom = url.includes("range=custom");
      return Promise.resolve({
        range: custom ? "custom" : "all", from: custom ? "2026-10-01" : null, to: "2026-10-27",
        total: 1234.5, orders: 5, average: 246.9,
        sessions: 100, converted_sessions: 5, conversion_rate: 5,
        counted_since: "2026-10-27T10:00:00+00:00",
      });
    },
  },
}));

import { HomeSales } from "@/components/admin/HomeSales";

describe("Home's Sales", () => {
  beforeEach(() => { asked.length = 0; });

  it("shows sessions and the conversion rate: 5 orders from 100 sessions is 5%", async () => {
    render(<HomeSales />);
    await screen.findByText("5%");
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("5 of 100 sessions placed an order")).toBeTruthy();
    expect(screen.getByText("$1,234.50")).toBeTruthy();
    expect(screen.getByText("$246.90")).toBeTruthy();
    // Visits were only counted from the day the storefront began reporting them.
    expect(screen.getByText(/^Counted since /)).toBeTruthy();
    expect(asked[0]).toContain("/api/v1/admin/home/sales?");
    expect(asked[0]).toContain("range=all");
    expect(asked[0]).toContain("utc_offset=-300");
  });

  it("asks for the custom days chosen, and names them", async () => {
    render(<HomeSales />);
    await screen.findByText("5%");
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(asked.some((u) => u.includes("range=custom") && u.includes("date_from=2026-10-01") && u.includes("date_to=2026-10-27"))).toBe(true));
    expect(document.querySelector("[data-period]")?.textContent).toMatch(/2026 to .*2026/);
  });

  it("asks again when another period is picked", async () => {
    render(<HomeSales />);
    await screen.findByText("5%");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(asked.some((u) => u.includes("range=7d"))).toBe(true));
    expect(document.querySelector("[data-period]")?.textContent).toBe("Last 7 days");
  });
});
