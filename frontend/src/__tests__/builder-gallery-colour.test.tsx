/**
 * A builder product page's pictures: one row of thumbnails under the main
 * picture (a client asked: at most five in view, the rest slide), and picking
 * a colour in the buy box shows that colour's pictures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isAuthenticated: () => false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: () => Promise.resolve({}), post: () => Promise.resolve({ unit_price: 1, total: 1 }) },
  ApiClientError: class extends Error {},
}));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/components/storefront/UploadBySizeModal", () => ({ UploadBySizeModal: () => null }));
vi.mock("@/components/storefront/UploadOwnSheetModal", () => ({ UploadOwnSheetModal: () => null }));
vi.mock("@/components/storefront/DesignUploadModal", () => ({ DesignUploadModal: () => null }));

import { ProductGallery } from "@/components/builder/islands/Interactive";
import ThemeProductBuy, { type ThemeProductData } from "@/components/storefront/ThemeProductBuy";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { COLOUR_CHOSEN, announceColour, picturesOfColour } from "@/lib/colourPictures";

const pic = (name: string) => ({ url: `https://img.example.com/${name.replace(/\W+/g, "-")}.jpg`, alt: name });
const TEE = [
  pic("1133 Crop Top - Natural"), pic("1133 Crop Top - Natural - Back"),
  pic("1133 Crop Top - White"), pic("1133 Crop Top - Black"), pic("1133 Crop Top - Black - Side"),
  pic("1133 Crop Top - Black Heather"),
];

const mainSrc = (c: HTMLElement) => c.querySelector(".b-pgallery-main img")!.getAttribute("src");
const thumbs = (c: HTMLElement) => c.querySelectorAll(".b-pgallery-thumb").length;

describe("which pictures are a colour's", () => {
  it("takes the part of the alt text that is the colour, as the S&S import writes it", () => {
    expect(picturesOfColour(TEE, "Black").map((p) => p.alt))
      .toEqual(["1133 Crop Top - Black", "1133 Crop Top - Black - Side"]);
    expect(picturesOfColour(TEE, "black heather").map((p) => p.alt)).toEqual(["1133 Crop Top - Black Heather"]);
    expect(picturesOfColour([pic("Pink"), pic("Grey")], "pink").map((p) => p.alt)).toEqual(["Pink"]);
  });

  it("falls back to an alt text that mentions it, and else finds none", () => {
    expect(picturesOfColour([pic("Pink front view")], "Pink")).toHaveLength(1);
    expect(picturesOfColour(TEE, "Light Blue")).toEqual([]);
    expect(picturesOfColour(TEE, "  ")).toEqual([]);
  });
});

describe("the thumbnails", () => {
  it("are one row that slides, never rows that grow", () => {
    const { container } = render(<ProductGallery id="g1" productId="p1" images={[...TEE, ...TEE]} layout="thumbs-below" />);
    const row = container.querySelectorAll(".b-pgallery-strip > .b-pgallery-thumbs");
    expect(row).toHaveLength(1);
    expect(thumbs(container)).toBe(12);
    expect(BASE_CSS).toContain(".bsite :where(.b-pgallery-thumbs){display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 32px) / 5);gap:8px;overflow-x:auto;");
    expect(BASE_CSS).not.toMatch(/b-pgallery-thumbs\)\{[^}]*grid-template-columns/);
    expect(BASE_CSS).toContain(".bsite :where(.b-pgallery-thumbs){grid-auto-columns:calc((100% - 24px) / 4)}");
  });
});

describe("picking a colour", () => {
  let container: HTMLElement;
  beforeEach(() => {
    ({ container } = render(<ProductGallery id="g1" productId="p1" images={TEE} layout="thumbs-below" />));
  });

  it("shows that colour's pictures, the first one large", () => {
    expect(mainSrc(container)).toBe(TEE[0]!.url);
    act(() => announceColour("p1", "Black"));
    expect(mainSrc(container)).toBe(TEE[3]!.url);
    expect(thumbs(container)).toBe(2);
    act(() => announceColour("p1", "White"));
    expect(mainSrc(container)).toBe(TEE[2]!.url);
  });

  it("leaves the pictures alone for a colour with none, or for another product", () => {
    fireEvent.click(container.querySelectorAll(".b-pgallery-thumb")[1]!);
    expect(mainSrc(container)).toBe(TEE[1]!.url);
    act(() => announceColour("p1", "Light Blue"));
    act(() => announceColour("other-product", "Black"));
    expect(mainSrc(container)).toBe(TEE[1]!.url);
    expect(thumbs(container)).toBe(TEE.length);
  });
});

describe("the buy box", () => {
  const product = {
    id: "p1", slug: "crop-top", name: "1133 Crop Top", pricing_mode: "variant", from_price: 2.8, images: TEE,
    variants: [{ id: "v1", colour: "Natural", size: "S", price: 2.8, stock: 5, sku: "a" },
               { id: "v2", colour: "Black", size: "S", price: 2.8, stock: 5, sku: "b" }],
    colours: [{ label: "Natural", hex: "#E8DCC8" }, { label: "Black", hex: "#111111" }],
    sizes: [{ label: "S" }], options: [], qty_tiers: [], gang_sheet: false,
  } as ThemeProductData;
  const heard: string[] = [];
  const listen = (e: Event) => heard.push((e as CustomEvent<{ colour: string }>).detail.colour);

  beforeEach(() => {
    heard.length = 0;
    window.addEventListener(COLOUR_CHOSEN, listen);
    document.body.innerHTML = `<div data-product-id="p1">
      <div class="variant-group"><span class="vlabel">Color</span>
        <button data-label="Natural" class="selected"></button><button data-label="Black"></button></div>
      <div class="variant-group"><span class="vlabel">Size</span><button data-label="S" class="selected"></button></div>
    </div>`;
  });
  afterEach(() => window.removeEventListener(COLOUR_CHOSEN, listen));

  it("tells the gallery which colour was picked, and nothing for a size", () => {
    render(<ThemeProductBuy product={product} />);
    fireEvent.click(document.querySelector('[data-label="Black"]')!);
    fireEvent.click(document.querySelector('[data-label="S"]')!);
    expect(heard).toEqual(["Black"]);
  });
});
