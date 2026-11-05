/**
 * Sources on a product (components/admin/products/ProductSources.tsx).
 *
 * One of the shop's own products takes S&S and SanMar as sources: buyers see
 * one product, an order takes the shop's own stock first, then a supplier by
 * the shop's rule. The card lists what is linked, finds a supplier style,
 * shows each colour/size's match before linking (and lets the shop pick one
 * by hand), hides an imported duplicate, removes a source, and turns an
 * imported product into the shop's own.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { svc, sup, admin, lock } = vi.hoisted(() => ({
  svc: { get: vi.fn(), preview: vi.fn(), link: vi.fn(), unlink: vi.fn(), convert: vi.fn(), setRule: vi.fn() },
  sup: { catalog: vi.fn() },
  admin: { updateProduct: vi.fn() },
  lock: { value: null as null | { feature: string } },
}));
vi.mock("@/services/productSources.service", () => ({ productSourcesService: svc }));
vi.mock("@/services/suppliers.service", () => ({ suppliersService: sup }));
vi.mock("@/services/admin.service", () => ({ adminService: admin }));
vi.mock("@/lib/entitlements", () => ({ useLock: () => lock.value }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn().mockResolvedValue(true) }));

import { ProductSources } from "@/components/admin/products/ProductSources";

const CAN = [
  { supplier: "ss_activewear", label: "S&S Activewear", connected: true },
  { supplier: "sanmar", label: "SanMar", connected: true },
];

function sources(linked: boolean, extra: Record<string, unknown> = {}) {
  return {
    product_id: "p1", imported_from: null, can_link: CAN, rule: "cheapest",
    suppliers: linked ? [{ supplier: "ss_activewear", label: "S&S Activewear", style_id: "39", linked: 2, stock: 5400, cost_min: 2.1, cost_max: 3.5 }] : [],
    variants: [
      { variant_id: "v1", color: "Black", size: "M", own: 1000, sources: linked ? { ss_activewear: { sku: "B00760004", stock: 4500, cost: 2.1 } } : {} },
      { variant_id: "v2", color: "Blak", size: "L", own: 1000, sources: linked ? { ss_activewear: { sku: "B00760005", stock: 900, cost: 3.5 } } : {} },
    ],
    ...extra,
  };
}

const ROWS = [
  { sku: "B00760004", color: "Black", size: "M", taken_by: null },
  { sku: "B00760005", color: "Black", size: "L", taken_by: null },
  { sku: "B00760009", color: "Navy", size: "L", taken_by: "Other Tee" },
];

function preview(pairs: unknown[], extra: Record<string, unknown> = {}) {
  return {
    supplier: "ss_activewear", label: "S&S Activewear", style_id: "39", style: "Gildan 5000", variants: 2, supplier_rows: 3,
    pairs, unmatched: [], spare: 1, duplicates: [], rows: ROWS, ...extra,
  };
}

const EXACT = { variant_id: "v1", color: "Black", size: "M", supplier_sku: "B00760004", supplier_color: "Black", supplier_size: "M", how: "exact", stock: 4500, cost: 2.1, taken_by: null };
const CLOSE = { variant_id: "v2", color: "Blak", size: "L", supplier_sku: "B00760005", supplier_color: "Black", supplier_size: "L", how: "close", stock: 900, cost: 3.5, taken_by: null };

async function openPreview(container: HTMLElement) {
  fireEvent.click(await screen.findByRole("button", { name: "+ Add a supplier" }));
  fireEvent.change(screen.getByLabelText("Style number or name"), { target: { value: "5000" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  fireEvent.click(await screen.findByRole("button", { name: "Choose" }));
  return waitFor(() => {
    const el = container.querySelector("[data-source-preview]");
    if (!el) throw new Error("not yet");
    return el as HTMLElement;
  });
}

afterEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  sup.catalog.mockReset();
  admin.updateProduct.mockReset();
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

  it("finds a style, shows each match, hides an imported duplicate, and links what matched", async () => {
    svc.get.mockResolvedValue(sources(false));
    sup.catalog.mockResolvedValue({ items: [{ style_id: "39", part_number: "B00760", brand: "Gildan", style_name: "5000", title: "Heavy Cotton T-Shirt" }], total: 1, page: 1, pages: 1 });
    svc.preview.mockResolvedValue(preview([EXACT, CLOSE], {
      duplicates: [{ id: "p9", name: "Gildan 5000 Heavy Cotton", slug: "g5000", status: "active" }],
    }));
    svc.link.mockResolvedValue({ ...sources(true), can_link: undefined, rule: undefined, linked: 2, unmatched: 0 });
    admin.updateProduct.mockResolvedValue({});

    const { container } = render(<ProductSources productId="p1" />);
    const box = await openPreview(container);
    expect(sup.catalog).toHaveBeenCalledWith("ss_activewear", { q: "5000" });
    expect(svc.preview).toHaveBeenCalledWith("ss_activewear", "p1", "39");
    expect(box.textContent).toContain("2 of 2 colours and sizes found");
    expect((screen.getByLabelText("Blak L at S&S Activewear") as HTMLSelectElement).value).toBe("B00760005");
    expect(box.querySelector('[data-match="v2"]')?.textContent).toContain("close name, check");
    // Another product's SKU cannot be picked.
    const navy = within(screen.getByLabelText("Black M at S&S Activewear")).getByRole("option", { name: /Navy L/ }) as HTMLOptionElement;
    expect(navy.disabled).toBe(true);

    fireEvent.click(within(box.querySelector("[data-duplicates]") as HTMLElement).getByRole("button", { name: "Set it to Draft" }));
    await waitFor(() => expect(box.querySelector("[data-duplicates]")).toBeNull());
    expect(admin.updateProduct).toHaveBeenCalledWith("p9", { status: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "Link 2 to S&S Activewear" }));
    await waitFor(() => expect(container.querySelector('[data-source="ss_activewear"]')).toBeTruthy());
    expect(svc.link).toHaveBeenCalledWith("ss_activewear", "p1", "39", undefined);
    // The suppliers it can take and the rule survive the link's answer.
    expect((screen.getByLabelText("When your own stock runs out, take from") as HTMLSelectElement).value).toBe("cheapest");
    fireEvent.click(screen.getByRole("button", { name: "+ Add a supplier" }));
    expect(screen.getByLabelText("Supplier")).toBeTruthy();
  });

  it("sends only the colours and sizes the shop picked by hand", async () => {
    svc.get.mockResolvedValue(sources(false));
    sup.catalog.mockResolvedValue({ items: [{ style_id: "39", part_number: "B00760", brand: "Gildan", style_name: "5000", title: "" }], total: 1, page: 1, pages: 1 });
    svc.preview.mockResolvedValue(preview([EXACT], { unmatched: [{ variant_id: "v2", color: "Blak", size: "L" }] }));
    svc.link.mockResolvedValue({ ...sources(true), linked: 1, unmatched: 1 });
    const { container } = render(<ProductSources productId="p1" />);
    const box = await openPreview(container);
    expect(box.textContent).toContain("1 of 2 colours and sizes found");

    fireEvent.change(screen.getByLabelText("Blak L at S&S Activewear"), { target: { value: "B00760005" } });
    fireEvent.change(screen.getByLabelText("Black M at S&S Activewear"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Link 1 to S&S Activewear" }));
    await waitFor(() => expect(svc.link).toHaveBeenCalled());
    expect(svc.link).toHaveBeenCalledWith("ss_activewear", "p1", "39", { v1: null, v2: "B00760005" });
  });

  it("will not link one supplier colour and size to two of the shop's", async () => {
    svc.get.mockResolvedValue(sources(false));
    sup.catalog.mockResolvedValue({ items: [{ style_id: "39", part_number: "B00760", brand: "Gildan", style_name: "5000", title: "" }], total: 1, page: 1, pages: 1 });
    svc.preview.mockResolvedValue(preview([EXACT, CLOSE]));
    const { container } = render(<ProductSources productId="p1" />);
    await openPreview(container);
    fireEvent.change(screen.getByLabelText("Blak L at S&S Activewear"), { target: { value: "B00760004" } });
    expect(screen.getByRole("alert").textContent).toContain("picked twice");
    expect((screen.getByRole("button", { name: /^Link / }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the shop's rule for which supplier comes first", async () => {
    svc.get.mockResolvedValue(sources(true));
    svc.setRule.mockResolvedValue({ rule: "sanmar" });
    render(<ProductSources productId="p1" />);
    const pick = await screen.findByLabelText("When your own stock runs out, take from");
    fireEvent.change(pick, { target: { value: "sanmar" } });
    await waitFor(() => expect((pick as HTMLSelectElement).value).toBe("sanmar"));
    expect(svc.setRule).toHaveBeenCalledWith("sanmar");
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

  it("turns an imported product into the shop's own, its supplier the source", async () => {
    svc.get.mockResolvedValue(sources(false, { imported_from: "ss_activewear" }));
    svc.convert.mockResolvedValue({ ...sources(true), converted: "ss_activewear", linked: 2, unmatched: 0 });
    const changed = vi.fn();
    const { container } = render(<ProductSources productId="p1" onChanged={changed} />);
    expect(screen.queryByRole("button", { name: "+ Add a supplier" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Make it my own product" }));
    await waitFor(() => expect(container.querySelector('[data-source="ss_activewear"]')).toBeTruthy());
    expect(svc.convert).toHaveBeenCalledWith("ss_activewear", "p1");
    expect(changed).toHaveBeenCalled();
  });

  it("is not there on a plan without supplier catalogues", () => {
    lock.value = { feature: "supplier_catalog" };
    const { container } = render(<ProductSources productId="p1" />);
    expect(container.innerHTML).toBe("");
    expect(svc.get).not.toHaveBeenCalled();
  });
});
