/**
 * A colour's name, turned into the colour — in one place.
 *
 * What was reported: blank garments added in the admin showed a grey dot for
 * some colours. Seven screens each had an eighty-name list matched by exact
 * spelling, and a name outside it was saved as grey.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNKNOWN_COLOR, colorHex, colorNames, isLightColor, knownColor, normalizeHex, parseColorEntry } from "@/lib/colors";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const [R, G, B] = [0, 1, 2];

describe("a colour's name", () => {
  it("is known however it is written: capitals, grey or gray, short forms, run together", () => {
    expect(knownColor("Navy")).toBe("#1E3A5F");
    expect(knownColor("navy")).toBe("#1E3A5F");
    expect(knownColor("  NAVY ")).toBe("#1E3A5F");
    expect(knownColor("Dark Grey")).toBe(knownColor("dark gray"));
    expect(knownColor("Dk Grey")).toBe(knownColor("Dark Gray"));
    expect(knownColor("Lt Blue")).toBe(knownColor("Light Blue"));
    expect(knownColor("SkyBlue")).toBe(knownColor("Sky Blue"));
    expect(knownColor("forestgreen")).toBe(knownColor("Forest Green"));
    expect(knownColor("Salt & Pepper")).toBe("#8E8E8E");
  });

  it("keeps the shades the shop already drew", () => {
    for (const [name, hex] of [["White", "#FFFFFF"], ["Black", "#111111"], ["Royal Blue", "#2251CC"], ["Sport Grey", "#9CA3AF"],
      ["Athletic Heather", "#B0B7C3"], ["Texas Orange", "#BF5700"], ["Decadent Chocolate", "#723638"]] as const) {
      expect(knownColor(name)).toBe(hex);
    }
  });

  it("knows the mills' names that used to come out grey", () => {
    for (const name of ["Safety Green", "Heliconia", "Antique Cherry Red", "Carolina Blue", "Irish Green", "Sapphire", "Cornsilk",
      "Azalea", "Dark Chocolate", "Ice Grey", "Pepper", "Blue Jean", "Chalky Mint", "Seafoam", "Crunchberry", "True Royal",
      "Heather Mauve", "Vintage Black", "Team Purple", "Military Green", "Tennessee Orange", "Old Gold", "Graphite Heather"]) {
      expect(knownColor(name), name).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(colorNames().length).toBeGreaterThan(400);
  });

  it("reads the words about the cloth as shading, not as a different colour", () => {
    const navy = rgb(knownColor("Navy")!);
    const heather = rgb(knownColor("Heather Navy")!);
    // Still a blue, only greyer and lighter — and the same whichever way round it is written.
    expect(heather[B]).toBeGreaterThan(heather[R]!);
    expect(heather[R]).toBeGreaterThan(navy[R]!);
    expect(knownColor("Navy Heather")).toBe(knownColor("Heather Navy"));
    expect(knownColor("Solid Black Blend")).toBe("#111111");
    expect(knownColor("Black Triblend")).not.toBe("#111111");
    const dark = rgb(knownColor("Dark Purple")!), purple = rgb(knownColor("Purple")!), pale = rgb(knownColor("Light Purple")!);
    expect(dark[G]! + dark[R]! + dark[B]!).toBeLessThan(purple[G]! + purple[R]! + purple[B]!);
    expect(pale[G]! + pale[R]! + pale[B]!).toBeGreaterThan(purple[G]! + purple[R]! + purple[B]!);
    // The longer name wins over a shorter one inside it.
    expect(knownColor("True Royal Triblend")).not.toBe(knownColor("Royal Triblend"));
    expect(knownColor("Heather Deep Royal")).not.toBeNull();
  });

  it("takes the body colour of a two-colour name", () => {
    expect(knownColor("White/Black")).toBe("#FFFFFF");
    expect(knownColor("Navy w/ Gold")).toBe("#1E3A5F");
    expect(knownColor("Pink & Grey")).toBe(knownColor("Pink"));
  });

  it("is a hex when a hex is what was written", () => {
    expect(knownColor("#1f3a93")).toBe("#1F3A93");
    expect(knownColor("1F3A93")).toBe("#1F3A93");
    expect(knownColor("#abc")).toBe("#AABBCC");
    expect(normalizeHex("#1f3a93ff")).toBe("#1F3A93");
    expect(normalizeHex("blue")).toBeNull();
  });

  it("is never guessed when nobody could say", () => {
    expect(knownColor("Xyzzy")).toBeNull();
    expect(knownColor("")).toBeNull();
    expect(knownColor(null)).toBeNull();
  });
});

describe("the colour drawn for a variant", () => {
  it("is the shop's own hex when it chose one", () => {
    expect(colorHex("Our Teal", "#0d7c80")).toBe("#0D7C80");
    expect(colorHex("Navy", "#000000")).toBe("#000000");
  });

  it("is the name's colour where the hex is missing — or is the grey that was saved as a stand-in", () => {
    expect(colorHex("Heather Royal", null)).toBe(knownColor("Heather Royal"));
    expect(colorHex("Seafoam", "#888888")).toBe("#9FD5B8");
    expect(colorHex("Seafoam", "#ccc")).toBe("#9FD5B8");
    // A grey that is really the colour stays.
    expect(colorHex("Grey", "#9ca3af")).toBe("#9CA3AF");
  });

  it("is a quiet neutral only when there is nothing to go on", () => {
    expect(colorHex("Xyzzy")).toBe(UNKNOWN_COLOR);
    expect(colorHex("Xyzzy", "#888888")).toBe("#888888");
  });

  it("knows which swatches need an edge", () => {
    expect(isLightColor("#FFFFFF")).toBe(true);
    expect(isLightColor("#111111")).toBe(false);
  });
});

describe("what an admin types for a colour", () => {
  it("can carry its hex with it", () => {
    expect(parseColorEntry("Seafoam #9fd5b8")).toEqual({ name: "Seafoam", hex: "#9FD5B8" });
    expect(parseColorEntry("Seafoam (#9FD5B8)")).toEqual({ name: "Seafoam", hex: "#9FD5B8" });
    expect(parseColorEntry("Mystic Blue: #3A5FCD")).toEqual({ name: "Mystic Blue", hex: "#3A5FCD" });
    expect(parseColorEntry("#3A5FCD")).toEqual({ name: "#3A5FCD", hex: "#3A5FCD" });
    expect(parseColorEntry("3A5FCD")).toEqual({ name: "#3A5FCD", hex: "#3A5FCD" });
    expect(parseColorEntry("Navy")).toEqual({ name: "Navy", hex: null });
  });
});

describe("the list of names", () => {
  it("has no entry that could not be read", () => {
    const src = readFileSync("src/lib/colors.ts", "utf8");
    const block = /const NAMES = `([\s\S]*?)`;/.exec(src)![1]!;
    const entries = block.split(/[|\n]/).map((e) => e.trim()).filter(Boolean);
    const bad = entries.filter((e) => !/^[a-z][a-z ]*[a-z] [0-9A-F]{6}$/.test(e));
    expect(bad).toEqual([]);
    // And none is written twice with two different colours.
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const e of entries) {
      const name = e.slice(0, -7), hex = e.slice(-6);
      if (seen.has(name) && seen.get(name) !== hex) twice.push(name);
      seen.set(name, hex);
    }
    expect(twice).toEqual([]);
  });
});
