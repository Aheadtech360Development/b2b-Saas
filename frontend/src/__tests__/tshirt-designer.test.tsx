/**
 * The t-shirt designer connected to the shop (Products → T-shirt designer,
 * backend services/tshirt_designer): the designer prices a design the way the
 * server does, opens on the shop's own products, the admin page puts products
 * in and sets prices, a product's own page switches it, and the product page
 * offers Design your own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const ask = vi.fn();
const lock = { value: null as null | { feature: string } };
let search = "";
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), patch: (...a: unknown[]) => patch(...a),
               post: vi.fn(), postForm: vi.fn(), delete: vi.fn() },
  ApiClientError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a), tell: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ useLock: () => lock.value, useCan: () => true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { piecePrice, quote, ratesFrom } from "@/lib/designer/pricing";
import { loadCatalog } from "@/lib/designer/catalog";
import type { Garment } from "@/lib/designer/types";
import TShirtDesignerPage from "@/app/(admin)/admin/tshirt-designer/page";
import { DesignerCard } from "@/components/admin/products/DesignerCard";
import { Tree, type RenderCtx } from "@/components/builder/render";

const TEE = "6f1c1e0a-1111-4c4c-9a9a-000000000001";
// The starting prices, as the server sends them (services/tshirt_designer.DEFAULT_RATES).
const START = {
  print: [{ min: 1, per_side: 8 }, { min: 12, per_side: 5.5 }, { min: 24, per_side: 4.25 }, { min: 48, per_side: 3.5 }, { min: 100, per_side: 2.75 }],
  embroidery: [{ min: 12, per_side: 9 }, { min: 24, per_side: 7.5 }, { min: 48, per_side: 6.25 }, { min: 100, per_side: 5 }],
  embroidery_minimum: 12, name: 4, number: 3,
};
const tee: Garment = {
  id: TEE, slug: "gildan-5000", name: "Gildan 5000", styleCode: "G500", brand: "Gildan", silhouette: "tee",
  description: "", fabric: "", basePrice: 6.5, sizes: ["S", "M", "2XL"], embroidery: true,
  colors: [{ id: "black", name: "Black", hex: "#111111" }, { id: "sport-grey", name: "Sport Grey", hex: "#B8BABD" }],
  prices: { "black|M": 6.5, "black|2XL": 8.5, "black|S": 6.5, "sport-grey|M": 7 },
  variants: { "black|M": "v1", "black|2XL": "v2", "black|S": "v3", "sport-grey|M": "v4" },
};

beforeEach(() => { get.mockReset(); put.mockReset(); patch.mockReset(); ask.mockReset(); lock.value = null; search = ""; });

describe("the designer's price, the same as the server's", () => {
  const input = (quantities: Record<string, Record<string, number>>) => ({
    garments: { [TEE]: tee }, rates: ratesFrom(START), method: "print" as const, sides: ["front", "back"] as ("front" | "back")[],
    sidesByLine: { [`${TEE}:black`]: ["front", "back"] as ("front" | "back")[], [`${TEE}:sport-grey`]: ["front"] as "front"[] },
    quantities, roster: [],
  });

  it("is each shirt's own price plus every printed side at the break the design reaches", () => {
    // The same design as backend tests/test_tshirt_designer.py: $204 there too.
    const q = quote(input({ [`${TEE}:black`]: { S: 4, M: 4, "2XL": 2 }, [`${TEE}:sport-grey`]: { M: 2 } }));
    expect(q.problems).toEqual([]);
    expect(q.perSide).toBe(5.5);
    expect(q.lines.map((l) => [l.colorId, l.size, l.unit])).toEqual([
      ["black", "S", 17.5], ["black", "M", 17.5], ["black", "2XL", 19.5], ["sport-grey", "M", 12.5],
    ]);
    expect(q.total).toBe(204);
  });

  it("refuses a size the colour is not sold in, in the server's words, and prices nothing", () => {
    const q = quote(input({ [`${TEE}:sport-grey`]: { "2XL": 1 } }));
    expect(q.problems[0]).toBe("Gildan 5000 in Sport Grey, size 2XL, is not on sale. Remove it from your sizes.");
    expect(q.total).toBe(0);
    expect(piecePrice(tee, "sport-grey", "2XL", ratesFrom(START))).toBeNull();
    expect(piecePrice(tee, "black", "2XL", ratesFrom(START))).toBe(8.5);
  });

  it("reads the shop's prices: nothing is added for a size, the variant's price says it", () => {
    expect(ratesFrom(START)).toMatchObject({ embroideryMinimum: 12, name: 4, number: 3, sizeUpcharge: {} });
    expect(ratesFrom(START).print[1]).toEqual({ min: 12, perSide: 5.5 });
  });
});

describe("the designer opens on the shop's own products", () => {
  it("draws a colour without its own swatch from its name", async () => {
    get.mockResolvedValue({ available: true, rates: START, garments: [{ ...tee, colors: [{ id: "navy", name: "Navy", hex: null }] }] });
    const shop = await loadCatalog();
    expect(get).toHaveBeenCalledWith("/api/v1/tshirt-designs/catalog");
    expect(shop.available).toBe(true);
    expect(shop.garments[0]!.colors[0]!.hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(shop.rates.print[0]).toEqual({ min: 1, perSide: 8 });
  });

  it("reads a shop without the designer as closed, not as an error", async () => {
    const { ApiClientError } = await import("@/lib/api-client");
    get.mockRejectedValue(new (ApiClientError as unknown as new (s: number, m: string) => Error)(403, "Forbidden"));
    expect((await loadCatalog()).available).toBe(false);
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "p1", name: "Gildan 5000", slug: "gildan-5000", status: "active", image: null, enabled: true,
  silhouette: "tee", embroidery: false, colours: 12, sizes: ["S", "3XL"], from_price: 6.5, problem: null, ...over,
});

function answer(map: Record<string, unknown>) {
  get.mockImplementation((url: string) => {
    for (const [k, v] of Object.entries(map)) if (url.includes(k)) return Promise.resolve(typeof v === "function" ? (v as (u: string) => unknown)(url) : v);
    return Promise.resolve({});
  });
}

describe("Products → T-shirt designer", () => {
  it("lists the products customers can design and adds another from the catalog", async () => {
    answer({
      "/setup": { has_products: true, prices_saved: false, has_designs: false, available: true },
      "/products?pick=true": { items: [row({ id: "p2", name: "Bella 3001", slug: "bella-3001", enabled: false }),
                                       row({ id: "p3", name: "Business cards", slug: "cards", enabled: false, problem: "This product is made to order." })] },
      "/tshirt-designer/products": { items: [row()] },
    });
    patch.mockResolvedValue(row({ id: "p2", name: "Bella 3001", slug: "bella-3001" }));
    const { container } = render(<TShirtDesignerPage />);
    expect(await screen.findByText("Gildan 5000")).toBeInTheDocument();
    expect(container).toHaveTextContent("12 colours · S to 3XL · from $6.50");
    expect(container).toHaveTextContent("Set your decoration prices");

    fireEvent.click(screen.getByRole("button", { name: /Add products/ }));
    const add = await screen.findByText("Bella 3001");
    const cards = screen.getByText("Business cards").closest("[data-pick]")!;
    expect(cards.querySelector("button")).toBeDisabled();
    await act(async () => { fireEvent.click(add.closest("[data-pick]")!.querySelector("button")!); });
    expect(patch).toHaveBeenCalledWith("/api/v1/admin/tshirt-designer/products/p2", { enabled: true });
    await waitFor(() => expect(container.querySelector('[data-designer-product="bella-3001"]')).not.toBeNull());
  });

  it("changes a product's shape and takes it out after asking", async () => {
    answer({ "/setup": { has_products: true, prices_saved: true, has_designs: true, available: true }, "/tshirt-designer/products": { items: [row()] } });
    patch.mockResolvedValue(row({ silhouette: "tank" }));
    render(<TShirtDesignerPage />);
    const shape = await screen.findByLabelText("Garment shape of Gildan 5000");
    await act(async () => { fireEvent.change(shape, { target: { value: "tank" } }); });
    expect(patch).toHaveBeenCalledWith("/api/v1/admin/tshirt-designer/products/p1", { silhouette: "tank" });
    ask.mockResolvedValue(true);
    patch.mockResolvedValue(row({ enabled: false }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Take Gildan 5000 out of the designer" })); });
    expect(patch).toHaveBeenLastCalledWith("/api/v1/admin/tshirt-designer/products/p1", { enabled: false });
    await waitFor(() => expect(screen.queryByText("Gildan 5000")).toBeNull());
  });

  it("says the prices are only starting ones until the shop saves its own, and saves them", async () => {
    search = "tab=prices";
    answer({ "/setup": { has_products: true, prices_saved: false, has_designs: false, available: true },
             "/settings": { rates: START, saved: false, silhouettes: [] } });
    put.mockResolvedValue({ rates: { ...START, name: 5 }, saved: true, silhouettes: [] });
    render(<TShirtDesignerPage />);
    expect(await screen.findByText(/These are starting prices, not yours yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("A name on a shirt ($)"), { target: { value: "5" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save prices" })); });
    expect(put).toHaveBeenCalledWith("/api/v1/admin/tshirt-designer/settings", { rates: { ...START, name: 5 } });
    expect(await screen.findByText(/Saved. The designer shows these prices/)).toBeInTheDocument();
  });

  it("shows what a customer sent: who, the quote, each shirt's pictures and print files", async () => {
    search = "tab=designs";
    const design = {
      id: "d1", reference: "TS-AB-2611-0001", name: "Team tees", method: "print", status: "submitted", status_timeline: [],
      version: 1, shirt_count: 1, total_qty: 12, quoted_total: 204, contact_name: "Ali Khan", contact_email: "ali@example.com",
      customer_notes: "For Saturday", supplier_notes: null, revision_count: 0, order_id: null, paid: false, created_at: null, updated_at: null,
      document: { quantities: { [`${TEE}:black`]: { M: 12 } } },
      outputs: [
        { id: "o1", shirt_key: `${TEE}:black`, view: "front", kind: "preview", file_url: "https://ik.example/front.png", file_name: "f.png", width_px: 1600, height_px: 1600, dpi: null },
        { id: "o2", shirt_key: `${TEE}:black`, view: "front", kind: "print", file_url: "https://ik.example/front-print.png", file_name: "fp.png", width_px: 3600, height_px: 4200, dpi: 300 },
      ],
    };
    answer({ "/setup": { has_products: true, prices_saved: true, has_designs: true, available: true },
             "/admin/tshirt-designs/d1": design, "/admin/tshirt-designs": [design] });
    render(<TShirtDesignerPage />);
    fireEvent.click(await screen.findByText("TS-AB-2611-0001"));
    expect(await screen.findByText("Ali Khan")).toBeInTheDocument();
    expect(screen.getByText("$204.00")).toBeInTheDocument();
    expect(screen.getByText("M × 12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Print file: front \(3600×4200, 300 DPI\)/ })).toHaveAttribute("href", "https://ik.example/front-print.png");
    patch.mockResolvedValue({ ...design, status: "approved" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve" })); });
    expect(patch).toHaveBeenCalledWith("/api/v1/admin/tshirt-designs/d1/status", { status: "approved", supplier_notes: undefined });
  });
});

describe("a product's own page in the admin", () => {
  it("switches the designer on for the product, at once", async () => {
    patch.mockResolvedValue(row({ enabled: true }));
    render(<DesignerCard productId="p1" status="active" enabled={false} config={null} />);
    await act(async () => { fireEvent.click(screen.getByRole("switch", { name: "Customers can design this product" })); });
    expect(patch).toHaveBeenCalledWith("/api/v1/admin/tshirt-designer/products/p1", { enabled: true });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Drawn as")).toBeInTheDocument();
  });

  it("is not offered where the shop's plan has no designer", () => {
    lock.value = { feature: "tshirt_designer" };
    const { container } = render(<DesignerCard productId="p1" status="active" enabled={false} config={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("the product page", () => {
  const ctx = (designer: boolean) => ({
    data: { product: { id: TEE, slug: "gildan-5000", name: "Gildan 5000", from_price: 6.5, pricing_mode: "variant", gang_sheet: false,
                       images: [], colours: [{ label: "Black", hex: "#111" }], sizes: [{ label: "M" }], options: [], designer },
            collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" } },
    globals: {}, page: null, query: "", route: "product",
  }) as unknown as RenderCtx;
  const buy = { id: "b1", type: "product_buy", props: { showQuantity: true, showBuyNow: true, label: "Add to cart" } };

  it("offers Design your own first when the shop switched the designer on", () => {
    const { container } = render(<Tree tree={buy} ctx={ctx(true)} />);
    const link = container.querySelector("[data-design-own]")!;
    expect(link).toHaveAttribute("href", `/design?product=${TEE}`);
    expect(link).toHaveTextContent("Design your own");
    expect(container.querySelector('[data-theme-buy="cart"]')).toHaveClass("b-btn-outline");
  });

  it("keeps the ordinary buy box otherwise", () => {
    const { container } = render(<Tree tree={buy} ctx={ctx(false)} />);
    expect(container.querySelector("[data-design-own]")).toBeNull();
    expect(container.querySelector('[data-theme-buy="cart"]')).toHaveClass("b-btn-solid");
  });
});
