/**
 * An order page that says what the total is made of, and what to print.
 *
 * A manager reading a $7.35 order with a $1.17 total saw no discount between
 * them and no rate on the tax. And a gang sheet line said only its name, where
 * the Shopify print apps shops know list a preview, edit links, the
 * print-ready file and whether any design is low resolution, on the line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { API_BASE_URL } from "@/lib/constants";
import type { GangSheetProduction } from "@/components/admin/GangSheetLineFiles";

const downloads: [string, string | undefined][] = [];
let adminOrder: Record<string, unknown> = {};
let buyerOrder: Record<string, unknown> = {};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ord-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/download", () => ({
  downloadFile: (url: string, name?: string) => { downloads.push([url, name]); return Promise.resolve(true); },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: () => Promise.resolve({}), post: () => Promise.resolve({}), patch: () => Promise.resolve({}) },
}));
vi.mock("@/services/admin.service", () => ({ adminService: { getOrder: () => Promise.resolve(adminOrder) } }));
vi.mock("@/services/account.service", () => ({
  accountService: { getOrder: () => Promise.resolve(buyerOrder), getOrderComments: () => Promise.resolve([]) },
}));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ isAuthenticated: () => true, isLoading: false }) }));
vi.mock("@/components/providers/BrandingProvider", () => ({ useBranding: () => ({ store_name: "Print Shop" }) }));
vi.mock("@/components/admin/OrderGangSheets", () => ({ OrderGangSheets: () => null }));
vi.mock("@/components/admin/OrderRefunds", () => ({ OrderRefunds: () => null }));

import { GangSheetLineFiles } from "@/components/admin/GangSheetLineFiles";
import AdminOrderDetailPage from "@/app/(admin)/admin/orders/[id]/page";
import BuyerOrderPage from "@/app/(customer)/account/orders/[id]/page";

const PRINT = "/api/v1/gang-sheets/files/s1/print?exp=1&sig=abc";
const PREVIEW = "/api/v1/gang-sheets/files/s1/preview?exp=1&sig=def";

function sheet(over: Partial<GangSheetProduction> = {}): GangSheetProduction {
  return {
    id: "s1", reference: "GS-SL-2610-0018", kind: "gang_sheet", status: "in_review", sheet_name: "22x10",
    width_in: 22, height_in: 10, quantity: 2,
    preview_url: PREVIEW,
    print_file: { url: PRINT, name: "GS-SL-2610-0018-22x10in-300dpi.png", signed: true },
    needs_layout: false, left_out: [], edit_url: null, admin_edit_url: "/admin/gang-sheets?sheet=s1",
    originals: [{ name: "red.png", url: "https://ik.imagekit.io/shop/red.png" }],
    resolution: { low: false, low_files: [], lowest_dpi: 300, designs: 1, unchecked: 0, threshold_dpi: 200 },
    ...over,
  };
}

/** The value beside a label on the line, as a person reads the row. */
function row(label: string): HTMLElement {
  const name = screen.getByText(label, { selector: "span" });
  return name.nextElementSibling as HTMLElement;
}

const DISCOUNTS = [{ code: "SAVE90", type: "percentage", value: 90, amount: 6.62, label: "SAVE90 · 90% off" }];

beforeEach(() => {
  downloads.length = 0;
  adminOrder = {
    id: "ord-1", order_number: "ORD-1042", company_name: "Sam Prints", company_id: "", status: "confirmed",
    payment_status: "paid", po_number: null, order_notes: null, tracking_number: null, courier: null,
    courier_service: null, shipped_at: null, subtotal: "7.35", shipping_cost: "0.00", tax_amount: "0.44",
    tax_label: "Tax (WY · 6%)", discounts: DISCOUNTS, total: "1.17", created_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:00:00Z",
    items: [{
      id: "i1", sku: "GANG-SHEET", product_name: "Gang Sheet GS-SL-2610-0018 — 22x10", color: null, size: null,
      quantity: 2, unit_price: "3.68", line_total: "7.35",
      gang_sheet: sheet({ resolution: { low: true, low_files: [{ name: "blue.png", dpi: 142 }], lowest_dpi: 142, designs: 2, unchecked: 0, threshold_dpi: 200 } }),
    }],
  };
  buyerOrder = {
    id: "ord-1", order_number: "ORD-1042", status: "confirmed", payment_status: "paid", total: "1.17",
    subtotal: "7.35", shipping_cost: "0.00", tax_amount: "0.44", tax_label: "Tax (WY · 6%)", discounts: DISCOUNTS,
    po_number: null, order_notes: null, tracking_number: null, carrier: null, created_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:00:00Z", items: [],
  };
});

describe("a gang sheet's line, as the Shopify print apps list it", () => {
  it("says the size, the builder, and links the preview, the shop's editor and the print-ready file", () => {
    render(<GangSheetLineFiles sheet={sheet()} />);
    expect(row("Size").textContent).toBe("22″ × 10″ · ×2");
    expect(row("Builder").textContent).toBe("Gang sheet builder");
    const preview = within(row("Preview")).getByRole("link");
    expect(preview).toHaveAttribute("href", `${API_BASE_URL}${PREVIEW}`);
    expect(preview).toHaveAttribute("target", "_blank");
    expect(within(row("Admin edit")).getByRole("link")).toHaveAttribute("href", "/admin/gang-sheets?sheet=s1");
    const file = within(row("Print ready file")).getByRole("link");
    expect(file).toHaveAttribute("href", `${API_BASE_URL}${PRINT}`);
    expect(file.textContent).toContain("GS-SL-2610-0018-22x10in-300dpi.png");
    expect(row("Print ready file").textContent).toContain("300 DPI PNG");
    expect(row("Has low resolution").textContent).toBe("No — lowest 300 DPI");
  });

  it("names the low resolution designs and their DPI", () => {
    render(<GangSheetLineFiles sheet={sheet({ resolution: { low: true, low_files: [{ name: "blue.png", dpi: 142 }], lowest_dpi: 142, designs: 2, unchecked: 0, threshold_dpi: 200 } })} />);
    expect(row("Has low resolution").textContent).toBe("Yes — blue.png (142 DPI)");
  });

  it("gives the buyer's edit link to copy while the buyer may still change the sheet, and says it is locked after", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const { unmount } = render(<GangSheetLineFiles sheet={sheet({ status: "submitted", edit_url: "/gang-sheets?edit=s1&product=p1" })} />);
    fireEvent.click(within(row("Edit")).getByRole("button", { name: "Copy the buyer's edit link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/gang-sheets?edit=s1&product=p1`));
    expect(await within(row("Edit")).findByText("Copied ✓")).toBeInTheDocument();
    unmount();

    render(<GangSheetLineFiles sheet={sheet()} />);
    expect(row("Edit").textContent).toBe("Locked — In review");
  });

  it("a buyer's own finished sheet: its print file is their file, downloaded as it is", () => {
    render(<GangSheetLineFiles sheet={sheet({
      kind: "upload_own", print_file: { url: "/media/artwork/own.png", name: "own.png", signed: false },
    })} />);
    expect(row("Builder").textContent).toBe("Print-ready sheet (uploaded)");
    expect(row("Edit").textContent).toBe("— uploaded as a finished file");
    fireEvent.click(within(row("Print ready file")).getByRole("button", { name: "↓ own.png" }));
    expect(downloads).toEqual([[`${API_BASE_URL}/media/artwork/own.png`, "own.png"]]);
    expect(row("Print ready file").textContent).toContain("the buyer's own file");
  });

  it("Upload by size is named for what it is", () => {
    render(<GangSheetLineFiles sheet={sheet({ kind: "upload_by_size", width_in: 4.21, height_in: 4.21, quantity: 8 })} />);
    expect(row("Builder").textContent).toBe("Upload by size");
    expect(row("Size").textContent).toBe("4.21″ × 4.21″ · ×8");
  });

  it("a sheet not laid out yet says to arrange it, rather than offering a file that isn't there", () => {
    render(<GangSheetLineFiles sheet={sheet({ preview_url: null, print_file: null, needs_layout: true })} />);
    expect(row("Preview").textContent).toBe("Not laid out yet");
    expect(row("Print ready file").textContent).toBe("Arrange it in the sheet editor first");
  });

  it("a design the PNG cannot hold is named, with its original to print from", () => {
    render(<GangSheetLineFiles sheet={sheet({
      left_out: ["logo.ai"], originals: [{ name: "logo.ai", url: "https://ik.imagekit.io/shop/logo.ai" }],
    })} />);
    fireEvent.click(within(row("Not in the PNG")).getByRole("button", { name: "logo.ai" }));
    expect(downloads).toEqual([["https://ik.imagekit.io/shop/logo.ai", "logo.ai"]]);
    expect(row("Not in the PNG").textContent).toContain("print from the original");
  });
});

describe("the order's total, line by line", () => {
  it("on the shop's order page: the discount with its code, and the tax with where and at what rate", async () => {
    render(<AdminOrderDetailPage />);
    const discount = await screen.findByText("Discount (SAVE90 · 90% off)");
    expect(discount.nextElementSibling?.textContent).toBe("−$6.62");
    const tax = screen.getByText("Tax (WY · 6%)");
    expect(tax.nextElementSibling?.textContent).toBe("$0.44");
    // …and under the gang sheet's line, what to print.
    const line = document.querySelector('[data-gang-sheet="GS-SL-2610-0018"]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(within(line).getByText("Has low resolution").nextElementSibling?.textContent).toBe("Yes — blue.png (142 DPI)");
  });

  it("tax is listed at $0.00 too — how much tax has an answer either way", async () => {
    adminOrder = { ...adminOrder, tax_amount: "0.00", tax_label: "Tax", discounts: [] };
    render(<AdminOrderDetailPage />);
    const tax = await screen.findByText("Tax", { selector: "span" });
    expect(tax.nextElementSibling?.textContent).toBe("$0.00");
    expect(screen.queryByText(/^Discount/)).toBeNull();
  });

  it("on the buyer's own order page too", async () => {
    render(<BuyerOrderPage />);
    const discount = await screen.findByText(/Discount \(SAVE90 · 90% off\):/);
    expect(discount.textContent).toContain("−$6.62");
    expect(screen.getByText(/Tax \(WY · 6%\):/).textContent).toContain("$0.44");
  });
});
