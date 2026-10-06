/**
 * The image editor's crop box.
 *
 * It could only be cropped from the bottom-right corner. These hold the other
 * seven handles: each side and corner moves, the opposite one stays, the box
 * never leaves the picture, and a locked shape keeps its shape.
 */
import { describe, expect, it } from "vitest";
import { HANDLES, cursorFor, moveCrop, resizeCrop, type Handle, type Rect } from "@/lib/cropBox";

const W = 800, H = 600;
const box: Rect = { x: 200, y: 150, w: 400, h: 300 };
const edges = (r: Rect) => ({ left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h });

describe("a free crop box", () => {
  it("has a handle for every side and every corner", () => {
    expect([...HANDLES].sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("is cropped from the top by the top handle, and nothing else moves", () => {
    expect(edges(resizeCrop(box, "n", 37, 50, W, H, null))).toEqual({ left: 200, top: 200, right: 600, bottom: 450 });
  });

  it("…from the bottom, the left and the right the same way", () => {
    expect(edges(resizeCrop(box, "s", 99, -40, W, H, null))).toEqual({ left: 200, top: 150, right: 600, bottom: 410 });
    expect(edges(resizeCrop(box, "w", 60, 99, W, H, null))).toEqual({ left: 260, top: 150, right: 600, bottom: 450 });
    expect(edges(resizeCrop(box, "e", -80, 99, W, H, null))).toEqual({ left: 200, top: 150, right: 520, bottom: 450 });
  });

  it("is cropped from two sides at once by a corner, the opposite corner staying put", () => {
    expect(edges(resizeCrop(box, "nw", 30, 20, W, H, null))).toEqual({ left: 230, top: 170, right: 600, bottom: 450 });
    expect(edges(resizeCrop(box, "ne", -30, 20, W, H, null))).toEqual({ left: 200, top: 170, right: 570, bottom: 450 });
    expect(edges(resizeCrop(box, "sw", 30, -20, W, H, null))).toEqual({ left: 230, top: 150, right: 600, bottom: 430 });
    expect(edges(resizeCrop(box, "se", -30, -20, W, H, null))).toEqual({ left: 200, top: 150, right: 570, bottom: 430 });
  });

  it("can be dragged outward too, as far as the picture's edge and no further", () => {
    expect(edges(resizeCrop(box, "nw", -9999, -9999, W, H, null))).toEqual({ left: 0, top: 0, right: 600, bottom: 450 });
    expect(edges(resizeCrop(box, "se", 9999, 9999, W, H, null))).toEqual({ left: 200, top: 150, right: 800, bottom: 600 });
  });

  it("cannot be turned inside out or squeezed to nothing", () => {
    for (const h of HANDLES) {
      const sign = (c: string) => (h.includes(c) ? 1 : 0);
      const r = resizeCrop(box, h, (sign("w") - sign("e")) * 9999, (sign("n") - sign("s")) * 9999, W, H, null);
      expect(r.w).toBeGreaterThanOrEqual(20);
      expect(r.h).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("a crop box locked to a shape", () => {
  const square: Rect = { x: 250, y: 150, w: 300, h: 300 };
  const inside = (r: Rect) => r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= W + 1e-6 && r.y + r.h <= H + 1e-6;

  it("keeps its shape from every handle, wherever it is dragged", () => {
    for (const ratio of [1, 16 / 9, 9 / 16, 3 / 2]) {
      const start: Rect = ratio >= 1 ? { x: 200, y: 200, w: 240, h: 240 / ratio } : { x: 300, y: 100, w: 240 * ratio, h: 240 };
      for (const h of HANDLES) {
        for (const [dx, dy] of [[40, 25], [-60, -35], [9999, 9999], [-9999, -9999], [0, 0]] as const) {
          const r = resizeCrop(start, h as Handle, dx, dy, W, H, ratio);
          expect(r.w / r.h).toBeCloseTo(ratio, 6);
          expect(inside(r)).toBe(true);
          expect(r.w).toBeGreaterThan(0);
        }
      }
    }
  });

  it("grows from the opposite corner when a corner is dragged", () => {
    const r = edges(resizeCrop(square, "nw", -50, -50, W, H, 1));
    expect(r).toEqual({ left: 200, top: 100, right: 550, bottom: 450 });
  });

  it("stays centred when a side is dragged", () => {
    const r = resizeCrop(square, "e", 60, 0, W, H, 1);
    expect(r).toEqual({ x: 250, y: 120, w: 360, h: 360 });
  });
});

describe("moving the box", () => {
  it("keeps its size and stops at the picture's edges", () => {
    expect(moveCrop(box, 50, -30, W, H)).toEqual({ x: 250, y: 120, w: 400, h: 300 });
    expect(moveCrop(box, 9999, 9999, W, H)).toEqual({ x: 400, y: 300, w: 400, h: 300 });
    expect(moveCrop(box, -9999, -9999, W, H)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});

describe("the pointer over a handle", () => {
  it("shows which way it drags", () => {
    expect(cursorFor("n")).toBe("ns-resize");
    expect(cursorFor("w")).toBe("ew-resize");
    expect(cursorFor("nw")).toBe("nwse-resize");
    expect(cursorFor("sw")).toBe("nesw-resize");
  });
});
