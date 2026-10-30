/**
 * Brands on product cards (the manager's ask: the supplier's logo, Gildan and
 * the like, on each card beside the price), and the admin's Brands tab where a
 * shop sees every brand of its products, gets S&S's logos, adds its own, or
 * hides a brand from its cards.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tree, type RenderCtx } from "@/components/builder/render";
import type { BuilderNode, ProductCard, SitePayload } from "@/lib/builder/types";
import type { BrandLogos } from "@/services/admin.service";

const api = vi.hoisted(() => ({
  listBrandLogos: vi.fn(), saveBrandLogos: vi.fn(), brandLogosFromSS: vi.fn(),
}));
vi.mock("@/services/admin.service", () => ({ adminService: api }));
vi.mock("@/components/admin/MediaPicker", () => ({
  MediaPicker: ({ onSelect }: { onSelect: (url: string) => void }) => (
    <button type="button" onClick={() => onSelect("https://ik.example/lyfe.png")}>pick lyfe.png</button>
  ),
}));

import BrandsPage from "@/app/(admin)/admin/products/brands/page";

const GILDAN = "https://cdn.ssactivewear.com/Images/Brand/35_fm.jpg";
const GRID: BuilderNode = { id: "g1", type: "product_grid", props: { source: "newest", limit: 8, columns: 4 } };
const card = (title: string, over: Partial<ProductCard> = {}): ProductCard =>
  ({ title, url: `/products/${title.toLowerCase().replace(/\W+/g, "-")}`, image: "https://img.example/a.jpg", price: "From $2.75", badge: "", text: "", ...over });

function grid(cards: ProductCard[]) {
  const data: SitePayload["data"] = { product: null, collection: null, collectionPage: null, menus: {}, grids: { g1: cards },
    collectionGrids: {}, store: { name: "Shop", logo: "" } };
  return renderToStaticMarkup(<Tree tree={GRID} ctx={{ data, globals: {}, page: null, query: "", route: "home" } as RenderCtx} />);
}

describe("a product card's brand", () => {
  it("shows the brand's logo beside the price", () => {
    const out = grid([card("Gildan 5000 Unisex Heavy Cotton T-Shirt", { brand: "Gildan", brand_logo: GILDAN })]);
    expect(out).toContain('class="b-card-foot"');
    expect(out).toMatch(/<div class="b-card-meta">From \$2\.75<\/div><span class="b-card-brand"[^>]*><img src="https:\/\/cdn\.ssactivewear\.com\/Images\/Brand\/35_fm\.jpg" alt="Gildan"/);
  });

  it("shows the brand's name when it has no logo, and nothing without a brand", () => {
    const out = grid([card("LYFE Blank Tee", { brand: "LYFE", brand_logo: "" }), card("DTF Gang Sheet", { brand: "", brand_logo: "" })]);
    expect(out).toContain('<span class="b-card-brand-name">LYFE</span>');
    // A card with no brand keeps the markup it always had.
    expect(out).toContain('DTF Gang Sheet</div><div class="b-card-meta">From $2.75</div></a>');
    expect(out.match(/b-card-foot/g)).toHaveLength(1);
  });

  it("never puts an address that is not a picture's in an image", () => {
    const out = grid([card("Odd", { brand: "Odd", brand_logo: "javascript:alert(1)" })]);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('<span class="b-card-brand-name">Odd</span>');
  });
});

const LIST: BrandLogos = {
  show: true,
  brands: [
    { key: "gildan", name: "Gildan", logo: GILDAN, source: "ss", hide: false, products: 12 },
    { key: "lyfe", name: "LYFE", logo: "", source: "", hide: false, products: 3 },
  ],
};

describe("the Brands tab", () => {
  beforeEach(() => {
    api.listBrandLogos = vi.fn().mockResolvedValue(LIST);
    api.saveBrandLogos = vi.fn().mockImplementation(async (body: { show: boolean }) => ({ ...LIST, show: body.show }));
    api.brandLogosFromSS = vi.fn();
  });

  it("lists every brand with its logo, and saves a logo added and a brand hidden", async () => {
    render(<BrandsPage />);
    expect(await screen.findByText("LYFE")).toBeTruthy();
    expect(screen.getByAltText("Gildan").getAttribute("src")).toBe(GILDAN);
    expect(screen.getByText("Name only")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add logo" }));
    fireEvent.click(screen.getByRole("button", { name: "pick lyfe.png" }));
    expect(screen.getByAltText("LYFE").getAttribute("src")).toBe("https://ik.example/lyfe.png");
    fireEvent.click(screen.getByLabelText("Show Gildan on product cards"));
    expect(save.disabled).toBe(false);

    fireEvent.click(save);
    await waitFor(() => expect(api.saveBrandLogos).toHaveBeenCalled());
    expect(api.saveBrandLogos).toHaveBeenCalledWith({
      show: true,
      brands: [
        { key: "gildan", name: "Gildan", logo: GILDAN, hide: true },
        { key: "lyfe", name: "LYFE", logo: "https://ik.example/lyfe.png", hide: false },
      ],
    });
  });

  it("turns brands off on every card", async () => {
    render(<BrandsPage />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Show brands on product cards/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveBrandLogos).toHaveBeenCalledWith(expect.objectContaining({ show: false })));
  });

  it("gets S&S's logos and says which brands S&S does not carry", async () => {
    api.brandLogosFromSS = vi.fn().mockResolvedValue({ ...LIST, filled: ["Gildan"], missing: ["LYFE"] });
    render(<BrandsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Get logos from S&S" }));
    expect(await screen.findByText("1 logo from S&S: Gildan. S&S has no logo for LYFE: add yours.")).toBeTruthy();
  });
});
