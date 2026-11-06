import { describe, expect, it } from "vitest";
import { withDpi } from "@/components/designer/render";

// A real 1 x 1 transparent PNG.
const PNG_1PX = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
), (c) => c.charCodeAt(0));

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

describe("withDpi", () => {
  it("writes the print resolution into the PNG right after its header", async () => {
    const out = new Uint8Array(await (await withDpi(new Blob([PNG_1PX], { type: "image/png" }), 300)).arrayBuffer());
    const v = new DataView(out.buffer);
    expect(out.length).toBe(PNG_1PX.length + 21);
    expect(v.getUint32(33)).toBe(9);
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe("pHYs");
    // 300 DPI is 11,811 pixels a metre, the same both ways, in metres.
    expect(v.getUint32(41)).toBe(11811);
    expect(v.getUint32(45)).toBe(11811);
    expect(out[49]).toBe(1);
    expect(v.getUint32(50)).toBe(crc32(out.subarray(37, 50)));
    // Everything else is the original file, unchanged.
    expect(Array.from(out.subarray(0, 33))).toEqual(Array.from(PNG_1PX.subarray(0, 33)));
    expect(Array.from(out.subarray(54))).toEqual(Array.from(PNG_1PX.subarray(33)));
  });
});
