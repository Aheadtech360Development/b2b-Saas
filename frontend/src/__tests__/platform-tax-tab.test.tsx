/**
 * The platform's Taxes tab: every brand's sales tax for the dates chosen, with
 * a row opening to its months and regions.
 */
import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TaxReport } from "@/services/platformTax.service";

// Mounted beside the rest of the suite this can pass the default five seconds.
vi.setConfig({ testTimeout: 30_000 });

const asked: Record<string, string | undefined>[] = [];
const fig = (orders: number, taxed: number, sales: number, tax: number, back: number) =>
  ({ orders, taxed_orders: taxed, sales, tax, tax_refunded: back, net_tax: Math.round((tax - back) * 100) / 100 });
const REPORT: TaxReport = {
  range: { from: null, to: null, tz: "America/Chicago" },
  basis: "paid",
  totals: { ...fig(9, 7, 1290, 106.43, 12.38), brands: 3, brands_with_tax: 2 },
  brands: [
    { id: "b1", slug: "innterflow", name: "Innterflow", status: "active", last_order: "2026-10-06T18:00:00Z", ...fig(7, 6, 1190, 98.18, 12.38),
      months: [{ month: "2026-10", ...fig(5, 4, 900, 74.25, 12.38) }, { month: "2026-09", ...fig(2, 2, 290, 23.93, 0) }],
      regions: [{ region: "TX", ...fig(5, 5, 1000, 82.5, 12.38) }, { region: "", ...fig(1, 1, 190, 15.68, 0) }] },
    { id: "b2", slug: "beta-prints", name: "Beta Prints", status: "suspended", last_order: null, ...fig(2, 1, 100, 8.25, 0),
      months: [{ month: "2026-08", ...fig(2, 1, 100, 8.25, 0) }], regions: [{ region: "CA", ...fig(1, 1, 100, 8.25, 0) }] },
    { id: "b3", slug: "acme", name: "Acme", status: "active", last_order: null, ...fig(0, 0, 0, 0, 0), months: [], regions: [] },
  ],
};
vi.mock("@/services/platformTax.service", () => ({
  platformTaxService: { report: (q: Record<string, string | undefined>) => { asked.push(q); return Promise.resolve(REPORT); } },
}));

import { TaxTab } from "@/components/platform/TaxTab";

const brandRows = () => [...document.querySelectorAll("tbody > tr")].filter((r) => r.querySelector("button[aria-expanded]"));
const ready = () => waitFor(() => expect(screen.getByText("Sales tax by brand")).toBeInTheDocument());

beforeEach(() => { asked.length = 0; localStorage.clear(); });

describe("the platform's Taxes tab", () => {
  it("lists every brand with its tax, the most first, and the total under them", async () => {
    render(<TaxTab />);
    await ready();
    expect(asked[0]).toMatchObject({ basis: "paid", from: undefined, to: undefined });
    expect(brandRows().map((r) => r.querySelector("button[aria-expanded]")!.textContent)).toEqual([
      expect.stringContaining("Innterflow"), expect.stringContaining("Beta Prints"), expect.stringContaining("Acme"),
    ]);
    expect(brandRows()[1]).toHaveTextContent("suspended");
    const total = document.querySelector("tfoot tr")!;
    expect(total).toHaveTextContent("Total — 3 brands");
    expect(total).toHaveTextContent("$106.43");
    expect(total).toHaveTextContent("−$12.38");
    expect(total).toHaveTextContent("$94.05");
    if (process.env.LOOK_OUT) {
      fireEvent.click(brandRows()[0]!);
      writeFileSync(process.env.LOOK_OUT, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:28px 36px;background:#F7F7F8;font-family:Inter,system-ui,sans-serif;color:#18181B}*{box-sizing:border-box}button{font:inherit}</style></head><body>${document.body.innerHTML}</body></html>`);
    }
  });

  it("opens a brand to its months and its tax regions", async () => {
    render(<TaxTab />);
    await ready();
    fireEvent.click(brandRows()[0]!);
    const months = screen.getByText("By month").parentElement!;
    expect(within(months).getByText("Oct 2026")).toBeInTheDocument();
    expect(within(months).getByText("Sep 2026")).toBeInTheDocument();
    const regions = screen.getByText("By tax region").parentElement!;
    expect(within(regions).getByText("TX")).toBeInTheDocument();
    expect(within(regions).getByText("No region recorded")).toBeInTheDocument();
    // A brand with nothing in the dates says so.
    fireEvent.click(brandRows()[2]!);
    expect(screen.getByText("No orders from Acme in these dates.")).toBeInTheDocument();
  });

  it("asks again for other dates and for unpaid orders too", async () => {
    render(<TaxTab />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Last year" }));
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` }));
    fireEvent.change(screen.getByLabelText("Orders counted"), { target: { value: "all" } });
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ basis: "all" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ from: "2026-10-01" }));
    expect(screen.getByRole("button", { name: "Last year" })).toHaveAttribute("aria-pressed", "false");
    // Days begin and end in the zone chosen, and the choice is kept for next time.
    expect(asked.at(-1)!.tz).toBe((screen.getByLabelText("Dates in") as HTMLSelectElement).value);
    fireEvent.change(screen.getByLabelText("Dates in"), { target: { value: "America/Los_Angeles" } });
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ tz: "America/Los_Angeles", from: "2026-10-01" }));
    expect(localStorage.getItem("pc_tax_zone")).toBe("America/Los_Angeles");
  });

  it("narrows to a brand by name, or to the brands that charged tax, and totals what is shown", async () => {
    render(<TaxTab />);
    await ready();
    fireEvent.click(screen.getByLabelText("Only brands that charged tax"));
    expect(brandRows()).toHaveLength(2);
    expect(document.querySelector("tfoot tr")).toHaveTextContent("Total — 2 of 3 brands");
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "beta" } });
    expect(brandRows()).toHaveLength(1);
    expect(document.querySelector("tfoot tr")).toHaveTextContent("$8.25");
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "zzz" } });
    expect(screen.getByText("No brand matches that.")).toBeInTheDocument();
  });

  it("sorts by the column clicked", async () => {
    render(<TaxTab />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Brand/ }));
    expect(brandRows()[0]).toHaveTextContent("Acme");
    fireEvent.click(screen.getByRole("button", { name: /^Orders/ }));
    expect(brandRows()[0]).toHaveTextContent("Innterflow");
  });
});
