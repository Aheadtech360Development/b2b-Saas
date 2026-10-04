/**
 * The Grid + Flex layout engine: structured settings in, deterministic CSS out.
 */
import { describe, expect, it } from "vitest";
import { declarations, gridTemplate, nodeCss, treeCss } from "@/lib/builder/style";
import type { BuilderNode, NodeStyle } from "@/lib/builder/types";

const TAB = "@container bsite (max-width:1024px)";
const PHONE = "@container bsite (max-width:640px)";

function grid(cols: number, rows: number, extra: NodeStyle = {}, kids = cols * rows): BuilderNode {
  return {
    id: "g", type: "stack", style: { display: "grid", gridColumns: cols, gridRows: rows, gap: 20, ...extra },
    children: Array.from({ length: kids }, (_, i) => ({ id: `c${i + 1}`, type: "column", children: [] })),
  };
}

describe("grids from presets", () => {
  it("2×2", () => {
    const css = treeCss(grid(2, 2));
    expect(css).toContain('.bsite [data-b="g"]{display:grid;gap:20px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,auto)}');
    // Two across already fits a tablet; a phone gets one, and its rows flow.
    expect(css).not.toContain(`${TAB}{.bsite [data-b="g"]`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(1,minmax(0,1fr));grid-template-rows:none}}`);
  });

  it("3×3 goes 3 → 2 → 1 by itself", () => {
    const css = nodeCss(grid(3, 3));
    expect(css).toContain("grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,auto)");
    expect(css).toContain(`${TAB}{.bsite [data-b="g"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:none}}`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(1,minmax(0,1fr))}}`);
  });

  it("4×3 goes 4 → 2 → 1", () => {
    const css = nodeCss(grid(4, 3));
    expect(css).toContain("repeat(4,minmax(0,1fr))");
    expect(css).toContain(`${TAB}{.bsite [data-b="g"]{grid-template-columns:repeat(2,minmax(0,1fr))`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(1,minmax(0,1fr))`);
  });

  it("6 columns go 6 → 3 → 2", () => {
    const css = nodeCss(grid(6, 1));
    expect(css).toContain(`${TAB}{.bsite [data-b="g"]{grid-template-columns:repeat(3,minmax(0,1fr))`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(2,minmax(0,1fr))`);
  });

  it("what the merchant set for a smaller screen always wins, and is inherited below it", () => {
    const g = grid(4, 2);
    g.tablet = { gridColumns: 3 };
    const css = nodeCss(g);
    expect(css).toContain(`${TAB}{.bsite [data-b="g"]{grid-template-columns:repeat(3,minmax(0,1fr))}}`);
    // Not set for phones: falls from the tablet's 3, not from the desktop's 4.
    expect(css).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(1,minmax(0,1fr))`);
    g.mobile = { gridColumns: 2 };
    expect(nodeCss(g)).toContain(`${PHONE}{.bsite [data-b="g"]{grid-template-columns:repeat(2,minmax(0,1fr))}}`);
  });

  it("auto-fit and auto-fill adapt to the width, with nothing to collapse and no overflow", () => {
    const css = nodeCss({ id: "g", type: "stack", style: { display: "grid", gridAuto: "fit", gridMin: 220 } });
    expect(css).toBe('.bsite [data-b="g"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))}');
    expect(gridTemplate({ gridAuto: "fill" })).toBe("repeat(auto-fill,minmax(min(240px,100%),1fr))");
  });

  it("takes custom column widths, and refuses anything that is not one", () => {
    expect(gridTemplate({ gridTemplate: "2fr 1fr" })).toBe("2fr 1fr");
    expect(gridTemplate({ gridTemplate: "240px minmax(0,1fr) 20%" })).toBe("240px minmax(0,1fr) 20%");
    expect(gridTemplate({ gridTemplate: "1fr; } body { display:none" })).toBeNull();
    expect(gridTemplate({ gridTemplate: "url(x) 1fr" })).toBeNull();
  });

  it("clamps counts to what a grid can hold", () => {
    expect(gridTemplate({ gridColumns: 40 })).toBe("repeat(12,minmax(0,1fr))");
    expect(gridTemplate({ gridColumns: -3 })).toBe("repeat(1,minmax(0,1fr))");
  });
});

describe("placing items", () => {
  it("spans columns and rows from a cell", () => {
    expect(declarations({ gridColumn: 1, gridColumnSpan: 2, gridRow: 1, gridRowSpan: 2 }, "column"))
      .toBe("grid-column:1 / span 2;grid-row:1 / span 2");
    expect(declarations({ gridColumnSpan: 3 }, "column")).toBe("grid-column:span 3");
    expect(declarations({ gridRow: 2 }, "column")).toBe("grid-row:2");
  });

  it("builds the HERO / TEXT / three cards layout", () => {
    const page: BuilderNode = {
      id: "g", type: "stack", style: { display: "grid", gridColumns: 3, gridRows: 3, gap: 16 },
      children: [
        { id: "hero", type: "column", style: { gridColumn: 1, gridColumnSpan: 2, gridRow: 1, gridRowSpan: 2 } },
        { id: "text", type: "column", style: { gridColumn: 3, gridRow: 2 } },
        { id: "k1", type: "column" }, { id: "k2", type: "column" }, { id: "k3", type: "column" },
      ],
    };
    const css = treeCss(page);
    expect(css).toContain('.bsite [data-b="hero"]{grid-column:1 / span 2;grid-row:1 / span 2}');
    expect(css).toContain('.bsite [data-b="text"]{grid-column:3;grid-row:2}');
    // Where the grid fell to 2 columns by itself, the hero flows instead of
    // pointing at a column that is not there, keeping as much span as fits.
    expect(css).toContain(`${TAB}{.bsite [data-b="hero"]{grid-column:auto / span 2;grid-row:auto / span 2}}`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="hero"]{grid-column:auto;grid-row:auto / span 2}}`);
    expect(css).toContain(`${TAB}{.bsite [data-b="text"]{grid-column:auto;grid-row:auto}}`);
    // Cards nobody placed are left to the grid.
    expect(css).not.toContain('[data-b="k1"]');
  });

  it("leaves placement alone on a screen where the merchant set the columns", () => {
    const g = grid(3, 1, {}, 0);
    g.tablet = { gridColumns: 3 };
    g.children = [{ id: "x", type: "column", style: { gridColumn: 3 } }];
    const css = treeCss(g);
    expect(css).not.toContain(`${TAB}{.bsite [data-b="x"]`);
    expect(css).toContain(`${PHONE}{.bsite [data-b="x"]{grid-column:auto;grid-row:auto}}`);
  });

  it("grows, shrinks and aligns flex items", () => {
    expect(declarations({ flexGrow: 1, flexShrink: 0, flexBasis: 0, alignSelf: "center", order: 2 }, "column"))
      .toBe("flex-grow:1;flex-shrink:0;flex-basis:0px;align-self:center;order:2");
  });
});

describe("flex containers", () => {
  it("row, wrapping, spread, with gaps", () => {
    const css = nodeCss({ id: "f", type: "stack", style: { display: "flex", flexDirection: "row", flexWrap: "wrap",
      justifyContent: "space-between", alignItems: "center", rowGap: 12, columnGap: 24 } });
    expect(css).toBe('.bsite [data-b="f"]{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;row-gap:12px;column-gap:24px}');
  });

  it("row on desktop, column on a phone", () => {
    const css = nodeCss({ id: "f", type: "stack", style: { display: "flex", flexDirection: "row" }, mobile: { flexDirection: "column" } });
    expect(css).toContain(`${PHONE}{.bsite [data-b="f"]{flex-direction:column}}`);
  });

  it("refuses a display it does not know", () => {
    expect(declarations({ display: "table" }, "stack")).toBe("");
    expect(declarations({ gridAutoFlow: "row dense" }, "stack")).toBe("grid-auto-flow:row dense");
    expect(declarations({ gridAutoFlow: "sideways" }, "stack")).toBe("");
  });
});

describe("sections and nesting", () => {
  it("a section lays out its inner wrapper, and keeps its own box on itself", () => {
    const css = nodeCss({ id: "s", type: "section", style: { display: "grid", gridColumns: 2, gap: 24, paddingTop: 40 } });
    expect(css).toContain('.bsite [data-b="s"]{padding-top:40px}');
    expect(css).toContain('.bsite [data-b="s"] > .b-in{display:grid;gap:24px;grid-template-columns:repeat(2,minmax(0,1fr))}');
  });

  it("a section without a layout is exactly what it was", () => {
    expect(nodeCss({ id: "s", type: "section", style: { gap: 24, paddingTop: 40 } })).toBe('.bsite [data-b="s"]{gap:24px;padding-top:40px}');
  });

  it("Section → Grid → Cell → Flex → buttons", () => {
    const tree: BuilderNode = {
      id: "sec", type: "section", children: [{
        id: "grid", type: "stack", style: { display: "grid", gridColumns: 2 }, children: [{
          id: "cell", type: "column", style: { gridColumnSpan: 2 }, children: [{
            id: "flex", type: "stack", style: { display: "flex", flexDirection: "row", gap: 8 },
            children: [{ id: "b1", type: "button" }, { id: "b2", type: "button" }],
          }],
        }],
      }],
    };
    const css = treeCss(tree);
    expect(css).toContain('[data-b="grid"]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}');
    expect(css).toContain('[data-b="cell"]{grid-column:span 2}');
    expect(css).toContain('[data-b="flex"]{display:flex;flex-direction:row;gap:8px}');
    // The phone's single column clips the span; the flex row inside is untouched.
    expect(css).toContain(`${PHONE}{.bsite [data-b="cell"]{grid-column:auto;grid-row:auto}}`);
    expect(css).not.toContain(`${PHONE}{.bsite [data-b="flex"]`);
  });

  it("a row set to the new grid uses it instead of its old column count", () => {
    const css = nodeCss({ id: "r", type: "row", style: { columns: 2, gridColumns: 3 } });
    // Desktop: the new three, not the old two.
    expect(css.split(/\n/)[0]).toBe('.bsite [data-b="r"]{grid-template-columns:repeat(3,minmax(0,1fr))}');
  });
});

import {
  applyGrid, autoPlace, clearLayout, columnsAt, equalWidths, flexRow, gridContainer, layoutMark, modeAt, placeInCell,
  setAt, setSpan, valueAt,
} from "@/lib/builder/layout";

describe("editing a layout", () => {
  const box = (id: string, style?: NodeStyle): BuilderNode => ({ id, type: "column", style, children: [] });

  it("a preset fills the grid with empty cells, and never takes any away", () => {
    const g = applyGrid({ id: "g", type: "stack", children: [box("a")] }, "desktop", 3, 3, true);
    expect(g.style).toMatchObject({ display: "grid", gridColumns: 3, gridRows: 3 });
    expect(g.children).toHaveLength(9);
    expect(g.children![0]!.id).toBe("a");
    const smaller = applyGrid(g, "desktop", 2, 2, true);
    expect(smaller.children).toHaveLength(9);
  });

  it("a preset on a phone changes the phone only", () => {
    const g = applyGrid(gridContainer(4, 3), "mobile", 2, 0);
    expect(g.style).toMatchObject({ gridColumns: 4, gridRows: 3 });
    expect(g.mobile).toEqual({ display: "grid", gridColumns: 2 });
    expect(columnsAt(g, "desktop")).toBe(4);
    expect(columnsAt(g, "tablet")).toBe(2);
    expect(columnsAt(g, "mobile")).toBe(2);
  });

  it("a smaller screen inherits until it is changed there", () => {
    const g = setAt(gridContainer(3, 1), "tablet", { gap: "8px" });
    expect(valueAt(g, "mobile", "gap")).toBe("8px");
    expect(valueAt(g, "desktop", "gap")).toBe("16px");
    expect(modeAt(g, "mobile")).toBe("grid");
    expect(modeAt(clearLayout(g, "desktop"), "desktop")).toBe("flex"); // a stack's own way again
  });

  it("dropping into a taken cell swaps the two hand-placed items", () => {
    const g: BuilderNode = { id: "g", type: "stack", style: { display: "grid", gridColumns: 3 },
      children: [box("a", { gridColumn: 1, gridRow: 1 }), box("b", { gridColumn: 2, gridRow: 1 })] };
    const moved = placeInCell(g, "a", "desktop", 2, 1);
    expect(moved.children!.find((c) => c.id === "a")!.style).toMatchObject({ gridColumn: 2, gridRow: 1 });
    expect(moved.children!.find((c) => c.id === "b")!.style).toMatchObject({ gridColumn: 1, gridRow: 1 });
  });

  it("an item dropped on a cell another item was pinned to sends that one back to flowing", () => {
    const g: BuilderNode = { id: "g", type: "stack", style: { display: "grid", gridColumns: 3 },
      children: [box("a"), box("b", { gridColumn: 3, gridRow: 1, gridColumnSpan: 1 })] };
    const placed = placeInCell(g, "a", "desktop", 3, 1);
    expect(placed.children!.find((c) => c.id === "b")!.style?.gridColumn).toBeUndefined();
  });

  it("spans and lets go again", () => {
    const g = setSpan(gridContainer(3, 3), "x", "desktop", 2, 2);
    const id = g.children![0]!.id;
    const spanned = setSpan(placeInCell(g, id, "desktop", 1, 1), id, "desktop", 2, 2);
    expect(spanned.children![0]!.style).toMatchObject({ gridColumn: 1, gridRow: 1, gridColumnSpan: 2, gridRowSpan: 2 });
    expect(treeCss(spanned)).toContain(`[data-b="${id}"]{grid-column:1 / span 2;grid-row:1 / span 2}`);
    expect(autoPlace(spanned.children![0]!, "desktop").style).toBeUndefined(); // nothing left to store
  });

  it("equal widths make every child share a flex row", () => {
    const r = equalWidths(flexRow(2), "desktop", true);
    expect(r.children!.every((c) => c.style?.flexGrow === 1 && c.style?.flexBasis === 0)).toBe(true);
    expect(layoutMark(r)).toBe("flex");
  });

  it("an old row with no new settings keeps its own columns", () => {
    const row: BuilderNode = { id: "r", type: "row", style: { columns: 3 }, children: [box("1"), box("2"), box("3")] };
    expect(modeAt(row, "desktop")).toBe("grid");
    expect(columnsAt(row, "desktop")).toBe(3);
    expect(layoutMark(row)).toBeUndefined();
  });
});
