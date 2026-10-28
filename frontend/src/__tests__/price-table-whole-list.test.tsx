/**
 * A yard sign that took two supplier files spelt differently: 74,400
 * combinations of its choices, 11,904 rows in the file. The price table said
 * the amounts on each choice "still price every one of them correctly", which
 * was not true, and the import had no way to make the product match the file.
 *
 * The table now says how many have a saved price, which choices none names,
 * and what a buyer gets for the rest; the import shows what the file leaves
 * out and imports it as the whole price list when asked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() as (url: string, body: Record<string, unknown>) => Promise<unknown> },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (url: string) => api.get(url), post: (url: string, body: never) => api.post(url, body), put: vi.fn() },
}));

import { CombinationPricing } from "@/components/admin/CombinationPricing";
import { PriceGridImport } from "@/components/admin/PriceGridImport";

const BIG = {
  matrix_options: [
    { id: "q", name: "Qty", values: Array.from({ length: 31 }, (_, i) => ({ id: `q${i}`, label: String(i + 1) })) },
    { id: "s", name: "Size", values: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, label: `S${i}` })) },
  ],
  all_options: [], total: 74_400, offset: 0, limit: 50, max_matrix: 50_000, too_large: true,
  combinations: [], priced_count: 11_904, quantity_option_id: "q", line_priced: true,
  unpriced_choices: [{ option: "Size", choices: ["24x24", "12x8"], count: 8 }],
};

describe("the price table of a product bigger than its file", () => {
  afterEach(() => vi.mocked(api.get).mockReset());

  it("says how many have a price, which choices none names, and what the rest are", async () => {
    vi.mocked(api.get).mockResolvedValue(BIG);
    render(<CombinationPricing productId="sign" />);
    await screen.findByText("74,400 combinations: too many to list here");
    const note = document.querySelector("[data-too-large]")!;
    expect(note.textContent).toContain("11,904 of them have a saved price.");
    expect(note.querySelector("[data-unpriced]")!.textContent).toContain("Size: 24x24, 12x8 and 6 more");
    expect(note.textContent).toContain("A combination without a saved price cannot be ordered.");
    expect(note.textContent).toContain("This file is the whole price list");
    expect(note.textContent).not.toContain("still price every one of them correctly");
  });

  it("keeps the rule for a table that does not price whole lines", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...BIG, line_priced: false, quantity_option_id: null, unpriced_choices: [] });
    render(<CombinationPricing productId="sign" />);
    await screen.findByText("74,400 combinations: too many to list here");
    expect(document.querySelector("[data-too-large]")!.textContent)
      .toContain("A combination without a saved price is priced by rule");
  });
});

describe("importing a file that leaves some of the product out", () => {
  afterEach(() => { vi.mocked(api.post).mockReset(); vi.mocked(api.get).mockReset(); });

  function chooseFile() {
    const file = new File(["Qty,Size,Price\n1,A,2\n"], "signs.csv", { type: "text/csv" });
    if (!file.text) Object.defineProperty(file, "text", { value: () => Promise.resolve("Qty,Size,Price\n1,A,2\n") });
    fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [file] } });
  }

  it("waits for a big file that is written after the request answers", async () => {
    let asks = 0;
    const result = { prices_saved: 11_904, not_available: 0, questions_created: 0, choices_created: 0, rules_added: 0,
                     removed: 0, message: "11,904 prices imported." };
    vi.mocked(api.post).mockImplementation((url) =>
      Promise.resolve(url.endsWith("/preview") ? PREVIEW : { state: "running", rows: 11_904 }));
    vi.mocked(api.get).mockImplementation(() => Promise.resolve(++asks < 2 ? { state: "running" } : { state: "done", result }));
    const onImported = vi.fn();
    render(<PriceGridImport productId="sign" onClose={() => {}} onImported={onImported} />);
    chooseFile();
    await waitFor(() => expect(document.querySelector("[data-unlisted]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Import 11,904 prices" }));
    expect(await screen.findByRole("status")).toBeTruthy();         // "Writing the prices…"
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(result), { timeout: 8000 });
    expect(asks).toBe(2);
  }, 15_000);

  const PREVIEW = {
    columns: [{ name: "Qty", role: "quantity", values: 31 }, { name: "Size", role: "question", values: 8 },
              { name: "Price", role: "price", values: 900 }],
    price_column: "Price", quantity_column: "Qty",
    questions: [], new_questions: [], new_choices: 0, rows: 11_904, priced: 11_904, not_available: 0, blank: 0,
    errors: [], error_count: 0, rules: [], switched_off: [], warnings: [],
    unlisted: [{ question: "Size", choices: ["24x24", "12x8"], count: 8 }, { question: "Stakes", choices: ["Add Stakes"], count: 1 }],
    unlisted_count: 9, removes: 2_688,
  };

  it("names what the file does not list, and imports it as the whole list when ticked", async () => {
    vi.mocked(api.post).mockImplementation((url) => Promise.resolve(url.endsWith("/preview") ? PREVIEW
      : { prices_saved: 11_904, not_available: 0, questions_created: 0, choices_created: 0, rules_added: 0, removed: 2_688, message: "ok" }));
    const onImported = vi.fn();
    render(<PriceGridImport productId="sign" onClose={() => {}} onImported={onImported} />);
    const file = new File(["Qty,Size,Price\n1,A,2\n"], "signs.csv", { type: "text/csv" });
    if (!file.text) Object.defineProperty(file, "text", { value: () => Promise.resolve("Qty,Size,Price\n1,A,2\n") });
    fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [file] } });

    const note = await waitFor(() => {
      const el = document.querySelector("[data-unlisted]");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(note.textContent).toContain("This product has 9 choices the file does not list:");
    expect(note.textContent).toContain("Size: 24x24, 12x8 and 6 more");
    expect(note.textContent).toContain("2,688 saved prices are not in the file.");
    expect(screen.getByText(/Removes the 2,688 saved prices and switches off the 9 choices it does not list/)).toBeTruthy();

    fireEvent.click(document.querySelector("[data-whole-list]")!);
    fireEvent.click(screen.getByRole("button", { name: "Import 11,904 prices" }));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    const sent = vi.mocked(api.post).mock.calls.find(([url]) => url.endsWith("/import"))![1];
    expect(sent).toMatchObject({ replace: true });
  });
});
