import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_GARMENTS } from "@/lib/designer/catalog";
import type { DesignDoc } from "@/lib/designer/types";
import { designOf, emptyDoc, normalizeDoc, shirtSides, useDesigner } from "@/stores/designer.store";

const tee = DEMO_GARMENTS.find((g) => g.id === "classic-tee")!;
const text = (t: string) => ({ type: "i-text", text: t, left: 0, top: 300 });

function start() {
  useDesigner.getState().init(DEMO_GARMENTS, emptyDoc(tee));
  useDesigner.getState().setViewObjects("front", [text("ALPHA")]);
}

const doc = () => useDesigner.getState().doc!;
const navy = "classic-tee:navy";
const white = "classic-tee:white";

describe("one design per shirt", () => {
  beforeEach(start);

  it("starts a new colour as a copy of the shirt on the stage", () => {
    useDesigner.getState().toggleColor(0, "navy", true);
    expect(designOf(doc(), navy).front).toEqual([text("ALPHA")]);
    expect(useDesigner.getState().active.colorId).toBe("navy");
  });

  it("starts a new colour blank when asked", () => {
    useDesigner.getState().toggleColor(0, "navy", false);
    expect(shirtSides(doc(), navy)).toEqual([]);
  });

  it("edits only the shirt on the stage", () => {
    useDesigner.getState().toggleColor(0, "navy", true);
    useDesigner.getState().setViewObjects("back", [text("NAVY BACK")]);
    expect(shirtSides(doc(), navy)).toEqual(["front", "back"]);
    expect(shirtSides(doc(), white)).toEqual(["front"]);
  });

  it("copies another shirt's design without sharing it", () => {
    useDesigner.getState().toggleColor(0, "navy", false);
    useDesigner.getState().copyDesignFrom(white);
    expect(designOf(doc(), navy).front).toEqual([text("ALPHA")]);
    useDesigner.getState().setViewObjects("front", []);
    expect(designOf(doc(), white).front).toEqual([text("ALPHA")]);
  });

  it("drops a shirt's design when its colour is removed", () => {
    useDesigner.getState().toggleColor(0, "navy", true);
    useDesigner.getState().toggleColor(0, "navy");
    expect(doc().designs[navy]).toBeUndefined();
  });
});

describe("normalizeDoc", () => {
  it("puts an old single design on every shirt", () => {
    const old = {
      ...emptyDoc(tee),
      version: 1,
      products: [{ garmentId: "classic-tee", colorIds: ["white", "navy"] }],
      views: { front: [text("OLD")], back: [], left: [], right: [] },
    } as unknown as DesignDoc;
    const now = normalizeDoc(old);
    expect(now.version).toBe(2);
    expect(now.views).toBeUndefined();
    expect(designOf(now, white).front).toEqual([text("OLD")]);
    expect(designOf(now, navy).front).toEqual([text("OLD")]);
    expect(designOf(now, white).front).not.toBe(designOf(now, navy).front);
  });
});
