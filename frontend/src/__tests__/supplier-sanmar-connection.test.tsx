/**
 * Edit Supplier for SanMar beside S&S (components/admin/suppliers/words.ts).
 *
 * The connection form was S&S's alone: account number, API key, country, sent
 * to the S&S record. SanMar is reached with an FTP username and password,
 * gives one stock figure for all its warehouses, and takes no orders yet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { svc } = vi.hoisted(() => ({
  svc: {
    connection: vi.fn(), saveConnection: vi.fn(), testConnection: vi.fn(), disconnect: vi.fn(),
    locations: vi.fn(), update: vi.fn(),
  },
}));
vi.mock("@/services/suppliers.service", () => ({ suppliersService: svc }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn().mockResolvedValue(true) }));
vi.mock("@/components/admin/suppliers/ProductSettings", () => ({ ProductSettings: () => null }));
vi.mock("@/components/admin/suppliers/SyncSettings", () => ({ SyncSettings: () => null }));
vi.mock("@/components/admin/suppliers/OrderSettings", () => ({ OrderSettings: () => <p>S&S order settings</p> }));

import { EditSupplier } from "@/components/admin/suppliers/EditSupplier";
import type { SupplierDetail } from "@/services/suppliers.service";

function detail(id: string, label: string, connected = false): SupplierDetail {
  return {
    id, label,
    config: {
      name: label, inventory: { sync: true, safety_stock: 0, locations: {} },
      product: { status: "active", images: "all", fields: [] }, pricing: { rules: [], round_to: null },
      automatic_sync: {}, orders: {}, history: [], last_sync_at: null,
    },
    connection: { connected, account: null, country: "US" },
    meta: { sources: [], targets: [], default_fields: [], shipping_methods: [] },
  } as unknown as SupplierDetail;
}

function open(id: string, label: string, connected = false) {
  svc.connection.mockResolvedValue({ providers: [] });
  svc.locations.mockResolvedValue({
    locations: [{ id: "loc-1", name: "Main", code: "WH-1", city: "" }],
    warehouses: id === "sanmar" ? [] : [{ code: "KS", label: "Kansas (KS)" }],
    combined: id === "sanmar",
  });
  svc.saveConnection.mockResolvedValue({ message: "Connected.", verified: true });
  svc.testConnection.mockResolvedValue({ ok: true, message: "Connected to SanMar. Product file updated Nov 3." });
  return render(<EditSupplier id={id} detail={detail(id, label, connected)} running={false}
    onSaved={vi.fn()} onJobStarted={vi.fn()} onConnectionChanged={vi.fn()} />);
}

describe("connecting SanMar", () => {
  afterEach(() => vi.clearAllMocks());

  it("asks for SanMar's FTP login, with no country and no order settings", async () => {
    open("sanmar", "SanMar");
    await screen.findByText("SanMar Connection Credentials");
    expect(screen.getByText("FTP Username")).toBeTruthy();
    expect(screen.getByText("Password")).toBeTruthy();
    expect(screen.queryByText("Country")).toBeNull();
    expect(screen.queryByText("API Key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Order Settings" })).toBeNull();
    expect(screen.getByText(/sanmarintegrations@sanmar\.com/)).toBeTruthy();
  });

  it("tests and saves the login on SanMar's own record", async () => {
    const { container } = open("sanmar", "SanMar");
    await screen.findByText("SanMar Connection Credentials");
    const [name, user] = Array.from(container.querySelectorAll<HTMLInputElement>('input:not([type="password"])'));
    expect(name!.value).toBe("SanMar");
    fireEvent.change(user!, { target: { value: "189999" } });
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="password"]')!, { target: { value: "secret" } });

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(svc.testConnection).toHaveBeenCalledWith("sanmar", { ftp_username: "189999", ftp_password: "secret" }));
    expect(await screen.findByText(/Connected to SanMar/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save Supplier" }));
    await waitFor(() => expect(svc.saveConnection).toHaveBeenCalledWith("sanmar", { ftp_username: "189999", ftp_password: "secret" }));
  });

  it("feeds a store location SanMar's one stock figure, or nothing", async () => {
    open("sanmar", "SanMar", true);
    await screen.findByText(/SanMar gives one figure for all its warehouses together/);
    const select = screen.getByRole("combobox");
    expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Don't import stock here", "Supplier inventory: All SanMar warehouses"]);
    expect((select as HTMLSelectElement).value).toBe("all_except_ds");
  });
});

describe("S&S as it was", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps the account number, API key, country and order settings", async () => {
    const { container } = open("ss_activewear", "S&S Activewear");
    await screen.findByText("S&S Activewear Connection Credentials");
    expect(screen.getByText("API Key")).toBeTruthy();
    expect(screen.getByText("Country")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Order Settings" })).toBeTruthy();

    const [, user] = Array.from(container.querySelectorAll<HTMLInputElement>('input:not([type="password"])'));
    fireEvent.change(user!, { target: { value: "12345" } });
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="password"]')!, { target: { value: "key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Supplier" }));
    await waitFor(() => expect(svc.saveConnection).toHaveBeenCalledWith(
      "ss_activewear", { account_number: "12345", api_key: "key", country: "United States" }));
  });

  it("still lists S&S warehouses for stock", async () => {
    open("ss_activewear", "S&S Activewear", true);
    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Supplier inventory: Kansas (KS)");
    expect(options).toContain("Supplier inventory: All except Dropshipping");
  });
});
