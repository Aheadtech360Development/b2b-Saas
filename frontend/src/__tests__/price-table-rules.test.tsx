/**
 * The price table under the shop's rules (components/admin/CombinationPricing).
 *
 * 14 pt paper hides the Coating question, so a buyer's "14 pt, Standard" has
 * no coating; the table lists that row with a dash under Coating and a price
 * box of its own, says only buyable combinations are listed, and saves the
 * row without the hidden question.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (url: string) => api.get(url), put: (url: string, body: unknown) => api.put(url, body), post: vi.fn() },
}));

import { CombinationPricing } from "@/components/admin/CombinationPricing";

const cell = (key: string, values: string[], selections: Record<string, string>) => ({
  combo_key: key, label: values.join(" / "), selections,
  values: [{ option: "Paper", value: values[0] }, { option: "Coating", value: values[1] }, { option: "Size", value: values[2] }],
  unit_price: null, line_price: null, setup_fee: null, sku: null, enabled: true, note: null,
  has_own_price: false, inherited_from: null, inherited_unit_price: null, inherited_line_price: null,
});

const TABLE = {
  matrix_options: [
    { id: "p", name: "Paper", values: [{ id: "p14", label: "14 pt" }, { id: "p16", label: "16 pt" }] },
    { id: "c", name: "Coating", values: [{ id: "cg", label: "Gloss" }] },
    { id: "s", name: "Size", values: [{ id: "ss", label: "Standard" }] },
  ],
  all_options: [], total: 2, all_total: 2 * 1 * 1 + 0, rules_applied: true, offset: 0, limit: 50, max_matrix: 100_000,
  too_large: false, priced_count: 0, quantity_option_id: null,
  combinations: [
    cell("p14|ss", ["14 pt", "-", "Standard"], { p: "p14", s: "ss" }),
    cell("p16|cg|ss", ["16 pt", "Gloss", "Standard"], { p: "p16", c: "cg", s: "ss" }),
  ],
};

describe("the price table under the shop's rules", () => {
  afterEach(() => { api.get.mockReset(); api.put.mockReset(); });

  it("lists the shorter row with a dash and saves its price without the hidden question", async () => {
    api.get.mockResolvedValue({ ...TABLE, all_total: 4 });
    api.put.mockResolvedValue({ saved: 1, cleared: 0 });
    const { container } = render(<CombinationPricing productId="card" />);
    await waitFor(() => expect(container.querySelector("[data-not-asked]")).toBeTruthy());
    expect(container.querySelector("[data-not-asked]")!.textContent).toBe("—");
    expect(container.querySelector("[data-rules-applied]")!.textContent).toContain("rule out the other 2");

    const boxes = container.querySelectorAll("input[type=number]");
    fireEvent.change(boxes[0]!, { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const sent = (api.put.mock.calls[0]![1] as { combinations: { selections: Record<string, string>; unit_price: number | null }[] }).combinations;
    expect(sent[0]).toMatchObject({ selections: { p: "p14", s: "ss" }, unit_price: 12.5 });
  });

  it("says nothing about rules on a product without any", async () => {
    api.get.mockResolvedValue({ ...TABLE, rules_applied: false });
    const { container } = render(<CombinationPricing productId="card" />);
    await screen.findByText("Save prices");
    expect(container.querySelector("[data-rules-applied]")).toBeNull();
  });
});
