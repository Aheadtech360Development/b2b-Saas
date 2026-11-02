/**
 * The admin's "show only these choices" rule (ProductOptionsBuilder): one rule,
 * the target question's choices ticked, saved as the positions the server
 * turns into a row per choice kept.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 30_000 });

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (url: string) => api.get(url), put: (url: string, body: unknown) => api.put(url, body), blob: vi.fn() },
}));
vi.mock("@/components/admin/MediaPicker", () => ({ MediaPicker: () => null }));
vi.mock("@/components/admin/CombinationPricing", () => ({ CombinationPricing: () => null }));
vi.mock("@/components/admin/PriceGridImport", () => ({ PriceGridImport: () => null }));

import { ProductOptionsBuilder } from "@/components/admin/ProductOptionsBuilder";

const value = (id: string, label: string, isDefault = false) =>
  ({ id, label, price_delta: 0, price_mode: "flat", is_default: isDefault, enabled: true });
const question = (id: string, name: string, values: ReturnType<typeof value>[]) =>
  ({ id, name, input_type: "select", required: true, is_active: true, in_price_matrix: false, values });

function loaded(rules: unknown[]) {
  return {
    pricing_mode: "configurable", base_price: 20, qty_tiers: [],
    options: [
      question("o-paper", "Paper Type", [value("p14", "14 pt", true), value("p16", "16 pt")]),
      question("o-coat", "Coating", [value("uv", "High Gloss UV", true), value("none", "No Coating"), value("matte", "Matte")]),
    ],
    rules,
  };
}

const KEEP_NONE = { id: "r1", when_option: 0, when_value: 0, action: "only_values", target_option: 1,
                    target_value: null, target_values: [1], note: null };

describe("show only these choices in the admin", () => {
  afterEach(() => { vi.mocked(api.get).mockReset(); vi.mocked(api.put).mockReset(); });

  it("shows the kept choices ticked and saves the ones ticked", async () => {
    vi.mocked(api.get).mockResolvedValue(loaded([KEEP_NONE]));
    vi.mocked(api.put).mockResolvedValue({});
    const { container } = render(<ProductOptionsBuilder productId="card" />);
    const keep = await waitFor(() => {
      const found = container.querySelector<HTMLElement>("[data-only-values]");
      if (!found) throw new Error("the rules have not loaded yet");
      return found;
    });
    const box = (label: string) => within(keep).getByLabelText<HTMLInputElement>(label);
    expect(box("No Coating").checked).toBe(true);
    expect(box("Matte").checked).toBe(false);
    expect(box("High Gloss UV").checked).toBe(false);

    fireEvent.click(box("Matte"));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const sent = vi.mocked(api.put).mock.calls[0]![1] as { rules: Record<string, unknown>[] };
    expect(sent.rules).toEqual([expect.objectContaining({
      action: "only_values", when_option: 0, when_value: 0, target_option: 1, target_values: [1, 2],
    })]);
  });

  it("asks for a tick, and leaves a rule with none out of the save", async () => {
    vi.mocked(api.get).mockResolvedValue(loaded([KEEP_NONE]));
    vi.mocked(api.put).mockResolvedValue({});
    const { container } = render(<ProductOptionsBuilder productId="card" />);
    const keep = await waitFor(() => {
      const found = container.querySelector<HTMLElement>("[data-only-values]");
      if (!found) throw new Error("the rules have not loaded yet");
      return found;
    });

    fireEvent.click(within(keep).getByLabelText("No Coating"));
    expect(within(keep).getByText(/Tick the choices that stay/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect((vi.mocked(api.put).mock.calls[0]![1] as { rules: unknown[] }).rules).toEqual([]);
  });
});
