/**
 * Products → Inventory sync (components/admin/inventory-sync): connecting
 * AdvancePro, choosing where its stock goes, syncing and reading what it did.
 * The server is pretended (services/inventorySync.service mocked).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  overview: vi.fn(), warehouses: vi.fn(), save: vi.fn(), run: vi.fn(), job: vi.fn(),
  test: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
}));
vi.mock("@/services/inventorySync.service", () => ({ inventorySyncService: api }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(async () => true), tell: vi.fn(async () => undefined) }));

import { InventorySync, everyLabel } from "@/components/admin/inventory-sync/InventorySync";

const LOCATIONS = [
  { id: "loc-main", name: "Main store", code: "MAIN", is_active: true },
  { id: "loc-pop", name: "Pop-up", code: "POP", is_active: true },
];

function config(over = {}) {
  return {
    active: false, every_minutes: 30, locations: {}, safety_stock: 0, count_stock: true, missing: "keep",
    last_run_at: null, last_sync_at: null, history: [], ...over,
  };
}

function overview(connected: boolean, cfg = config(), job: unknown = null) {
  return {
    connectors: [{
      key: "advancepro", label: "AdvancePro", by: "AdvanceWare", available: true,
      connection: connected ? { connected: true, username: "api@brand", password_set: true, password_hint: "••••1234" } : { connected: false },
      config: cfg, job,
    }],
    locations: LOCATIONS, every_minutes: [15, 30, 60, 180, 360, 720, 1440],
  };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.warehouses.mockResolvedValue({ warehouses: [{ id: "10", name: "Main warehouse", active: true }, { id: "20", name: "East", active: false }] });
});
afterEach(() => { document.body.innerHTML = ""; });

describe("Inventory sync with AdvancePro", () => {
  it("asks for the login first, and connects with it", async () => {
    api.overview.mockResolvedValueOnce(overview(false)).mockResolvedValueOnce(overview(true));
    api.connect.mockResolvedValue({ verified: true, message: "Connected to AdvancePro: 2 warehouses found." });
    render(<InventorySync />);
    expect(await screen.findByText("Connect AdvancePro")).toBeTruthy();
    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("API username"), { target: { value: " api@brand " } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "pw" } });
    fireEvent.click(connect);
    await waitFor(() => expect(api.connect).toHaveBeenCalledWith("advancepro", { username: "api@brand", password: "pw", api_url: "" }));
    expect(await screen.findByText(/Signed in as/)).toBeTruthy();
    expect(screen.queryByText("Not connected")).toBeNull();
  });

  it("sends each store location's choice, and the rest of the setup, on save", async () => {
    api.overview.mockResolvedValue(overview(true));
    api.save.mockImplementation(async (_key: string, body: object) => ({ config: config(body) }));
    render(<InventorySync />);
    const main = await screen.findByLabelText("Stock for Main store") as HTMLSelectElement;
    await waitFor(() => expect(main.querySelectorAll("option").length).toBe(4));
    expect(Array.from(main.options).map((o) => o.textContent)).toEqual([
      "Not synced", "Every AdvancePro warehouse, added up", "Main warehouse", "East (inactive)",
    ]);
    fireEvent.change(main, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("switch", { name: "Sync automatically" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const [, body] = api.save.mock.calls[0]!;
    expect(body.locations).toEqual({ "loc-main": "10", "loc-pop": "none" });
    expect(body.every_minutes).toBe(15);
    expect(body.active).toBe(true);
    expect(body.count_stock).toBe(true);
    expect(body.missing).toBe("keep");
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("syncs now, follows the run, and shows what it did", async () => {
    const summary = { matched: 40, updated: 3, created: 2, unchanged: 35, not_in_shop: 2, not_in_shop_sample: ["AP-1", "AP-2"],
      not_in_advancepro: 1, not_in_advancepro_sample: ["TEE-XS"] };
    api.overview.mockResolvedValue(overview(true, config({ locations: { "loc-main": "all" } })));
    api.run.mockResolvedValue({ job: { status: "running", message: "Reading AdvancePro's products…", done: 0, total: 3, started_at: "x", trigger: "manual" } });
    render(<InventorySync />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText(/Reading AdvancePro's products/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Syncing/ })).toBeTruthy();

    // The run ends: its summary is shown, and the SKUs behind each count open.
    cleanupAndRender(overview(true, config({ locations: { "loc-main": "all" } }),
      { status: "completed", message: "40 of your SKUs matched AdvancePro.", done: 3, total: 3, started_at: "x", trigger: "manual", summary }));
    expect(await screen.findByText("40 matched")).toBeTruthy();
    expect(screen.getByText("5 changed")).toBeTruthy();
    fireEvent.click(screen.getByText("2 AdvancePro SKUs not in your shop"));
    expect(screen.getByText(/AP-1/)).toBeTruthy();
  });

  it("will not sync before the stock has somewhere to go", async () => {
    api.overview.mockResolvedValue(overview(true));
    render(<InventorySync />);
    const button = await screen.findByRole("button", { name: "Sync now" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Choose where the stock goes, and save, first/)).toBeTruthy();
  });

  it("names how often in plain words", () => {
    expect([15, 60, 180, 1440].map(everyLabel)).toEqual(["15 minutes", "hour", "3 hours", "day"]);
  });
});

function cleanupAndRender(o: ReturnType<typeof overview>) {
  document.body.innerHTML = "";
  api.overview.mockResolvedValue(o);
  render(<InventorySync />);
}
