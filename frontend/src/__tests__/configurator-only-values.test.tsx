/**
 * "Show only these choices" on the older product page (ProductConfigurator):
 * with 14 pt paper the Coating question offers No Coating alone, picked for
 * the buyer; 16 pt paper brings every coating back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() as (url: string, body: { selections: Record<string, string> }) => Promise<unknown> },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (url: string) => api.get(url), post: (url: string, body: never) => api.post(url, body) },
}));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ isAuthenticated: () => true }) }));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/lib/tracking", () => ({ trackConfiguredAdd: vi.fn() }));

import { ProductConfigurator } from "@/components/storefront/ProductConfigurator";

const choice = (id: string, label: string, isDefault = false) =>
  ({ id, label, price_delta: 0, price_mode: "flat", is_default: isDefault });

const CONFIG = {
  pricing_mode: "configurable", base_price: 20, qty_tiers: [],
  options: [
    { id: "paper", name: "Paper Type", input_type: "radio", required: true,
      values: [choice("p14", "14 pt. Uncoated Cover", true), choice("p16", "16 pt. Gloss Cover")] },
    { id: "coating", name: "Coating", input_type: "radio", required: true,
      values: [choice("uv", "High Gloss UV Both Sides", true), choice("none", "No Coating"), choice("matte", "Matte")] },
  ],
  rules: [{ when_value_id: "p14", action: "only_values", target_option_id: "coating", target_value_id: "none",
            note: "Uncoated paper takes no coating" }],
  // As a page could open it: the coating 14 pt does not offer, still picked.
  default_selections: { paper: "p14", coating: "uv" },
};

const lastSelections = () => vi.mocked(api.post).mock.calls.at(-1)![1].selections;

describe("show only these choices on the older product page", () => {
  afterEach(() => { vi.mocked(api.get).mockReset(); vi.mocked(api.post).mockReset(); localStorage.clear(); });

  it("offers only the kept choice, picks it, and brings the rest back for other paper", async () => {
    vi.mocked(api.get).mockResolvedValue(CONFIG);
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, setup_fees: 0, quantity: 1 });
    render(<ProductConfigurator productId="card" productName="Business Card" />);

    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14", coating: "none" }));
    expect(screen.queryByText("High Gloss UV Both Sides")).toBeNull();
    expect(screen.queryByText("Matte")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("No Coating").checked).toBe(true);
    expect(screen.getByText("Uncoated paper takes no coating")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("16 pt. Gloss Cover"));
    await waitFor(() => expect(screen.getByText("High Gloss UV Both Sides")).toBeTruthy());
    expect(screen.getByText("Matte")).toBeTruthy();
    expect(screen.queryByText("Uncoated paper takes no coating")).toBeNull();
    fireEvent.click(screen.getByLabelText("Matte"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "matte" }));

    fireEvent.click(screen.getByLabelText("14 pt. Uncoated Cover"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14", coating: "none" }));
  });
});
