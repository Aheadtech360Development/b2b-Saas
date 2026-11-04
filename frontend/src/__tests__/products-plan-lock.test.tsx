/**
 * Products tabs a shop's plan does not include (components/admin/UpgradeNotice).
 *
 * A Retail shop has no Gang Sheet Builder and no supplier catalogues. Its Gang
 * sheet setup tab opened empty and Suppliers showed the API's refusal; both
 * now say which plan includes them, in the lock box the Customers tabs that
 * need Wholesale use. A feature the platform switched off names no plan.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...real, apiClient: { ...real.apiClient, get } };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/gang-sheets",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn().mockResolvedValue(true) }));
vi.mock("@/components/admin/GangSheetProductEditor", () => ({ GangSheetProductEditor: () => null }));
vi.mock("@/components/admin/suppliers/SupplierOverview", () => ({ SupplierOverview: () => <p>Supplier list</p> }));
// Every call stays pending: these tests are about what replaces the screen.
vi.mock("@/services/gangSheets.service", () => ({
  gangSheetsService: new Proxy({}, { get: () => () => new Promise(() => {}) }),
}));

import { EntitlementsProvider } from "@/lib/entitlements";
import { UpgradeNotice } from "@/components/admin/UpgradeNotice";
import { SuppliersManager } from "@/components/admin/suppliers/SuppliersManager";
import AdminGangSheetsPage from "@/app/(admin)/admin/gang-sheets/page";

const lock = (feature: string, label: string, upgrade_to: string | null) => ({
  feature, label, group: "", upgrade_to, upgrade_key: upgrade_to?.toLowerCase() ?? null,
});
const RETAIL = [
  lock("gang_sheet", "Gang Sheet Builder", "Starter"),
  lock("supplier_catalog", "Supplier catalogue import", "Starter"),
];

function shop(locked: ReturnType<typeof lock>[]) {
  get.mockImplementation((url: string) => url === "/api/v1/admin/entitlements"
    ? Promise.resolve({ features: ["orders", "products"], plan: { key: "retail", name: "Retail", price_display: "$79" }, locked })
    : new Promise(() => {}));
}

/** Once the shop's plan has loaded. */
async function loaded() {
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/admin/entitlements"));
  await act(async () => { await Promise.resolve(); });
}

const sheet = (
  <EntitlementsProvider>
    <UpgradeNotice feature="gang_sheet" blurb="Sheets in the builder."><p>Sheet sizes</p></UpgradeNotice>
  </EntitlementsProvider>
);

afterEach(() => { get.mockReset(); });

describe("UpgradeNotice", () => {
  it("names the plan that includes a locked screen, and the way to upgrade", async () => {
    shop(RETAIL);
    render(sheet);
    expect(await screen.findByText("Included from the Starter plan")).toBeTruthy();
    expect(screen.getByText("Sheets in the builder. Upgrade to turn this on.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/admin/billing");
    expect(screen.queryByText("Sheet sizes")).toBeNull();
  });

  it("names no plan for a feature the platform switched off", async () => {
    shop([lock("gang_sheet", "Gang Sheet Builder", null)]);
    render(sheet);
    expect(await screen.findByText("Gang Sheet Builder is switched off for your shop")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });

  it("shows the screen itself when the plan includes it", async () => {
    shop([]);
    render(sheet);
    await loaded();
    expect(screen.getByText("Sheet sizes")).toBeTruthy();
    expect(screen.queryByText(/Included from/)).toBeNull();
  });
});

describe("Products tabs on a Retail shop", () => {
  it("Gang sheet setup says Starter includes it instead of opening empty", async () => {
    shop(RETAIL);
    const { container } = render(<EntitlementsProvider><AdminGangSheetsPage /></EntitlementsProvider>);
    expect(await screen.findByText("Included from the Starter plan")).toBeTruthy();
    expect(container.querySelector("[data-gang-sheets]")).toBeNull();
    expect(container.querySelector('[data-products-frame="gang-sheets"]')).toBeTruthy();
  });

  it("Suppliers says Starter includes it, and offers no manual supplier", async () => {
    shop(RETAIL);
    render(<EntitlementsProvider><SuppliersManager /></EntitlementsProvider>);
    expect(await screen.findByText("Included from the Starter plan")).toBeTruthy();
    expect(screen.getByText(/S&S Activewear and SanMar/)).toBeTruthy();
    expect(screen.queryByText("Supplier list")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add manual supplier" })).toBeNull();
  });

  it("a shop whose plan has them still gets both screens", async () => {
    shop([]);
    const { container } = render(
      <EntitlementsProvider><SuppliersManager /><AdminGangSheetsPage /></EntitlementsProvider>,
    );
    await loaded();
    expect(screen.getByText("Supplier list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Add manual supplier" })).toBeTruthy();
    expect(container.querySelector("[data-gang-sheets]")).toBeTruthy();
    expect(screen.queryByText(/Included from/)).toBeNull();
  });
});
