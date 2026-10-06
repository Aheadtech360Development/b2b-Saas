/**
 * The gang sheet builder's basics, on the real component.
 *
 * What a buyer reported: on a 22×10 sheet they asked for twenty-three more
 * copies of a design, and instead of being told it would not fit — or offered
 * the next size — the builder piled the extra ones in the corner. Rotate only
 * ever flipped between upright and one side. These hold both, and the pieces
 * around them: the question that is asked, each answer to it, the corner
 * handles, and copies arriving one after another.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { GangSheetOrder, GangSheetSize } from "@/services/gangSheets.service";

// The whole builder is mounted for each of these. Alone that takes a second or
// two; beside the rest of the suite it can pass the default five.
vi.setConfig({ testTimeout: 30_000 });

const said: [string, string][] = [];
vi.mock("@/lib/toast", () => ({
  say: new Proxy({}, { get: (_t, kind: string) => (msg: string) => { said.push([kind, msg]); } }),
}));
vi.mock("react-toastify", () => ({ ToastContainer: () => null }));
vi.mock("@/services/gangSheets.service", () => ({
  gangSheetsService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: { isAuthenticated: () => boolean }) => unknown) => pick({ isAuthenticated: () => false }),
}));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/services/auth.service", () => ({ authService: {} }));
vi.mock("@/lib/session", () => ({ establishSession: vi.fn() }));
vi.mock("@/components/storefront/ImageEditorModal", () => ({ ImageEditorModal: () => null }));
vi.mock("@/components/storefront/AutoBuildPanel", () => ({ AutoBuildPanel: () => null }));
vi.mock("@/components/storefront/WorkingOverlay", () => ({ WorkingOverlay: () => null }));

import { GangSheetStudio } from "@/components/storefront/GangSheetStudio";

const size = (id: string, height: number, price: number): GangSheetSize => ({
  id, name: `22×${height}`, width_in: 22, height_in: height, price_per_sheet: price, bleed_in: 0.25, spacing_in: 0.5,
  is_active: true, sort_order: 0, pricing_mode: "fixed", price_per_inch: 0, min_length_in: 0, max_length_in: 0, max_upload_mb: null,
});
const SIZES = [size("s10", 10, 7.98), size("s24", 24, 15)];

/** One 2.67 inch design in the top-left of a 22×10 sheet, as in the report. */
const ORDER = {
  id: "o1", reference: "GS-1", status: "submitted", sheet_name: "Gang Sheet 1", sheet_width_in: 22, sheet_height_in: 10,
  price_per_sheet: 7.98, sheet_quantity: 1, subtotal: 7.98, customer_notes: null, supplier_notes: null, revision_count: 0,
  contact_email: null, contact_name: null, product_id: null, sheet_size_id: "s10", created_at: null, updated_at: null,
  artworks: [{ id: "a1", file_url: "https://shop.test/tee.png", file_name: "tee.png", file_type: "png", width_in: 2.67, height_in: 2.67, quantity: 1 }],
  layout: [{ artwork_id: "a1", x_in: 0.25, y_in: 0.25, rotation: 0, w_in: 2.67, h_in: 2.67 }],
} as GangSheetOrder;

const PPI = 3;          // what the builder settles on when the window has no size, as here
const designs = () => [...document.querySelectorAll<HTMLElement>("[data-design]")];
const inches = (el: HTMLElement) => ({
  x: parseFloat(el.style.left) / PPI, y: parseFloat(el.style.top) / PPI,
  w: parseFloat(el.style.width) / PPI, h: parseFloat(el.style.height) / PPI,
});
type Rect = ReturnType<typeof inches>;
const overlapping = (boxes: Rect[]) => boxes.some((a, i) => boxes.some((b, j) => j > i &&
  !(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6)));
const outside = (boxes: Rect[], length: number) => boxes.some((b) =>
  b.x < 0.25 - 1e-6 || b.y < 0.25 - 1e-6 || b.x + b.w > 22 - 0.25 + 1e-6 || b.y + b.h > length - 0.25 + 1e-6);

function open(order: GangSheetOrder = ORDER) {
  render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={order} onClose={() => {}} onSaved={() => {}} />);
  expect(designs()).toHaveLength(order.layout!.length);
}
function select(el: HTMLElement = designs()[0]!) {
  fireEvent.pointerDown(el, { clientX: 5, clientY: 5 });
  fireEvent.pointerUp(window);
}
function askForCopies(n: number) {
  const field = screen.getByText("Add copies of this design").parentElement!.querySelector("input")!;
  fireEvent.change(field, { target: { value: String(n) } });
  fireEvent.click(screen.getByRole("button", { name: /Add copies/ }));
}
const question = () => screen.queryByRole("dialog", { name: "Not enough room on this sheet" });
const choose = (key: string) => fireEvent.click(question()!.querySelector<HTMLElement>(`[data-choice="${key}"]`)!);

beforeEach(() => { said.length = 0; });

describe("asking for more copies than the sheet has room for", () => {
  it("asks what to do instead of piling them up, and places nothing until it is answered", () => {
    open();
    select();
    askForCopies(23);

    const ask = question();
    expect(ask).not.toBeNull();
    expect(ask).toHaveTextContent("Only 17 of the 23 copies fit on this 22×10″ sheet.");
    expect(designs()).toHaveLength(1);

    const labels = [...ask!.querySelectorAll("[data-choice]")].map((b) => [b.getAttribute("data-choice"), b.querySelector("span")!.textContent]);
    expect(labels).toEqual([
      ["bigger", "Switch this sheet to 22×24″"],
      ["spill", "Put the other 6 on a new sheet"],
      ["fit", "Add only the 17 that fit"],
    ]);
    // What each one costs is said before it is chosen.
    expect(ask).toHaveTextContent("$15.00 a sheet instead of $7.98");
    expect(ask).toHaveTextContent("Adds $7.98");
  });

  it("the bigger size takes all of them, and nothing already on the sheet moves", () => {
    open();
    const before = inches(designs()[0]!);
    select();
    askForCopies(23);
    choose("bigger");

    expect(question()).toBeNull();
    expect(designs()).toHaveLength(24);
    const sizeMenu = document.querySelector('option[value="s24"]')!.parentElement as HTMLSelectElement;
    expect(sizeMenu.value).toBe("s24");
    const boxes = designs().map(inches);
    expect(boxes[0]).toEqual(before);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 24)).toBe(false);
  });

  it("or the rest go on a new sheet of the same size", () => {
    open();
    select();
    askForCopies(23);
    choose("spill");

    expect(designs()).toHaveLength(18);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    expect(screen.getByText(/\(2\) Active Gang Sheets/)).toBeInTheDocument();
    expect(screen.getByText(/6 images/)).toBeInTheDocument();
    expect(said.at(-1)).toEqual(["done", "17 added here, 6 on a new sheet — see the list on the right."]);
  });

  it("or only the ones that fit are added", () => {
    open();
    select();
    askForCopies(23);
    choose("fit");

    expect(designs()).toHaveLength(18);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    // Three even rows of six: the same gap down the sheet as across it.
    expect([...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b)).toEqual([0.25, 3.42, 6.59]);
    expect([...new Set(boxes.map((b) => b.x))].sort((a, b) => a - b)).toEqual([0.25, 3.42, 6.59, 9.76, 12.93, 16.1]);
  });

  it("and Cancel leaves the sheet exactly as it was", () => {
    open();
    select();
    askForCopies(23);
    fireEvent.click(within(question()!).getByRole("button", { name: "Cancel" }));
    expect(question()).toBeNull();
    expect(designs()).toHaveLength(1);
  });

  it("copies that do fit are simply added — in the safe area, not on each other", () => {
    open();
    select();
    askForCopies(5);
    expect(question()).toBeNull();
    expect(designs()).toHaveLength(6);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
  });

  it("Duplicate on a full sheet asks the same question rather than stacking", () => {
    open();
    select();
    askForCopies(17);
    expect(designs()).toHaveLength(18);

    fireEvent.click(screen.getAllByRole("button", { name: /Duplicate/ }).find((b) => b.textContent?.includes("Duplicate"))!);
    expect(question()).toHaveTextContent("There is no room for another copy on this 22×10″ sheet.");
    expect(designs()).toHaveLength(18);
  });
});

describe("copies arriving", () => {
  it("come in one after another, each a little later than the last", () => {
    open();
    select();
    askForCopies(5);
    const added = designs().slice(1);
    expect(added.every((el) => el.classList.contains("gs-pop"))).toBe(true);
    const delays = added.map((el) => parseFloat(el.style.animationDelay));
    expect(delays[0]).toBe(0);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(5);
    // The design that was already there does not jump.
    expect(designs()[0]!.classList.contains("gs-pop")).toBe(false);
  });
});

describe("rotating a design", () => {
  it("goes all the way round, a quarter turn at a time", () => {
    open();
    select();
    const turned: string[] = [];
    for (let i = 0; i < 5; i++) {
      fireEvent.click(document.querySelector<HTMLElement>("[data-turn]")!);
      turned.push(designs()[0]!.dataset.rotation!);
    }
    expect(turned).toEqual(["90", "180", "270", "0", "90"]);
  });

  it("draws it turned that far", () => {
    open();
    select();
    fireEvent.click(document.querySelector<HTMLElement>("[data-turn]")!);
    fireEvent.click(document.querySelector<HTMLElement>("[data-turn]")!);
    expect(designs()[0]!.querySelector("img")!.style.transform).toBe("rotate(180deg)");
  });

  it("swaps a design's width and height on its side, and gives them back upside down", () => {
    const wide = { ...ORDER, layout: [{ artwork_id: "a1", x_in: 0.25, y_in: 0.25, rotation: 0, w_in: 6, h_in: 2 }] } as GangSheetOrder;
    open(wide);
    select();
    const shape = () => { const b = inches(designs()[0]!); return [b.w, b.h]; };
    expect(shape()).toEqual([6, 2]);
    fireEvent.click(document.querySelector<HTMLElement>("[data-turn]")!);
    expect(shape()).toEqual([2, 6]);
    fireEvent.click(document.querySelector<HTMLElement>("[data-turn]")!);
    expect(shape()).toEqual([6, 2]);
    expect(designs()[0]!.dataset.rotation).toBe("180");
  });
});

describe("auto nest", () => {
  /** Five designs of different shapes, one of them turned upside down. */
  const MIXED = {
    ...ORDER,
    layout: [
      { artwork_id: "a1", x_in: 0.25, y_in: 0.25, rotation: 180, w_in: 4, h_in: 3 },
      { artwork_id: "a1", x_in: 8, y_in: 0.25, rotation: 0, w_in: 2, h_in: 6 },
      { artwork_id: "a1", x_in: 12, y_in: 0.25, rotation: 0, w_in: 5, h_in: 2 },
      { artwork_id: "a1", x_in: 0.25, y_in: 5, rotation: 0, w_in: 3, h_in: 3 },
      { artwork_id: "a1", x_in: 12, y_in: 4, rotation: 0, w_in: 6, h_in: 2 },
    ],
  } as GangSheetOrder;

  it("shows what the two arrangements are, drawn side by side", () => {
    open(MIXED);
    expect(document.querySelector("[data-nest-help]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What is the difference between the two?" }));
    const help = document.querySelector<HTMLElement>("[data-nest-help]")!;
    expect(within(help).getByText("Standard")).toBeInTheDocument();
    expect(within(help).getByText("For cutting")).toBeInTheDocument();
  });

  it("for cutting lays the designs in rows a cut can run between, and shows it before it happens", () => {
    open(MIXED);
    const before = designs().map(inches);
    fireEvent.click(screen.getByRole("button", { name: /Auto nest for cutting/ }));

    const preview = screen.getByRole("dialog", { name: "Auto Nest for cutting" });
    expect(designs().map(inches)).toEqual(before);            // nothing has moved yet
    fireEvent.click(within(preview).getByRole("button", { name: "Apply arrangement" }));

    const boxes = designs().map(inches);
    expect(boxes).toHaveLength(5);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    const tops = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1);
    for (let i = 0; i + 1 < tops.length; i++) {
      const bottom = Math.max(...boxes.filter((b) => b.y === tops[i]).map((b) => b.y + b.h));
      expect(bottom + 0.5).toBeLessThanOrEqual(tops[i + 1]! + 1e-6);
    }
  });

  it("leaves a design that was turned upside down upside down", () => {
    open(MIXED);
    fireEvent.click(screen.getByRole("button", { name: /Auto nest \(tidy up\)/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Auto Nest" })).getByRole("button", { name: "Apply arrangement" }));
    const turns = designs().map((el) => Number(el.dataset.rotation));
    expect(turns.filter((t) => t >= 180)).toHaveLength(1);
    expect(overlapping(designs().map(inches))).toBe(false);
  });
});

describe("copies asked for by number come out nested", () => {
  /** The same design, dropped in the middle of the sheet. */
  const MIDDLE = { ...ORDER, layout: [{ artwork_id: "a1", x_in: 9, y_in: 4, rotation: 0, w_in: 2.67, h_in: 2.67 }] } as GangSheetOrder;

  it("in rows from the top-left corner, the design itself included — and Auto Nest then has nothing to move", () => {
    open(MIDDLE);
    select();
    askForCopies(12);
    expect(question()).toBeNull();
    const boxes = designs().map(inches);
    expect(boxes).toHaveLength(13);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    // Six to a row with the half-inch margin, the rows straight under each other.
    const rows = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
    expect(rows).toEqual([0.25, 3.42, 6.59]);
    expect(rows.map((y) => boxes.filter((b) => b.y === y).length)).toEqual([6, 6, 1]);

    const before = designs().map(inches);
    fireEvent.click(screen.getByRole("button", { name: /Auto nest \(tidy up\)/ }));
    expect(screen.queryByRole("dialog", { name: "Auto Nest" })).toBeNull();
    expect(said.at(-1)).toEqual(["done", "Already nested — nothing needed to move."]);
    expect(designs().map(inches)).toEqual(before);
  });

  it("one more copy of a design alone on the sheet is nested too", () => {
    open(MIDDLE);
    select();
    askForCopies(1);
    expect(designs().map(inches).map((b) => [b.x, b.y])).toEqual([[0.25, 0.25], [3.42, 0.25]]);
  });
});

describe("the selected design's handles", () => {
  it("has a dot at each corner and a turn handle", () => {
    open();
    expect(document.querySelectorAll("[data-corner]")).toHaveLength(0);
    select();
    expect([...document.querySelectorAll("[data-corner]")].map((d) => d.getAttribute("data-corner"))).toEqual(["nw", "ne", "sw", "se"]);
    expect(document.querySelector("[data-turn]")).not.toBeNull();
  });

  it("resizes from the corner that is dragged, keeping the opposite corner where it is", () => {
    open();
    select();
    const before = inches(designs()[0]!);

    // Top-left corner dragged one inch in and down: the design shrinks towards its bottom-right.
    fireEvent.pointerDown(document.querySelector<HTMLElement>('[data-corner="nw"]')!, { clientX: 100, clientY: 100 });
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + PPI, clientY: 100 + PPI })); });
    act(() => { window.dispatchEvent(new MouseEvent("pointerup")); });

    const after = inches(designs()[0]!);
    expect(after.w).toBeCloseTo(1.67, 2);
    expect(after.h).toBeCloseTo(1.67, 2);
    expect(after.x + after.w).toBeCloseTo(before.x + before.w, 2);
    expect(after.y + after.h).toBeCloseTo(before.y + before.h, 2);

    // Bottom-right dragged back out: it grows from where its top-left now is.
    fireEvent.pointerDown(document.querySelector<HTMLElement>('[data-corner="se"]')!, { clientX: 200, clientY: 200 });
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 200 + PPI, clientY: 200 + PPI })); });
    act(() => { window.dispatchEvent(new MouseEvent("pointerup")); });

    const grown = inches(designs()[0]!);
    expect(grown.w).toBeCloseTo(2.67, 2);
    expect(grown.x).toBeCloseTo(after.x, 3);
    expect(grown.y).toBeCloseTo(after.y, 3);
  });
});
