/**
 * The tools a buyer presses before sending us their sheet.
 *
 * The thing worth testing is that each one actually does something, and the
 * right something: a tool that silently leaves the image alone is worse than
 * no tool, because the buyer presses it, sees nothing, and sends the file
 * anyway believing it was fixed.
 */
import { describe, expect, it } from "vitest";
import { applyTool, enhance, grayscale, rotate90, sharpen, TOOLS, type Pixels } from "@/lib/imageTools";

/** A small picture built from a function of its coordinates. */
function make(w: number, h: number, at: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

const pixel = (p: Pixels, x: number, y: number) => {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
};

describe("turning a sheet", () => {
  it("swaps the sides", () => {
    const out = rotate90(make(4, 2, () => [0, 0, 0, 255]));
    expect([out.width, out.height]).toEqual([2, 4]);
  });

  it("takes the top-left corner to the top-right", () => {
    // One red pixel at the origin; after a clockwise quarter turn it belongs
    // at the right-hand end of the top row.
    const src = make(3, 2, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 255]));
    const out = rotate90(src);
    expect(pixel(out, out.width - 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("comes back to itself after four turns", () => {
    const src = make(3, 5, (x, y) => [x * 20, y * 20, 0, 255]);
    let out = src;
    for (let i = 0; i < 4; i++) out = rotate90(out);
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it("leaves the original alone", () => {
    const src = make(2, 2, () => [10, 20, 30, 255]);
    const before = Array.from(src.data);
    rotate90(src);
    expect(Array.from(src.data)).toEqual(before);
  });
});

describe("taking the colour out", () => {
  it("makes every channel the same", () => {
    const out = grayscale(make(2, 2, () => [200, 40, 90, 255]));
    const [r, g, b] = pixel(out, 0, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("weights green above red above blue, as the eye does", () => {
    const red = pixel(grayscale(make(1, 1, () => [255, 0, 0, 255])), 0, 0)[0]!;
    const green = pixel(grayscale(make(1, 1, () => [0, 255, 0, 255])), 0, 0)[0]!;
    const blue = pixel(grayscale(make(1, 1, () => [0, 0, 255, 255])), 0, 0)[0]!;
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it("keeps transparency", () => {
    const out = grayscale(make(1, 1, () => [200, 40, 90, 77]));
    expect(pixel(out, 0, 0)[3]).toBe(77);
  });
});

describe("sharpening", () => {
  it("pushes an edge further apart", () => {
    // A hard vertical edge: dark on the left, light on the right.
    const src = make(5, 3, (x) => (x < 2 ? [60, 60, 60, 255] : [190, 190, 190, 255]));
    const out = sharpen(src, 1);
    const darkSide = pixel(out, 1, 1)[0]!;
    const lightSide = pixel(out, 2, 1)[0]!;
    expect(darkSide).toBeLessThan(60);
    expect(lightSide).toBeGreaterThan(190);
  });

  it("does nothing at zero, and that nothing is a copy", () => {
    const src = make(4, 4, (x, y) => [x * 50, y * 50, 0, 255]);
    const out = sharpen(src, 0);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
    expect(out.data).not.toBe(src.data);
  });

  it("leaves a flat image flat", () => {
    const out = sharpen(make(5, 5, () => [120, 120, 120, 255]), 1);
    expect(pixel(out, 2, 2)).toEqual([120, 120, 120, 255]);
  });
});

describe("enhancing", () => {
  it("opens out a picture that sits in a narrow band", () => {
    // Everything between 100 and 140 — the flat, washed-out case.
    const src = make(20, 1, (x) => { const v = 100 + x * 2; return [v, v, v, 255]; });
    const out = enhance(src, 0);
    const first = pixel(out, 0, 0)[0]!;
    const last = pixel(out, 19, 0)[0]!;
    expect(first).toBeLessThan(20);
    expect(last).toBeGreaterThan(235);
  });

  it("leaves a picture that already fills the range", () => {
    const src = make(16, 1, (x) => { const v = x * 17; return [v, v, v, 255]; });
    const out = enhance(src);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it("is not thrown by one stray bright pixel", () => {
    const src = make(100, 1, (x) => {
      const v = x === 99 ? 255 : 100 + (x % 20);
      return [v, v, v, 255];
    });
    const out = enhance(src, 0.02);
    expect(pixel(out, 0, 0)[0]!).toBeLessThan(60);
  });

  it("ignores pixels that will not print", () => {
    // All transparent: nothing to measure, so nothing is changed.
    const src = make(4, 4, () => [10, 10, 10, 0]);
    const out = enhance(src);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });
});

describe("every tool", () => {
  // An edge, not a smooth ramp. Sharpening a linear gradient returns it
  // unchanged — the kernel cancels exactly — so a ramp would test nothing.
  const src = make(8, 6, (x, y) => (x < 4
    ? [90, 95, 100, 255]
    : [150 + y * 3, 155, 160, 255]));

  it("is wired to something that changes the image", () => {
    for (const tool of TOOLS) {
      const out = applyTool(tool, src);
      const changed = out.width !== src.width || out.height !== src.height
        || Array.from(out.data).some((v, i) => v !== src.data[i]);
      expect(changed, `${tool} did nothing`).toBe(true);
    }
  });

  it("never touches what it was given", () => {
    for (const tool of TOOLS) {
      const before = Array.from(src.data);
      applyTool(tool, src);
      expect(Array.from(src.data), `${tool} modified its input`).toEqual(before);
    }
  });
});
