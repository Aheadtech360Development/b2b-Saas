/**
 * Add product, "Wholesale bulk" (owner, 2026-10-30): picked on the first
 * step, it makes a stocked product sold on the bulk order form, asks what the
 * colour cards show, and lets each picture be given its colour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ qs: "", listeners: new Set<() => void>() }));
const h = vi.hoisted(() => ({
  product: null as Record<string, unknown> | null,
  createProduct: (() => Promise.resolve({})) as (data: Record<string, unknown>) => Promise<unknown>,
  updateProduct: (() => Promise.resolve({})) as (id: string, data: Record<string, unknown>) => Promise<unknown>,
  patch: (() => Promise.resolve({})) as (url: string, body: unknown) => Promise<unknown>,
}));

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => "/admin/products/new",
    useSearchParams: () => new URLSearchParams(React.useSyncExternalStore(
      (l: () => void) => { nav.listeners.add(l); return () => { nav.listeners.delete(l); }; },
      () => nav.qs,
    )),
    useRouter: () => ({
      replace: (url: string) => { nav.qs = url.split("?")[1] ?? ""; nav.listeners.forEach((l) => l()); },
      push: () => {},
    }),
  };
});
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: () => Promise.resolve({ rows: [] }), post: () => Promise.resolve({}),
    patch: (url: string, body: unknown) => h.patch(url, body),
  },
}));
vi.mock("@/services/admin.service", () => ({
  adminService: {
    getProduct: () => Promise.resolve(h.product),
    createProduct: (data: Record<string, unknown>) => h.createProduct(data),
    updateProduct: (id: string, data: Record<string, unknown>) => h.updateProduct(id, data),
  },
}));
vi.mock("@/services/products.service", () => ({ productsService: { getCategories: () => Promise.resolve([]) } }));
vi.mock("@/services/gangSheets.service", () => ({ gangSheetsService: {} }));
vi.mock("@/components/admin/ProductOptionsBuilder", () => ({ ProductOptionsBuilder: () => null }));
vi.mock("@/components/admin/VariantOptionsEditor", () => ({ VariantOptionsEditor: () => <div data-variant-editor /> }));
vi.mock("@/components/admin/GangSheetProductEditor", () => ({ GangSheetProductEditor: () => null }));

import AddProductPage from "@/app/(admin)/admin/products/new/page";

const made = (over: Record<string, unknown> = {}) => ({
  id: "p1", slug: "gildan-5000", name: "Gildan 5000", description: null, status: "draft", moq: 1,
  pricing_mode: "variant", gang_sheet_enabled: false, bulk_order: true, bulk_cards: "pictures",
  categories: [], images: [], variants: [], ...over,
});

beforeEach(() => {
  nav.qs = "";
  h.product = made();
  h.createProduct = vi.fn(() => Promise.resolve(made()));
  h.updateProduct = vi.fn((_id: string, data: Record<string, unknown>) => { h.product = made({ ...h.product, ...data }); return Promise.resolve(h.product); });
  h.patch = vi.fn(() => Promise.resolve({}));
});

describe("Add product, Wholesale bulk", () => {
  it("is the second choice, and makes a stocked product sold on the bulk order form", async () => {
    render(<AddProductPage />);
    const choices = Array.from(document.querySelectorAll("[data-kind-card]")).map((b) => b.getAttribute("data-kind-card"));
    expect(choices).toEqual(["stocked", "bulk", "made", "gang_sheet", "upload_by_size", "upload_own"]);
    const bulk = document.querySelector('[data-kind-card="bulk"]') as HTMLButtonElement;
    expect(bulk.textContent).toContain("Wholesale bulk");
    expect(bulk.textContent).toContain("up to 10 colours");
    fireEvent.click(bulk);
    expect(bulk.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Gildan 5000" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and continue" })); });
    expect(h.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Gildan 5000", pricing_mode: "variant", bulk_order: true, status: "draft" }));

    // Step 3: the colours and sizes, as any stocked item, and what the cards show.
    expect(await screen.findByText("Buyers order these in bulk: up to 10 colours at once, and a quantity for every size.")).toBeTruthy();
    expect(document.querySelector("[data-variant-editor]")).not.toBeNull();
    const pictures = document.querySelector('[data-cards="pictures"]') as HTMLButtonElement;
    expect(pictures.getAttribute("aria-checked")).toBe("true");
    await act(async () => { fireEvent.click(document.querySelector('[data-cards="swatches"]') as HTMLButtonElement); });
    expect(h.updateProduct).toHaveBeenCalledWith("p1", { bulk_cards: "swatches" });
    expect((document.querySelector('[data-cards="swatches"]') as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
  });

  it("a plain stocked item is not sold in bulk", async () => {
    h.createProduct = vi.fn(() => Promise.resolve(made({ bulk_order: false })));
    h.product = made({ bulk_order: false });
    render(<AddProductPage />);
    fireEvent.click(document.querySelector('[data-kind-card="stocked"]') as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Tee" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and continue" })); });
    expect(h.createProduct).toHaveBeenCalledWith(expect.not.objectContaining({ bulk_order: true }));
    expect(await screen.findByText("Each colour and size becomes its own item, with its own SKU and stock.")).toBeTruthy();
    expect(document.querySelector("[data-bulk-cards]")).toBeNull();
  });

  it("gives each picture its colour on the Images step", async () => {
    h.product = made({
      variants: [{ id: "v1", color: "Black", size: "M" }, { id: "v2", color: "Navy", size: "M" }],
      images: [{ id: "i1", url_medium: "m.jpg", alt_text: "IMG_0042.jpg" }, { id: "i2", url_medium: "n.jpg", alt_text: "Navy" }],
    });
    nav.qs = "p=gildan-5000&step=4";
    render(<AddProductPage />);
    const selects = await screen.findAllByLabelText("Colour of this picture") as HTMLSelectElement[];
    const first = selects[0]!;
    expect(selects.map((s) => s.value)).toEqual(["", "Navy"]);
    expect(Array.from(first.options).map((o) => o.textContent)).toEqual(["No colour", "Black", "Navy"]);
    expect(screen.getByText("Give each picture its colour: that colour's card on the bulk order form shows it.")).toBeTruthy();
    await act(async () => { fireEvent.change(first, { target: { value: "Black" } }); });
    expect(h.patch).toHaveBeenCalledWith("/api/v1/admin/products/p1/images/i1", { alt_text: "Black" });
  });
});
