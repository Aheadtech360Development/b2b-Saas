/**
 * Importing a products file (components/admin/ProductFileImport, and the
 * Import window that hands it a file from Export or Shopify).
 *
 * The server plans first and saves nothing; the admin sees what each product
 * would become, ticks "Update products that already exist" to change the ones
 * the shop has (Shopify's own rule), and only then imports. On one product's
 * page only that product's rows are read, and it is always an update.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProductFileImportResult } from "@/services/admin.service";

const api = vi.hoisted(() => ({ importProductsFile: vi.fn() }));
vi.mock("@/services/admin.service", () => ({ adminService: api }));
vi.mock("@/services/products.service", () => ({ productsService: { getCategories: () => Promise.resolve([]) } }));

import { ApiClientError } from "@/lib/api-client";
import { ProductFileImport } from "@/components/admin/ProductFileImport";
import { ImportProductsModal } from "@/components/admin/ImportProductsModal";

function result(counts: Partial<ProductFileImportResult["counts"]>, products: Partial<ProductFileImportResult["products"][number]>[],
  extra: Partial<ProductFileImportResult> = {}): ProductFileImportResult {
  return {
    dry_run: true, counts: { create: 0, update: 0, skip: 0, error: 0, ...counts }, problems: [], ignored: 0,
    products: products.map((p) => ({
      handle: "x", name: "X", action: "create", kind: "Stocked", variants_new: 0, variants_changed: 0, images_new: 0,
      notes: [], errors: [], ...p,
    })),
    ...extra,
  };
}

const FILE = new File(["URL handle,Title\nclassic-tee,Classic Tee\n"], "products.csv", { type: "text/csv" });

describe("importing a products file", () => {
  // A new stand-in each test: mockReset() here made a stand-in that rejects fail the test itself (Vitest 4).
  beforeEach(() => { api.importProductsFile = vi.fn(); });

  it("shows what will happen, updates existing products only when ticked, then imports", async () => {
    api.importProductsFile
      .mockResolvedValueOnce(result({ create: 1, skip: 1 }, [
        { handle: "hoodie", name: "Hoodie", action: "create", variants_new: 3, images_new: 2 },
        { handle: "classic-tee", name: "Classic Tee", action: "skip", notes: ["Already in your shop."] },
      ]))
      .mockResolvedValueOnce(result({ create: 1, update: 1 }, [
        { handle: "hoodie", name: "Hoodie", action: "create", variants_new: 3 },
        { handle: "classic-tee", name: "Classic Tee", action: "update", variants_changed: 4 },
      ]))
      .mockResolvedValueOnce(result({ create: 1, update: 1 }, [
        { handle: "hoodie", name: "Hoodie", action: "create" },
        { handle: "classic-tee", name: "Classic Tee", action: "update" },
      ], { dry_run: false }));
    const phases: string[] = [];
    const onImported = vi.fn();
    const onFinish = vi.fn();
    render(<ProductFileImport file={FILE} onBack={vi.fn()} onPhase={(p) => phases.push(p)} onImported={onImported} onFinish={onFinish} />);

    expect(await screen.findByText("1 new")).toBeTruthy();
    expect(api.importProductsFile).toHaveBeenLastCalledWith(FILE, { dryRun: true, updateExisting: false, onlyHandle: undefined });
    expect(screen.getByText("3 new variants, 2 new images")).toBeTruthy();
    expect(screen.getByText("Already in your shop.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 1 product" })).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByText("1 update")).toBeTruthy();
    expect(api.importProductsFile).toHaveBeenLastCalledWith(FILE, { dryRun: true, updateExisting: true, onlyHandle: undefined });
    expect(screen.getByText("4 variants changed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 products" }));
    expect(await screen.findByText("Import finished")).toBeTruthy();
    expect(api.importProductsFile).toHaveBeenLastCalledWith(FILE, { dryRun: false, updateExisting: true, onlyHandle: undefined });
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(["importing", "done"]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("on one product's page reads that product only, and updates it", async () => {
    api.importProductsFile.mockResolvedValue(result({ update: 1 }, [{ handle: "classic-tee", name: "Classic Tee", action: "update" }], { ignored: 2 }));
    render(<ProductFileImport file={FILE} onlyHandle="classic-tee" onBack={vi.fn()} onImported={vi.fn()} onFinish={vi.fn()} />);

    expect(await screen.findByText("2 other products in the file left alone")).toBeTruthy();
    expect(api.importProductsFile).toHaveBeenCalledWith(FILE, { dryRun: true, updateExisting: true, onlyHandle: "classic-tee" });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says why a file cannot be read, and imports nothing", async () => {
    api.importProductsFile.mockImplementation(async () => {
      throw new ApiClientError(422, "ERROR", "This is not a products file: it has no URL handle (or Handle) column.");
    });
    render(<ProductFileImport file={FILE} onBack={vi.fn()} onImported={vi.fn()} onFinish={vi.fn()} />);

    expect(await screen.findByText(/This is not a products file/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nothing to import" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a products row that cannot be imported says why, beside it", async () => {
    api.importProductsFile.mockResolvedValue(result({ error: 1 }, [
      { handle: "polo", name: "Polo", action: "error", errors: ["SKU P-1 is already used by Tee."] },
    ]));
    render(<ProductFileImport file={FILE} onBack={vi.fn()} onImported={vi.fn()} onFinish={vi.fn()} />);

    expect(await screen.findByText("SKU P-1 is already used by Tee.")).toBeTruthy();
    expect(screen.getByText("Not imported")).toBeTruthy();
  });
});

describe("the Import window", () => {
  // A new stand-in each test: mockReset() here made a stand-in that rejects fail the test itself (Vitest 4).
  beforeEach(() => { api.importProductsFile = vi.fn(); });

  function choose(text: string) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([text], "file.csv", { type: "text/csv" })] } });
  }

  it("hands a file from Export or Shopify to the server instead of the template steps", async () => {
    api.importProductsFile.mockResolvedValue(result({ create: 1 }, [{ handle: "tee", name: "Tee", action: "create" }]));
    render(<ImportProductsModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    choose("﻿Handle,Title,Variant SKU\ntee,Tee,T-1\n");

    await waitFor(() => expect(api.importProductsFile).toHaveBeenCalled());
    expect(document.querySelector("[data-product-file-import]")).toBeTruthy();
    expect(screen.queryByText(/products ready to import/)).toBeNull();
  });

  it("on one product's page refuses a template file and says what to use", async () => {
    render(<ImportProductsModal onClose={vi.fn()} onSuccess={vi.fn()} onlyHandle="classic-tee" />);
    expect(screen.queryByText("Download CSV Template")).toBeNull();
    choose("name,slug,colors\nTee,tee,Black\n");

    expect(await screen.findByText(/That is not a products file/)).toBeTruthy();
    expect(api.importProductsFile).not.toHaveBeenCalled();
  });
});
