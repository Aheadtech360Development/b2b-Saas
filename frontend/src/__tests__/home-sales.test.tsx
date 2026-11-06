/**
 * Home's Sales across the top: a tab for each number with its change against
 * the days before, and the chosen one over time below (Shopify's Home), for
 * any days (components/admin/HomeSales.tsx → GET /admin/home/sales).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { asked } = vi.hoisted(() => ({ asked: [] as string[] }));

const step = (start: string, total: number, orders: number, sessions: number, converted: number) => ({
  start, total, orders, average: orders ? Math.round((total / orders) * 100) / 100 : 0,
  sessions, converted, conversion_rate: sessions ? Math.round((converted / sessions) * 10000) / 100 : null,
});

vi.mock("@/lib/shopClock", () => ({ reportOffsetMinutes: () => Promise.resolve(-300) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => {
      asked.push(url);
      const custom = url.includes("range=custom");
      return Promise.resolve({
        range: custom ? "custom" : "30d", from: custom ? "2026-10-01" : "2026-10-01", to: "2026-10-03",
        total: 1234.5, orders: 5, average: 246.9,
        sessions: 100, converted_sessions: 5, conversion_rate: 5,
        counted_since: "2026-10-27T10:00:00+00:00",
        granularity: "day",
        series: [step("2026-10-01", 600, 2, 40, 2), step("2026-10-02", 0, 0, 0, 0), step("2026-10-03", 634.5, 3, 60, 3)],
        previous: { from: "2026-09-28", to: "2026-09-30", total: 1000, orders: 4,
                    series: [step("2026-09-28", 500, 2, 20, 1), step("2026-09-29", 300, 1, 20, 1), step("2026-09-30", 200, 1, 10, 0)] },
        changes: { total: 23.5, orders: 25, average: -1.2, sessions: 100, conversion_rate: -50 },
      });
    },
  },
}));

import { HomeSales } from "@/components/admin/HomeSales";
import { niceTicks, smoothPath } from "@/components/admin/SalesChart";

describe("Home's Sales", () => {
  beforeEach(() => { asked.length = 0; });

  it("shows sessions and the conversion rate: 5 orders from 100 sessions is 5%", async () => {
    render(<HomeSales />);
    await screen.findByText("5%");
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("5 of 100 sessions placed an order")).toBeTruthy();
    expect(screen.getAllByText("$1,234.50").length).toBeGreaterThan(0);
    expect(screen.getByText("$246.90")).toBeTruthy();
    // Visits were only counted from the day the storefront began reporting them.
    expect(screen.getByText(/^Counted since /)).toBeTruthy();
    expect(asked[0]).toContain("/api/v1/admin/home/sales?");
    // The last 30 days to begin with, as Shopify's Home.
    expect(asked[0]).toContain("range=30d");
    expect(asked[0]).toContain("utc_offset=-300");
  });

  it("gives each number its change against the days before, with an arrow and words", async () => {
    render(<HomeSales />);
    await screen.findByText("5%");
    const tab = (name: string) => screen.getAllByRole("tab").find((t) => t.textContent?.startsWith(name))!;
    expect(within(tab("Total sales")).getByText(/23\.5%/).closest("[data-dir]")).toHaveAttribute("data-dir", "up");
    expect(within(tab("Conversion rate")).getByText(/50%/).closest("[data-dir]")).toHaveAttribute("data-dir", "down");
    expect(tab("Total sales")).toHaveTextContent("up on the days before");
  });

  it("draws the chosen number over time beside the days before, and another when its tab is chosen", async () => {
    const { container } = render(<HomeSales />);
    await screen.findByText("Total sales over time");
    expect(screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")).toHaveTextContent("Total sales");
    expect(container.querySelector('[data-line="now"]')).not.toBeNull();
    expect(container.querySelector('[data-line="before"]')!.getAttribute("stroke-dasharray")).toBe("4 4");
    const legend = container.querySelector("[data-legend]")!;
    expect(legend).toHaveTextContent("Oct 1 – Oct 3, 2026");
    expect(legend).toHaveTextContent("Sep 28 – Sep 30, 2026");

    fireEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.startsWith("Orders"))!);
    expect(await screen.findByText("Orders over time")).toBeTruthy();
    expect(container.querySelector("[data-metric]")).toHaveAttribute("data-metric", "orders");
  });

  it("reads each step by the keyboard, both periods in the box", async () => {
    const { container } = render(<HomeSales />);
    await screen.findByText("Total sales over time");
    const plot = container.querySelector(".pc-chart-plot") as HTMLElement;
    fireEvent.focus(plot);
    const tip = await waitFor(() => container.querySelector("[data-tip]")!);
    expect(tip).toHaveTextContent("$634.50");
    expect(tip).toHaveTextContent("Oct 3, 2026");
    expect(tip).toHaveTextContent("$200.00");
    fireEvent.keyDown(plot, { key: "ArrowLeft" });
    expect(container.querySelector("[data-tip]")).toHaveTextContent("Oct 2, 2026");
  });

  it("has every value in a table too, and leaves a conversion rate with no visits empty", async () => {
    const { container } = render(<HomeSales />);
    await screen.findByText("5%");
    fireEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.startsWith("Conversion rate"))!);
    fireEvent.click(screen.getByRole("button", { name: "Show table" }));
    const rows = [...container.querySelectorAll("[data-sales-table] tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toEqual([
      ["Oct 1, 2026", "5%", "Sep 28, 2026", "5%"],
      ["Oct 2, 2026", "–", "Sep 29, 2026", "5%"],
      ["Oct 3, 2026", "5%", "Sep 30, 2026", "0%"],
    ]);
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
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    await waitFor(() => expect(asked.some((u) => u.includes("range=90d"))).toBe(true));
  });
});

describe("the chart's drawing", () => {
  it("rounds the scale up to clean steps from zero", () => {
    expect(niceTicks(3120)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(23)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it("bends smoothly without dipping below the lowest point (no sales drawn under $0)", () => {
    const pts: [number, number][] = [[0, 100], [10, 0], [20, 100], [30, 100], [40, 0]];
    const ys = smoothPath(pts).match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });
});
