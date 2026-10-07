/**
 * Getting a sheet made by talking, on the real builder.
 *
 * The model is stood in for — the reply and the plan it proposes are given —
 * and everything after that is the builder's own: the plan card works out the
 * layout and price before anything changes, the button lays the sheet out with
 * Auto Nest's rules, the bigger-sheet button switches size, and one undo puts
 * the sheet back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GangSheetOrder, GangSheetSize } from "@/services/gangSheets.service";

vi.setConfig({ testTimeout: 30_000 });

const said: [string, string][] = [];
vi.mock("@/lib/toast", () => ({
  say: new Proxy({}, { get: (_t, kind: string) => (msg: string) => { said.push([kind, msg]); } }),
}));
vi.mock("react-toastify", () => ({ ToastContainer: () => null }));
// Saving answers like the API: an order with one artwork row per design sent.
const savedOrder = (artworks: unknown[] = []) => ({
  id: "o1", reference: "GS-1", sheet_name: "22×10", price_per_sheet: 7.35, sheet_quantity: 1,
  artworks: artworks.map((_, i) => ({ id: `a${i}` })), layout: [],
});
vi.mock("@/services/gangSheets.service", () => ({
  gangSheetsService: new Proxy({}, {
    get: (_t, k) => k === "uploadArtwork"
      ? (f: File) => Promise.resolve({ url: `https://shop.test/${f.name}`, file_name: f.name, type: "png" })
      : k === "rebuild" ? (_id: string, p: { artworks: unknown[] }) => Promise.resolve(savedOrder(p.artworks))
      : k === "submit" ? (p: { artworks: unknown[] }) => Promise.resolve(savedOrder(p.artworks))
      : k === "saveLayout" ? (id: string, layout: unknown[]) => Promise.resolve({ ...savedOrder(), id, layout })
      : () => Promise.resolve([]),
  }),
}));
// A file's own pixels are not read here: "-nobg" in the name stands for a
// transparent cut-out, anything else for a photo with a background.
vi.mock("@/lib/artworkAnalysis", async (orig) => ({
  ...(await orig<typeof import("@/lib/artworkAnalysis")>()),
  analyzeArtwork: (f: File) => Promise.resolve({ isImage: true, pxW: 1200, pxH: 1200, hasAlpha: f.name.includes("-nobg") }),
}));
const removed: string[] = [];
vi.mock("@/lib/backgroundRemoval", () => ({
  BackgroundRemovalError: class extends Error {},
  removeImageBackground: (f: File) => {
    if (f.name.startsWith("fail")) return Promise.reject(new Error("service down"));
    removed.push(f.name);
    return Promise.resolve(new File(["png"], f.name.replace(/\.\w+$/, "") + "-nobg.png", { type: "image/png" }));
  },
}));
vi.stubGlobal("fetch", () => Promise.resolve({ blob: () => Promise.resolve(new Blob(["img"], { type: "image/jpeg" })) }));
// Signed out until establishSession runs, as with the real store.
const auth = vi.hoisted(() => ({ on: false, cart: [] as string[] }));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: Object.assign(
    (pick: (s: { isAuthenticated: () => boolean }) => unknown) => pick({ isAuthenticated: () => auth.on }),
    { getState: () => ({ isAuthenticated: () => auth.on }) },
  ),
}));
vi.mock("@/services/cart.service", () => ({
  cartService: { addGangSheet: (id: string) => { auth.cart.push(id); return Promise.resolve({}); } },
}));
vi.mock("@/services/auth.service", () => ({
  authService: { login: () => Promise.resolve({ access_token: "token" }) },
}));
vi.mock("@/lib/session", () => ({ establishSession: () => { auth.on = true; return Promise.resolve({}); } }));
vi.mock("@/components/storefront/ImageEditorModal", () => ({ ImageEditorModal: () => null }));
vi.mock("@/components/storefront/AutoBuildPanel", () => ({ AutoBuildPanel: () => null }));
vi.mock("@/components/storefront/WorkingOverlay", () => ({ WorkingOverlay: () => null }));
const post = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));

import { GangSheetStudio } from "@/components/storefront/GangSheetStudio";

const size = (id: string, height: number, price: number): GangSheetSize => ({
  id, name: `22×${height}`, width_in: 22, height_in: height, price_per_sheet: price, bleed_in: 0.25, spacing_in: 0.5,
  is_active: true, sort_order: 0, pricing_mode: "fixed", price_per_inch: 0, min_length_in: 0, max_length_in: 0, max_upload_mb: null,
});
const SIZES = [size("s10", 10, 7.35), size("s24", 24, 15)];

const ORDER = {
  id: "o1", reference: "GS-1", status: "submitted", sheet_name: "Gang Sheet 1", sheet_width_in: 22, sheet_height_in: 10,
  price_per_sheet: 7.35, sheet_quantity: 1, subtotal: 7.35, customer_notes: null, supplier_notes: null, revision_count: 0,
  contact_email: null, contact_name: null, product_id: null, sheet_size_id: "s10", created_at: null, updated_at: null,
  artworks: [{ id: "a1", file_url: "https://shop.test/tee.png", file_name: "tee.png", file_type: "png", width_in: 3, height_in: 3, quantity: 1 }],
  layout: [{ artwork_id: "a1", x_in: 0.25, y_in: 0.25, rotation: 0, w_in: 3, h_in: 3 }],
} as GangSheetOrder;

const PPI = 3;
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
const panel = () => screen.getByRole("dialog", { name: "Sheet assistant" });
/** Press a plan's button and wait for the plan to finish. Its steps wait for
 *  the builder to settle between them, so this waits with waitFor — renders
 *  are let through between checks, as a browser lets them through between
 *  frames — rather than inside one act(), which holds every render back. */
async function press(button: HTMLElement) {
  fireEvent.click(button);
  await waitFor(() => expect(within(panel()).queryByText(/Working on it/)).toBeNull(), { timeout: 4000 });
}
/** The newest upload card; throws until there is one, so waitFor waits. */
function uploadCard(): HTMLElement {
  const all = panel().querySelectorAll<HTMLElement>("[data-upload-card]");
  if (!all.length) throw new Error("no upload card yet");
  return all[all.length - 1]!;
}
const files = (names: string[]) => names.map((n) => new File(["x"], n, { type: "image/jpeg" }));
/** Hand files to the assistant's clip and wait for its upload card. */
async function attach(...names: string[]) {
  const input = panel().querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: files(names) } });
  return await waitFor(() => uploadCard(), { timeout: 4000 });
}
/** Answer the upload card, and wait until the assistant has been told. */
async function answer(card: HTMLElement, ...labels: string[]) {
  const calls = post.mock.calls.length;
  for (const l of labels) fireEvent.click(within(card).getByRole("button", { name: l }));
  await waitFor(() => expect(post.mock.calls.length).toBe(calls + 1), { timeout: 4000 });
  await waitFor(() => expect(within(panel()).queryByText("Looking at your sheet…")).toBeNull());
}
const lastAsk = () => post.mock.calls.at(-1)![1] as {
  messages: { role: string; content: string }[];
  context: { designs: { ref: string; name: string; has_background?: boolean; picture?: boolean }[]; designs_on_sheet: number };
};
/** A line of the plan card, matched on all its text. */
const line = (re: RegExp) => within(panel()).getByText((_, el) => el?.tagName === "LI" && re.test(el.textContent ?? ""));
const sizeMenu = () => document.querySelector('option[value="s24"]')!.parentElement as HTMLSelectElement;

async function openAndAsk(question: string, answer: unknown) {
  render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
  expect(designs()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Build with AI/ }));
  post.mockResolvedValueOnce(answer);
  fireEvent.change(within(panel()).getByPlaceholderText(/on a 22x10/), { target: { value: question } });
  await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
}

beforeEach(() => { said.length = 0; removed.length = 0; auth.on = false; auth.cart.length = 0; post.mockReset(); });

describe("the assistant builds the sheet", () => {
  it("sends the sheet with the question, the designs named d1, d2…", async () => {
    await openAndAsk("Will they all fit?", { reply: "Yes, they all fit." });
    const [url, body] = post.mock.calls[0]! as [string, { messages: { role: string; content: string }[]; context: { designs: { ref: string; name: string }[]; fits: unknown[] } }];
    expect(url).toBe("/api/v1/copilot/studio");
    expect(body.messages).toEqual([{ role: "user", content: "Will they all fit?" }]);
    expect(body.context.designs.map((d) => [d.ref, d.name])).toEqual([["d1", "tee.png"]]);
    expect(body.context.fits).toHaveLength(2);
    expect(within(panel()).getByText("Yes, they all fit.")).toBeInTheDocument();
  });

  it("shows the plan's real result and price before anything changes, then builds it on one press", async () => {
    await openAndAsk("Make 8 copies", {
      reply: "Ready — press the button below.",
      plan: { label: "8 × tee.png on 22×10", build: { items: [{ design: "d1", copies: 8 }], keep_others: true } },
    });
    const card = within(panel());
    expect(card.getByText("8 × tee.png on 22×10")).toBeInTheDocument();
    expect(line(/8 designs on 1 × 22×10/)).toHaveTextContent("$7.35");
    expect(designs()).toHaveLength(1); // nothing has changed yet

    await press(card.getByRole("button", { name: /Do it/ }));
    expect(designs()).toHaveLength(8);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    expect(card.getByText(/Done — your sheet is updated/)).toBeInTheDocument();
    expect(card.getByRole("button", { name: /Add to cart/ })).toBeInTheDocument();
  });

  it("resizes as asked, keeping the design's shape", async () => {
    await openAndAsk("2 of them, 4 inches wide", {
      reply: "Ready.", plan: { label: "2 × tee 4in", build: { items: [{ design: "d1", copies: 2, width_in: 4 }] } },
    });
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(designs().map(inches).map((b) => [b.w, b.h])).toEqual([[4, 4], [4, 4]]);
  });

  it("when it overflows, says how many sheets and offers one bigger sheet that takes it all", async () => {
    await openAndAsk("20 copies", {
      reply: "Ready.", plan: { label: "20 × tee", build: { items: [{ design: "d1", copies: 20 }] } },
    });
    const card = within(panel());
    expect(line(/20 designs on 2 × 22×10/)).toHaveTextContent("$14.70");
    expect(line(/takes 2 sheets/)).toBeInTheDocument();
    const bigger = card.getByRole("button", { name: /Use one 22×24 instead — \$15.00/ });

    await press(bigger);
    expect(sizeMenu().value).toBe("s24");
    expect(designs()).toHaveLength(20);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 24)).toBe(false);
  });

  it("or spills onto a second sheet when that is what they press", async () => {
    await openAndAsk("20 copies", {
      reply: "Ready.", plan: { label: "20 × tee", build: { items: [{ design: "d1", copies: 20 }] } },
    });
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(screen.getByText(/\(2\) Active Gang Sheets/)).toBeInTheDocument();
    expect(overlapping(designs().map(inches))).toBe(false);
  });

  it("refuses a design too big for the sheet, and changes nothing", async () => {
    await openAndAsk("30 inches wide", {
      reply: "Ready.", plan: { label: "1 × tee 30in", build: { items: [{ design: "d1", copies: 1, width_in: 30 }] } },
    });
    const card = within(panel());
    expect(card.getByText(/won't fit a 22×10 sheet at that size/)).toBeInTheDocument();
    expect(card.getByRole("button", { name: /Do it/ })).toBeDisabled();
    expect(designs()).toHaveLength(1);
  });

  it("one undo puts the sheet back the way it was", async () => {
    await openAndAsk("8 copies", {
      reply: "Ready.", plan: { label: "8 × tee", build: { items: [{ design: "d1", copies: 8 }] } },
    });
    const before = designs().map(inches);
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(designs()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(designs().map(inches)).toEqual(before);
  });

  it("tells the model what became of its plan on the next question", async () => {
    await openAndAsk("8 copies", {
      reply: "Ready.", plan: { label: "8 × tee", build: { items: [{ design: "d1", copies: 8 }] } },
    });
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    post.mockResolvedValueOnce({ reply: "Great." });
    fireEvent.change(within(panel()).getByPlaceholderText(/on a 22x10/), { target: { value: "Looks good" } });
    await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
    const body = post.mock.calls[1]![1] as { messages: { role: string; content: string }[]; context: { designs_on_sheet: number } };
    expect(body.messages[1]!.content).toMatch(/The customer pressed the button\. Done: 8 on a 22×10 sheet/);
    expect(body.context.designs_on_sheet).toBe(8);
  });

  it("a newer plan retires the one before it", async () => {
    await openAndAsk("8 copies", {
      reply: "First.", plan: { label: "8 × tee", build: { items: [{ design: "d1", copies: 8 }] } },
    });
    post.mockResolvedValueOnce({ reply: "Second.", plan: { label: "4 × tee", build: { items: [{ design: "d1", copies: 4 }] } } });
    fireEvent.change(within(panel()).getByPlaceholderText(/on a 22x10/), { target: { value: "No, 4 copies" } });
    await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
    expect(within(panel()).getByText("Replaced by a newer plan.")).toBeInTheDocument();
    expect(within(panel()).getAllByRole("button", { name: /Do it/ })).toHaveLength(1);
  });
});

describe("files handed to the assistant", () => {
  const openBuilder = () => {
    render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Build with AI/ }));
  };

  it("asks before doing anything: remove the background? put it on the sheet?", async () => {
    openBuilder();
    const card = await attach("logo.jpg");
    expect(card).toHaveTextContent("Background found on logo.jpg");
    expect(card).toHaveTextContent("Put it on the sheet now?");
    // Nothing yet: not on the sheet, no pop-up of the builder's own, the model not asked.
    expect(designs()).toHaveLength(1);
    expect(screen.queryByText("Background Warning")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("yes and yes: the background comes off, it goes on the sheet, and the assistant is told", async () => {
    openBuilder();
    const card = await attach("logo.jpg");
    post.mockResolvedValueOnce({ reply: "How many copies, and how big?" });
    await answer(card, "Yes, remove it", "Yes, put it on");

    expect(removed).toEqual(["logo.jpg"]);
    expect(designs()).toHaveLength(2);
    expect(designs().some((el) => el.querySelector("img")?.getAttribute("src") === "https://shop.test/logo-nobg.png")).toBe(true);
    const ask = lastAsk();
    expect(ask.messages.at(-1)!.content).toBe("📎 Uploaded logo.jpg. Remove the background from logo.jpg. Put on the sheet.");
    expect(ask.context.designs[1]).toMatchObject({ ref: "d2", name: "logo-nobg.png", has_background: false });
    expect(ask.context.designs_on_sheet).toBe(2);
    expect(within(panel()).getByText("How many copies, and how big?")).toBeInTheDocument();
  });

  it("no and not yet: the file is kept as it is and left off the sheet", async () => {
    openBuilder();
    const card = await attach("logo.jpg");
    post.mockResolvedValueOnce({ reply: "OK." });
    await answer(card, "No, keep it", "Not yet");

    expect(removed).toEqual([]);
    expect(designs()).toHaveLength(1);
    expect(lastAsk().messages.at(-1)!.content).toBe("📎 Uploaded logo.jpg. Keep the backgrounds. Not on the sheet yet.");
  });

  it("when the background can't come off, it says so, keeps the original and carries on", async () => {
    openBuilder();
    const card = await attach("fail.jpg");
    post.mockResolvedValueOnce({ reply: "OK." });
    await answer(card, "Yes, remove it", "Yes, put it on");
    expect(designs()).toHaveLength(2);
    expect(within(panel()).getByText(/⚠ fail.jpg: the background couldn't be removed just now/)).toBeInTheDocument();
    expect(lastAsk().messages.at(-1)!.content).toMatch(/Put on the sheet\. \(fail.jpg: the background couldn't be removed/);
  });

  it("a file with no background is only asked about the sheet", async () => {
    openBuilder();
    const card = await attach("star-nobg.png");
    expect(card).not.toHaveTextContent("Background found");
    post.mockResolvedValueOnce({ reply: "OK." });
    await answer(card, "Yes, put it on");
    expect(designs()).toHaveLength(2);
    expect(lastAsk().messages.at(-1)!.content).toBe("📎 Uploaded star-nobg.png. Put on the sheet.");
  });

  it("the Upload panel goes through the same questions while the assistant is open", async () => {
    openBuilder();
    const panelInput = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((el) => !panel().contains(el))!;
    fireEvent.change(panelInput, { target: { files: files(["logo.jpg"]) } });
    const card = await waitFor(() => uploadCard(), { timeout: 4000 });
    expect(card).toHaveTextContent("Background found on logo.jpg");
    expect(designs()).toHaveLength(1);
  });

  it("and works as it always did with the assistant closed", async () => {
    render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
    const panelInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(panelInput, { target: { files: files(["logo.jpg"]) } });
    await waitFor(() => expect(screen.getByText("Background Warning")).toBeInTheDocument(), { timeout: 4000 });
  });

  it("a plan takes the background off first, then builds with the cut-out", async () => {
    openBuilder();
    const card = await attach("logo.jpg");
    post.mockResolvedValueOnce({ reply: "How many?" });
    await answer(card, "No, keep it", "Not yet");

    post.mockResolvedValueOnce({
      reply: "Ready.",
      plan: { label: "logo bg off, 3 copies", remove_background: ["d2"], build: { items: [{ design: "d2", copies: 3 }], keep_others: true } },
    });
    fireEvent.change(within(panel()).getByPlaceholderText(/on a 22x10/), { target: { value: "Actually remove it, 3 copies" } });
    await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
    expect(line(/Remove background: logo.jpg/)).toBeInTheDocument();
    expect(line(/4 designs on 1 × 22×10/)).toBeInTheDocument(); // the tee stays

    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(removed).toEqual(["logo.jpg"]);
    expect(designs()).toHaveLength(4);
    expect(overlapping(designs().map(inches))).toBe(false);
    const srcs = designs().map((el) => el.querySelector("img")?.getAttribute("src"));
    expect(srcs.filter((x) => x === "https://shop.test/logo-nobg.png")).toHaveLength(3);
  });
});

describe("filling, spacing and sets", () => {
  it("fills the sheet with as many as really fit", async () => {
    await openAndAsk("Fill the sheet with it", {
      reply: "Ready.", plan: { label: "Fill with tee", build: { items: [{ design: "d1", fill: true }] } },
    });
    expect(line(/Fill the sheet: 12 × tee.png/)).toBeInTheDocument();
    expect(line(/12 designs on 1 × 22×10/)).toBeInTheDocument();
    // Filling is this sheet, full: no bigger sheet is offered for it.
    expect(within(panel()).queryByRole("button", { name: /Use one/ })).toBeNull();
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(designs()).toHaveLength(12);
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
  });

  it("smaller fills more", async () => {
    await openAndAsk("Fill it at 2 inches", {
      reply: "Ready.", plan: { label: "Fill at 2in", build: { items: [{ design: "d1", fill: true, width_in: 2 }] } },
    });
    expect(line(/Fill the sheet: 32 × tee.png/)).toBeInTheDocument();
  });

  it("sets the spacing and the number of sets it was asked for", async () => {
    await openAndAsk("4 of them, tight spacing, 3 sets", {
      reply: "Ready.", plan: { label: "4 × tee", sets: 3, build: { items: [{ design: "d1", copies: 4 }], gap_in: 0.25 } },
    });
    expect(line(/Space between designs: 0.25″/)).toBeInTheDocument();
    expect(line(/4 designs on 1 × 22×10/)).toHaveTextContent("$22.05 (3 sets)");
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    expect(designs()).toHaveLength(4);
    expect((screen.getByRole("combobox", { name: /Sheets/ }) as HTMLSelectElement).value).toBe("3");
    expect([...document.querySelectorAll<HTMLInputElement>('input[type="number"][step="0.25"]')].every((el) => el.value === "0.25")).toBe(true);
  });
});

describe("layout, margins and the ways out of an overflow", () => {
  it("lays the sheet out in rows for cutting when asked", async () => {
    await openAndAsk("rows for cutting please", {
      reply: "Ready.", plan: { label: "6 × tee in rows", build: { items: [{ design: "d1", copies: 6 }], layout: "cutting" } },
    });
    expect(line(/Layout: for cutting/)).toBeInTheDocument();
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    const boxes = designs().map(inches);
    expect(boxes).toHaveLength(6);
    // Every row starts at one height, and the next starts below all of it.
    const rows = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) {
      const bottom = Math.max(...boxes.filter((b) => b.y === rows[i - 1]).map((b) => b.y + b.h));
      expect(rows[i]!).toBeGreaterThanOrEqual(bottom);
    }
  });

  it("keeps the sheet margin it is given", async () => {
    await openAndAsk("an inch from the edges", {
      reply: "Ready.", plan: { label: "4 × tee", build: { items: [{ design: "d1", copies: 4 }], sheet_margin_in: 1 } },
    });
    expect(line(/Space at the sheet's edges: 1″/)).toBeInTheDocument();
    await press(within(panel()).getByRole("button", { name: /Do it/ }));
    const boxes = designs().map(inches);
    expect(boxes.every((b) => b.x >= 1 - 1e-6 && b.y >= 1 - 1e-6 && b.x + b.w <= 21 + 1e-6 && b.y + b.h <= 9 + 1e-6)).toBe(true);
  });

  it("on an overflow, offers to shrink everything onto one sheet — and does it", async () => {
    await openAndAsk("20 copies", {
      reply: "Ready.", plan: { label: "20 × tee", build: { items: [{ design: "d1", copies: 20 }] } },
    });
    expect(within(panel()).getByRole("button", { name: /Do it on 2 sheets — \$14.70/ })).toBeInTheDocument();
    const shrink = within(panel()).getByRole("button", { name: /Shrink to fit one 22×10: tee.png at [\d.]+″ wide — \$7.35/ });
    await press(shrink);
    expect(designs()).toHaveLength(20);
    expect(screen.queryByText(/\(2\) Active Gang Sheets/)).toBeNull();
    const boxes = designs().map(inches);
    expect(overlapping(boxes)).toBe(false);
    expect(outside(boxes, 10)).toBe(false);
    expect(boxes[0]!.w).toBeLessThan(3);
  });
});

describe("signing in to add the sheet to the cart", () => {
  it("carries on after signing in: the form closes and the sheet goes into the cart", async () => {
    render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Save & Add to Cart/ }));
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="email"]')!, { target: { value: "buyer@shop.test" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in & add to cart" }));

    await waitFor(() => expect(auth.cart).toEqual(["o1"]), { timeout: 4000 });
    expect(screen.queryByRole("button", { name: "Sign in & add to cart" })).toBeNull();
  });
});
