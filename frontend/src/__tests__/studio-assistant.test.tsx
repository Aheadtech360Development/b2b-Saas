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
vi.mock("@/services/gangSheets.service", () => ({
  gangSheetsService: new Proxy({}, {
    get: (_t, k) => k === "uploadArtwork"
      ? (f: File) => Promise.resolve({ url: `https://shop.test/${f.name}`, file_name: f.name, type: "png" })
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
    removed.push(f.name);
    return Promise.resolve(new File(["png"], f.name.replace(/\.\w+$/, "") + "-nobg.png", { type: "image/png" }));
  },
}));
vi.stubGlobal("fetch", () => Promise.resolve({ blob: () => Promise.resolve(new Blob(["img"], { type: "image/jpeg" })) }));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: { isAuthenticated: () => boolean }) => unknown) => pick({ isAuthenticated: () => false }),
}));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/services/auth.service", () => ({ authService: {} }));
vi.mock("@/lib/session", () => ({ establishSession: vi.fn() }));
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
/** Hand files to the assistant and wait until it has asked about them. */
async function attach(...names: string[]) {
  const calls = post.mock.calls.length;
  const input = panel().querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: names.map((n) => new File(["x"], n, { type: "image/jpeg" })) } });
  await waitFor(() => expect(post.mock.calls.length).toBe(calls + 1), { timeout: 4000 });
  await waitFor(() => expect(within(panel()).queryByText("Looking at your sheet…")).toBeNull());
}
/** A line of the plan card, matched on all its text. */
const line = (re: RegExp) => within(panel()).getByText((_, el) => el?.tagName === "LI" && re.test(el.textContent ?? ""));
const sizeMenu = () => document.querySelector('option[value="s24"]')!.parentElement as HTMLSelectElement;

async function openAndAsk(question: string, answer: unknown) {
  render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
  expect(designs()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Build with AI/ }));
  post.mockResolvedValueOnce(answer);
  fireEvent.change(within(panel()).getByPlaceholderText(/22x10 pe/), { target: { value: question } });
  await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
}

beforeEach(() => { said.length = 0; removed.length = 0; post.mockReset(); });

describe("the assistant builds the sheet", () => {
  it("sends the sheet with the question, the designs named d1, d2…", async () => {
    await openAndAsk("kitne aa jayenge?", { reply: "Sab aa jayenge." });
    const [url, body] = post.mock.calls[0]! as [string, { messages: { role: string; content: string }[]; context: { designs: { ref: string; name: string }[]; fits: unknown[] } }];
    expect(url).toBe("/api/v1/copilot/studio");
    expect(body.messages).toEqual([{ role: "user", content: "kitne aa jayenge?" }]);
    expect(body.context.designs.map((d) => [d.ref, d.name])).toEqual([["d1", "tee.png"]]);
    expect(body.context.fits).toHaveLength(2);
    expect(within(panel()).getByText("Sab aa jayenge.")).toBeInTheDocument();
  });

  it("shows the plan's real result and price before anything changes, then builds it on one press", async () => {
    await openAndAsk("8 copies bana do", {
      reply: "Tayyar hai — neeche button dabayein.",
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
    await openAndAsk("4 inch ke 2", {
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
    await openAndAsk("30 inch", {
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
    fireEvent.change(within(panel()).getByPlaceholderText(/22x10 pe/), { target: { value: "theek hai" } });
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
    fireEvent.change(within(panel()).getByPlaceholderText(/22x10 pe/), { target: { value: "nahi 4" } });
    await act(async () => { fireEvent.click(within(panel()).getByRole("button", { name: "Send" })); });
    expect(within(panel()).getByText("Replaced by a newer plan.")).toBeInTheDocument();
    expect(within(panel()).getAllByRole("button", { name: /Do it/ })).toHaveLength(1);
  });
});

describe("files handed to the assistant", () => {
  it("are uploaded onto the sheet, and the assistant is told about them straight away", async () => {
    render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Build with AI/ }));
    post.mockResolvedValueOnce({ reply: "logo.jpg par background hai — hata dun?" });
    await attach("logo.jpg");

    expect(designs()).toHaveLength(2);
    const body = post.mock.calls[0]![1] as { messages: { content: string }[]; context: { designs: { ref: string; name: string; has_background?: boolean }[] } };
    expect(body.messages.at(-1)!.content).toBe("📎 logo.jpg");
    // The reopened design was never looked at; the new photo was.
    expect(body.context.designs).toEqual([
      expect.objectContaining({ ref: "d1", name: "tee.png", picture: true }),
      expect.objectContaining({ ref: "d2", name: "logo.jpg", has_background: true }),
    ]);
    expect((body.context.designs[0] as { has_background?: boolean }).has_background).toBeUndefined();
    expect(within(panel()).getByText(/hata dun\?/)).toBeInTheDocument();
    // No background prompt of the builder's own: the assistant asks instead.
    expect(screen.queryByText("Background Warning")).toBeNull();
  });

  it("a plan takes the background off first, then builds with the cut-out", async () => {
    render(<GangSheetStudio sizes={SIZES} productId={null} resumeOrder={ORDER} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Build with AI/ }));
    post.mockResolvedValueOnce({ reply: "Hata dun?" });
    await attach("logo.jpg");

    post.mockResolvedValueOnce({
      reply: "Tayyar.",
      plan: { label: "logo bg off, 3 copies", remove_background: ["d2"], build: { items: [{ design: "d2", copies: 3 }], keep_others: true } },
    });
    fireEvent.change(within(panel()).getByPlaceholderText(/22x10 pe/), { target: { value: "haan hata do, 3 copies" } });
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
