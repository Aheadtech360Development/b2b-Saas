/**
 * Designs 35-37: Connect a carrier, the collection editor's conditions, and a
 * new purchase order (find a SKU, total, save, send to the supplier).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const replace = vi.fn();
const ask = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a),
    patch: vi.fn(), delete: vi.fn(), postForm: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a), tell: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), useParams: () => ({ id: "new" }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/admin/WebsiteTemplateField", () => ({ WebsiteTemplateField: () => null }));

import { ConnectCarrierDialog } from "@/components/admin/shipping/ConnectCarrierDialog";
import { PurchaseOrderEditor } from "@/components/admin/purchase-orders/PurchaseOrderEditor";
import CollectionEditorPage from "@/app/(admin)/admin/products/collections/[id]/page";

const field = (name: string, label: string, kind = "text", required = true) => ({ name, label, kind, help: null, required, options: kind === "select" ? ["production", "test"] : [], placeholder: "" });
const CARRIERS = {
  providers: [
    { key: "usps", name: "USPS", blurb: "", docs_url: "https://developer.usps.com/", fields: [field("client_id", "Consumer key"), field("client_secret", "Consumer secret", "secret")], connection: { connected: false } },
    { key: "ups", name: "UPS", blurb: "", docs_url: "https://developer.ups.com/", fields: [field("client_id", "Client ID"), field("client_secret", "Client secret", "secret"), field("account_number", "UPS account number")], connection: { connected: false } },
    { key: "fedex", name: "FedEx", blurb: "", docs_url: "", fields: [field("api_key", "API key")], connection: { connected: false } },
  ],
};

beforeEach(() => { [get, post, put, replace, ask].forEach((f) => f.mockReset()); });

describe("Connect a carrier (design 35)", () => {
  it("shows each carrier's own fields, tests them, and connects", async () => {
    get.mockResolvedValue(CARRIERS);
    post.mockImplementation(async (url: string) => (url.endsWith("/test") ? { ok: false, message: "UPS said: invalid client" } : { verified: true }));
    const onConnected = vi.fn();
    render(<ConnectCarrierDialog onClose={() => {}} onConnected={onConnected} />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["UPS", "FedEx", "USPS"]);
    expect(screen.getByLabelText("UPS account number")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Where do I find these?" })).toHaveAttribute("href", "https://developer.ups.com/");
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "id-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/UPS said: invalid client/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/v1/admin/integrations/ups/test", { values: { client_id: "id-1", client_secret: "", account_number: "" } });
    fireEvent.click(screen.getByRole("tab", { name: "USPS" }));
    expect(screen.getByLabelText("Consumer key")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Consumer key"), { target: { value: "k" } });
    fireEvent.change(screen.getByLabelText("Consumer secret"), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/admin/integrations/usps", { values: { client_id: "k", client_secret: "s" }, force: false }));
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(onConnected.mock.calls[0]![0]).toBe("usps");
  });
});

describe("Collection editor (design 36)", () => {
  it("counts the products the conditions hold as they are typed", async () => {
    get.mockImplementation(async (url: string) => (url.endsWith("/rule-options")
      ? { fields: [{ key: "product_type", label: "Product type", kind: "text", choices: [], operators: [{ key: "equals", label: "is" }, { key: "contains", label: "contains" }] }] }
      : []));
    post.mockResolvedValue({ total: 5, products: [{ id: "p1", name: "DTF Transfer", slug: "dtf", status: "active" }] });
    render(<CollectionEditorPage />);
    expect(await screen.findByRole("heading", { name: "New collection" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Summer sale/), { target: { value: "DTF and UV DTF Transfers" } });
    expect((screen.getByLabelText("Link") as HTMLInputElement).value).toBe("dtf-and-uv-dtf-transfers");
    fireEvent.click(screen.getByRole("radio", { name: "Conditions decide" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Gang sheet" } });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/admin/collections/preview",
      { match_type: "automatic", rules_match: "all", rules: [{ field: "product_type", operator: "equals", value: "Gang sheet" }] }), { timeout: 2000 });
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText("5 products")).toBeInTheDocument();
    // Ordered by best selling once conditions fill it: "the order I put them in" is for hand-picked ones.
    expect((screen.getByLabelText("Order products by") as HTMLSelectElement).value).toBe("best_selling");
  });
});

describe("New purchase order (design 37)", () => {
  it("finds a SKU, totals the lines, saves the draft and sends it to the supplier", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/manufacturers")) return [{ id: "m1", name: "Acme Blanks", email: "orders@acme.test" }];
      if (url.includes("/variants?q=")) return [{ variant_id: "v1", sku: "TEE-BLK-L", product_name: "Blank Tee", color: "Black", size: "L", cost: 3.5 }];
      throw new Error(`unexpected ${url}`);
    });
    post.mockImplementation(async (url: string) => (url.endsWith("/purchase-orders/") ? { id: "po1" } : { success: true }));
    render(<PurchaseOrderEditor id={null} />);
    expect(await screen.findByRole("heading", { name: "New purchase order" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "m1" } });
    fireEvent.change(screen.getByLabelText("Find a SKU"), { target: { value: "TEE" } });
    fireEvent.click(await screen.findByRole("option", { name: /TEE-BLK-L/ }));
    fireEvent.change(screen.getByLabelText("Quantity of TEE-BLK-L"), { target: { value: "24" } });
    expect(within(document.querySelector("[data-total]") as HTMLElement).getByText("$84.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/admin/purchase-orders/", {
      manufacturer_id: "m1", expected_delivery: null, notes: null,
      line_items: [{ product_variant_id: "v1", new_product_name: null, new_product_sku: null, qty_ordered: 24, unit_cost_expected: 3.5 }],
    }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/admin/purchase-orders/po1/send-email"));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("/admin/purchase-orders/po1?sent="));
  });

  it("will not save without a supplier, and Receive stock waits for a saved order", async () => {
    get.mockImplementation(async (url: string) => (url.endsWith("/manufacturers") ? [] : []));
    render(<PurchaseOrderEditor id={null} />);
    await screen.findByRole("heading", { name: "New purchase order" });
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Choose the supplier.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
