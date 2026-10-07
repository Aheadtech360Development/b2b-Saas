/**
 * The product edit page shows one template choice per kind of shop.
 *
 * A shop on the Website builder draws its product pages from the builder's
 * templates, so the page shows "Website template" and leaves out the older
 * "Theme template" — which only the imported theme's product page reads.
 * A shop still on its imported theme keeps "Theme template" exactly as it was.
 *
 * Hiding is all that happens: the product's template_id is never cleared, and
 * is saved back untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TemplateAssignment } from "@/services/builder.service";

// The whole edit page is mounted for each of these. Alone that takes a second
// or two; beside the rest of the suite it can pass the default five.
vi.setConfig({ testTimeout: 30_000 });

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "heavyweight-tee" }),
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/admin/VariantOptionsEditor", () => ({ VariantOptionsEditor: () => null }));
vi.mock("@/components/admin/VariantBulkEditor", () => ({ VariantBulkEditor: () => null }));
vi.mock("@/components/admin/ProductOptionsBuilder", () => ({ ProductOptionsBuilder: () => null }));

const getProduct = vi.fn();
const updateProduct = vi.fn();
vi.mock("@/services/admin.service", () => ({
  adminService: { getProduct: (...a: unknown[]) => getProduct(...a), updateProduct: (...a: unknown[]) => updateProduct(...a) },
}));
vi.mock("@/services/products.service", () => ({ productsService: { getCategories: () => Promise.resolve([]) } }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), postForm: vi.fn() },
  ApiClientError: class ApiClientError extends Error {},
}));
vi.mock("@/services/productTemplates.service", () => ({
  productTemplatesService: {
    list: () => Promise.resolve([
      { id: "t-size", name: "Size guide layout", is_default: true, status: "published", product_count: 0 },
      { id: "t-care", name: "Care notes layout", is_default: false, status: "published", product_count: 0 },
    ]),
  },
}));
vi.mock("@/services/themes.service", () => ({ themesService: { get: () => Promise.resolve({ theme: null }) } }));

const assignment = vi.fn();
vi.mock("@/services/builder.service", () => ({
  builderService: { assignment: (...a: unknown[]) => assignment(...a), assign: vi.fn() },
}));

import EditProductPage from "@/app/(admin)/admin/products/[slug]/edit/page";

const PRODUCT = {
  id: "p-1", name: "Heavyweight Tee", slug: "heavyweight-tee", description: "", status: "active", moq: 1,
  images: [], variants: [], categories: [], meta_title: null, meta_description: null, product_type: null, vendor: null,
  tags: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", template_id: "t-care", metafields: {},
  theme_page: null, pricing_mode: "variant",
};
const TEMPLATES = [{ id: "default", name: "Default product" }, { id: "apparel", name: "Apparel" }];
const builderShop: TemplateAssignment = {
  available: true, mode: "visual_builder", templates: TEMPLATES, defaultId: "default", assigned: "apparel", effective: "apparel",
  live: { id: "apparel", name: "Apparel" }, pending: false, builderLive: true, revision: 3,
};
/** Opened the builder, even published in it, but shoppers still get the imported theme. */
const legacyWithDraft: TemplateAssignment = {
  ...builderShop, mode: "legacy", assigned: "", effective: "default", live: { id: "default", name: "Default product" }, builderLive: false,
};
const neverOpened = { available: false, builderLive: false } as TemplateAssignment;

const themeCard = () => document.querySelector("[data-theme-template]");
const websiteCard = () => document.querySelector('[data-website-template="product"]');
const themeSelect = () => screen.getByLabelText("Product template") as HTMLSelectElement;
const loaded = () => screen.findByDisplayValue("Heavyweight Tee");

beforeEach(() => {
  getProduct.mockReset().mockResolvedValue({ ...PRODUCT });
  updateProduct.mockReset().mockResolvedValue({});
  assignment.mockReset();
  push.mockReset();
});

describe("a shop on the Website builder", () => {
  it("shows Website template and leaves the old Theme template card out entirely", async () => {
    assignment.mockResolvedValue(builderShop);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(websiteCard()).not.toBeNull());
    expect((screen.getByLabelText("Website template") as HTMLSelectElement).value).toBe("apparel");
    expect(themeCard()).toBeNull();
    expect(screen.queryByText("Theme template")).toBeNull();
    expect(screen.queryByLabelText("Product template")).toBeNull();
    expect(assignment).toHaveBeenCalledWith("product", "p-1");
  });

  it("never shows the old card on the way there — not for a moment", async () => {
    let answer: (s: TemplateAssignment) => void = () => {};
    assignment.mockReturnValue(new Promise<TemplateAssignment>((resolve) => { answer = resolve; }));
    render(<EditProductPage />);
    await loaded();
    // The page is up and the question is still out: neither card yet.
    expect(themeCard()).toBeNull();
    expect(websiteCard()).toBeNull();
    answer(builderShop);
    await waitFor(() => expect(websiteCard()).not.toBeNull());
    expect(themeCard()).toBeNull();
  });

  it("keeps the product's old template_id as it was: hidden is not cleared", async () => {
    assignment.mockResolvedValue(builderShop);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(websiteCard()).not.toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]![0]).toBe("p-1");
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ template_id: "t-care", name: "Heavyweight Tee" });
  });
});

describe("a shop on its imported theme", () => {
  it("keeps the Theme template card exactly as it was, and has no Website template", async () => {
    assignment.mockResolvedValue(neverOpened);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(themeCard()).not.toBeNull());
    expect(screen.getByText("Theme template")).toBeTruthy();
    await waitFor(() => expect([...themeSelect().options].map((o) => o.textContent)).toEqual(
      ["Default — Size guide layout", "Size guide layout", "Care notes layout"]));
    expect(themeSelect().value).toBe("t-care");
    expect(themeCard()!.textContent).toMatch(/Adds content around this product.s title, price and add to cart/);
    expect(themeCard()!.querySelector('a[href="/admin/storefront/product-templates"]')).not.toBeNull();
    expect(websiteCard()).toBeNull();
  });

  it("still saves a Theme template choice with the product, as before", async () => {
    assignment.mockResolvedValue(neverOpened);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(themeCard()).not.toBeNull());
    await waitFor(() => expect(themeSelect().options.length).toBe(3));
    fireEvent.change(themeSelect(), { target: { value: "t-size" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ template_id: "t-size" });
  });

  it("still saves going back to the default Theme template", async () => {
    assignment.mockResolvedValue(neverOpened);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(themeCard()).not.toBeNull());
    await waitFor(() => expect(themeSelect().options.length).toBe(3));
    fireEvent.change(themeSelect(), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ template_id: null });
  });

  it("keeps it too when the shop has a Website builder draft but has not switched over", async () => {
    assignment.mockResolvedValue(legacyWithDraft);
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(themeCard()).not.toBeNull());
    // The theme is what shoppers see, so its template still matters; the builder's is there to prepare.
    expect(websiteCard()).not.toBeNull();
    expect(themeSelect().value).toBe("t-care");
  });

  it("keeps it when the answer cannot be had — no permission to the design, or no connection", async () => {
    assignment.mockRejectedValue(new Error("403"));
    render(<EditProductPage />);
    await loaded();
    await waitFor(() => expect(themeCard()).not.toBeNull());
    expect(websiteCard()).toBeNull();
  });
});
