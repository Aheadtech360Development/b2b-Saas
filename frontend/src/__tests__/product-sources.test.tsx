/**
 * Sources on a product (components/admin/products/ProductSources.tsx).
 *
 * One of the shop's own products takes S&S and SanMar as sources: buyers see
 * one product, an order takes the shop's own stock first, then the cheapest
 * supplier. The card lists what is linked, finds a supplier style, shows what
 * it matches before linking, and removes a source.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { svc, sup, lock } = vi.hoisted(() => ({
  svc: { get: vi.fn(), preview: vi.fn(), link: vi.fn(), unlink: vi.fn() },
  sup: { catalog: vi.fn() },
  lock: { value: null as null | { feature: string } },
}));
vi.mock("@/services/productSources.service", () => ({ productSourcesService: svc }));
vi.mock("@/services/suppliers.service", () => ({ suppliersService: sup }));
vi.mock("@/lib/entitlements", () => ({ useLock: () => lock.value }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn().mockResolvedValue(true) }));

import { ProductSources } from "@/components/admin/products/ProductSources";

const CAN = [
  { supplier: "ss_activewear", label: "S&S Activewear", connected: true },
  { supplier: "sanmar", label: "SanMar", connected: true },
];

function sources(linked: boolean, extra: Record<string, unknown> = {}) {
  return {
    product_id: "p1", imported_from: null, can_link: CAN,
    suppliers: linked ? [{ supplier: "ss_activewear", label: "S&S Activewear", style_id: "39", linked: 2, stock: 5400, cost_min: 2.1, cost_max: 3.5 }] : [],
    variants: [
      { variant_id: "v1", color: "Black", size: "M", own: 1000, sources: linked ? { ss_activewear: { sku: "B00760004", stock: 4500, cost: 2.1 } } : {} },
      { variant_id: "v2", color: "Black", size: "L", own: 1000, sources: linked ? { ss_activewear: { sku: "B00760005", stock: 900, cost: 3.5 } } : {} },
    ],
    ...extra,
  };
}

afterEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  sup.catalog.mockReset();
  lock.value = null;
});

describe("ProductSources", () => {
  it("lists a linked supplier with its stock, cost and the stock by size", async () => {
    svc.get.mockResolvedValue(sources(true));
    const { container } = render(<ProductSources productId="p1" />);
    const row = await waitFor(() => {
      const el = container.querySelector('[data-source="ss_activewear"]');
      if (!el) throw new Error("not yet");
      return el as HTMLElement;
    });
    expect(row.textContent).toContain("2 of 2 colours and sizes linked");
    expect(row.textContent).toContain("5400 in stock");
    expect(row.textContent).toContain("cost $2.10 to $3.50");
    const table = container.querySelector("[data-source-table] table") as HTMLElement;
    const first = within(table).getAllByRole("row")[1]?.textContent ?? "";
    expect(first).toContain("Black");
    expect(first).toContain("1000");
    expect(first).toContain("4500");
  });

  it("finds a style, shows what it matches, and links it", async () => {
    svc.get.mockResolvedValue(sources(false));
    sup.catalog.mockResolvedValue({ items: [{ style_id: "39", part_number: "B00760", brand: "Gildan", style_name: "5000", title: "Heavy Cotton T-Shirt" }], total: 1, page: 1, pages: 1 });
    svc.preview.mockResolvedValue({
      supplier: "ss_activewear", label: "S&S Activewear", style_id: "39", style: "Gildan 5000", variants: 2, supplier_rows: 40,
      pairs: [
        { variant_id: "v1", color: "Black", size: "M", supplier_sku: "B00760004", supplier_color: "Black", supplier_size: "M", how: "exact", stock: 4500, cost: 2.1, taken_by: null },
        { variant_id: "v2", color: "Blak", size: "L", supplier_sku: "B00760005", supplier_color: "Black", supplier_size: "L", how: "close", stock: 900, cost: 3.5, taken_by: null },
      ],
      unmatched: [], spare: 38,
      duplicates: [{ id: "p9", name: "Gildan 5000 Heavy Cotton", slug: "g5000", status: "active" }],
    });
    svc.link.mockResolvedValue({ ...sources(true), can_link: undefined, linked: 2, unmatched: 0 });

    const { container } = render(<ProductSources productId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add a supplier" }));
    fireEvent.change(screen.getByLabelText("Style number or name"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose" }));
    expect(sup.catalog).toHaveBeenCalledWith("ss_activewear", { q: "5000" });

    const preview = await waitFor(() => {
      const el = container.querySelector("[data-source-preview]");
      if (!el) throw new Error("not yet");
      return el as HTMLElement;
    });
    expect(svc.preview).toHaveBeenCalledWith("ss_activewear", "p1", "39");
    expect(preview.textContent).toContain("2 of 2 colours and sizes found");
    expect(preview.querySelector("[data-close-matches]")?.textContent).toContain("Blak L = Black L");
    expect(preview.querySelector("[data-duplicates]")?.textContent).toContain("Gildan 5000 Heavy Cotton");

    fireEvent.click(screen.getByRole("button", { name: "Link 2 to S&S Activewear" }));
    await waitFor(() => expect(container.querySelector('[data-source="ss_activewear"]')).toBeTruthy());
    expect(svc.link).toHaveBeenCalledWith("ss_activewear", "p1", "39");
    // The suppliers it can take survive the link's answer, so another can be added.
    fireEvent.click(screen.getByRole("button", { name: "+ Add a supplier" }));
    expect(screen.getByLabelText("Supplier")).toBeTruthy();
  });

  it("removes a source", async () => {
    svc.get.mockResolvedValue(sources(true));
    svc.unlink.mockResolvedValue({ ...sources(false), can_link: undefined, removed: 2 });
    const { container } = render(<ProductSources productId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(container.querySelector("[data-no-sources]")).toBeTruthy());
    expect(svc.unlink).toHaveBeenCalledWith("ss_activewear", "p1");
  });

  it("asks to connect a supplier first when none is connected", async () => {
    svc.get.mockResolvedValue(sources(false, { can_link: CAN.map((c) => ({ ...c, connected: false })) }));
    const { container } = render(<ProductSources productId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add a supplier" }));
    expect(container.querySelector("[data-connect-first]")?.textContent).toContain("Connect S&S Activewear or SanMar first");
  });

  it("explains that an imported product takes no sources", async () => {
    svc.get.mockResolvedValue(sources(false, { imported_from: "ss_activewear" }));
    const { container } = render(<ProductSources productId="p1" />);
    await waitFor(() => expect(container.querySelector('[data-product-sources="imported"]')).toBeTruthy());
    expect(screen.queryByRole("button", { name: "+ Add a supplier" })).toBeNull();
  });

  it("is not there on a plan without supplier catalogues", () => {
    lock.value = { feature: "supplier_catalog" };
    const { container } = render(<ProductSources productId="p1" />);
    expect(container.innerHTML).toBe("");
    expect(svc.get).not.toHaveBeenCalled();
  });
});
