/**
 * "Answers that rule others out" on a builder product page.
 *
 * The page never read the shop's rules: with 14 pt paper chosen, the coating
 * the shop had hidden or greyed out was still there to pick, and the server,
 * which does apply them, answered "Not available".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({
  api: { post: vi.fn() as (url: string, body: { selections: Record<string, string>; quantity: number }) => Promise<unknown> },
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isAuthenticated: () => false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: () => Promise.resolve({}), post: (url: string, body: never) => api.post(url, body) },
  ApiClientError: class extends Error { status = 400; },
}));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/components/storefront/UploadBySizeModal", () => ({ UploadBySizeModal: () => null }));
vi.mock("@/components/storefront/UploadOwnSheetModal", () => ({ UploadOwnSheetModal: () => null }));
vi.mock("@/components/storefront/DesignUploadModal", () => ({ DesignUploadModal: () => null }));

import ThemeProductBuy, { type ThemeProductData } from "@/components/storefront/ThemeProductBuy";
import type { OptionRule } from "@/lib/optionRules";
import { readGuestCart } from "@/lib/guestCart";

function card(rules: OptionRule[]): ThemeProductData {
  return {
    id: "card", slug: "business-card", name: "Business Card", pricing_mode: "configurable", from_price: 20,
    images: [], variants: [], colours: [], sizes: [], qty_tiers: [], gang_sheet: false,
    options: [
      { id: "paper", name: "Paper Type", required: true, values: [{ id: "p14", label: "14 pt. Uncoated Cover" }, { id: "p16", label: "16 pt. Gloss Cover" }] },
      { id: "coating", name: "Coating", required: true, values: [{ id: "uv", label: "High Gloss UV Both Sides" }, { id: "none", label: "No Coating" }, { id: "matte", label: "Matte" }] },
    ],
    rules,
  };
}

/** The buy box as the builder draws it: each question's first choice picked. */
function page(): HTMLElement {
  const root = document.createElement("div");
  root.dataset.productId = "card";
  root.innerHTML = `
    <div class="b-price" data-theme-price="1">$20.00</div>
    <div class="variant-group" data-option-id="paper"><label class="vlabel">Paper Type</label>
      <button class="b-choice selected" data-label="14 pt. Uncoated Cover" data-value-id="p14">14 pt</button>
      <button class="b-choice" data-label="16 pt. Gloss Cover" data-value-id="p16">16 pt</button></div>
    <div class="variant-group" data-option-id="coating"><label class="vlabel">Coating</label>
      <button class="b-choice selected" data-label="High Gloss UV Both Sides" data-value-id="uv">UV</button>
      <button class="b-choice" data-label="No Coating" data-value-id="none">None</button>
      <button class="b-choice" data-label="Matte" data-value-id="matte">Matte</button></div>
    <button data-theme-buy="1">Add to cart</button>`;
  document.body.appendChild(root);
  return root;
}

const group = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-option-id="${id}"]`)!;
const choice = (root: HTMLElement, id: string) => root.querySelector<HTMLButtonElement>(`[data-value-id="${id}"]`)!;
const picked = (root: HTMLElement, id: string) => group(root, id).querySelector<HTMLElement>(".selected")?.dataset.valueId;
const lastSelections = () => vi.mocked(api.post).mock.calls.at(-1)![1].selections;

describe("the shop's rules on a builder product page", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.mocked(api.post).mockReset();
  });

  it("hides a field while its rule holds, and brings it back with its answer", async () => {
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, quantity: 1 });
    const root = page();
    render(<ThemeProductBuy product={card([{ when_value_id: "p14", action: "hide_option", target_option_id: "coating" }])} />);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(group(root, "coating").style.display).toBe("none");
    expect(lastSelections()).toEqual({ paper: "p14" });

    fireEvent.click(choice(root, "p16"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "uv" }));
    expect(group(root, "coating").style.display).toBe("");
  });

  it("greys out a choice, moves off it, and lets it back for other paper", async () => {
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, quantity: 1 });
    const root = page();
    render(<ThemeProductBuy product={card([
      { when_value_id: "p14", action: "disable_value", target_value_id: "uv", note: "N/A on uncoated paper" },
    ])} />);

    // UV was the first choice; with 14 pt paper it cannot be had, so the next one is picked.
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14", coating: "none" }));
    expect(picked(root, "coating")).toBe("none");
    expect(choice(root, "uv").disabled).toBe(true);
    expect(choice(root, "uv").title).toBe("N/A on uncoated paper");
    expect(group(root, "coating").querySelector(".vlabel")!.textContent).toBe("Coating: No Coating");

    fireEvent.click(choice(root, "uv"));
    expect(picked(root, "coating")).toBe("none");

    fireEvent.click(choice(root, "p16"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "none" }));
    expect(choice(root, "uv").disabled).toBe(false);
    fireEvent.click(choice(root, "uv"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "uv" }));
  });

  it("greys out a whole field with the shop's note and leaves its answer out", async () => {
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, quantity: 1 });
    const root = page();
    render(<ThemeProductBuy product={card([
      { when_value_id: "p14", action: "disable_option", target_option_id: "coating", note: "Uncoated paper is not coated" },
    ])} />);

    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14" }));
    expect(group(root, "coating").querySelector("[data-rule-note]")!.textContent).toBe("Uncoated paper is not coated");
    expect(choice(root, "none").disabled).toBe(true);

    fireEvent.click(choice(root, "p16"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "uv" }));
    expect(group(root, "coating").querySelector("[data-rule-note]")).toBeNull();
  });

  it("shows only the choices a rule keeps, picks the one left, and brings the rest back", async () => {
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, quantity: 1 });
    const root = page();
    render(<ThemeProductBuy product={card([
      { when_value_id: "p14", action: "only_values", target_option_id: "coating", target_value_id: "none" },
    ])} />);

    // 14 pt paper: Coating offers No Coating alone, already picked; the rest have left the page.
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14", coating: "none" }));
    expect(picked(root, "coating")).toBe("none");
    expect(choice(root, "uv").style.display).toBe("none");
    expect(choice(root, "matte").style.display).toBe("none");
    expect(choice(root, "none").style.display).toBe("");
    expect(group(root, "coating").querySelector(".vlabel")!.textContent).toBe("Coating: No Coating");

    // 16 pt paper: every coating is back to choose from.
    fireEvent.click(choice(root, "p16"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "none" }));
    expect(choice(root, "uv").style.display).toBe("");
    expect(choice(root, "matte").style.display).toBe("");
    fireEvent.click(choice(root, "matte"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p16", coating: "matte" }));

    // Back to 14 pt: Matte is not offered there, so No Coating is picked again.
    fireEvent.click(choice(root, "p14"));
    await waitFor(() => expect(lastSelections()).toEqual({ paper: "p14", coating: "none" }));
  });

  it("adds to the cart without asking for a required field a rule hid", async () => {
    vi.mocked(api.post).mockResolvedValue({ unit_price: 20, total: 20, quantity: 1 });
    const root = page();
    render(<ThemeProductBuy product={card([{ when_value_id: "p14", action: "hide_option", target_option_id: "coating" }])} />);
    await waitFor(() => expect(api.post).toHaveBeenCalled());

    fireEvent.click(root.querySelector("[data-theme-buy]")!);
    await waitFor(() => expect(readGuestCart()).toHaveLength(1));
    expect(readGuestCart()[0]).toMatchObject({ selections: { paper: "p14" } });
  });
});
