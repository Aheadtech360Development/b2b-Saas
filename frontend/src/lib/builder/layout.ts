/**
 * The layout engine's editing operations: what a container is laid out as on
 * each device, the grid presets, and placing children in cells.
 *
 * Pure, like tree.ts: every operation returns a new node, which is what undo
 * keeps. Layout is ordinary style data on the existing tree — `display`,
 * `gridColumns`, `gridColumn` … in a node's style / tablet / mobile — so a
 * smaller screen inherits a larger one's layout until somebody changes it
 * there, and saving, versions and publishing need nothing new.
 */
import type { Breakpoint, BuilderNode, LayoutMode, NodeStyle } from "./types";
import { gridColumnsAt } from "./style";
import { newId } from "./tree";

export const LAYOUT_CONTAINERS = new Set(["section", "stack", "column", "row"]);

const BP_KEY: Record<Breakpoint, "style" | "tablet" | "mobile"> = { desktop: "style", tablet: "tablet", mobile: "mobile" };
const CHAIN: Record<Breakpoint, ("style" | "tablet" | "mobile")[]> = {
  desktop: ["style"], tablet: ["tablet", "style"], mobile: ["mobile", "tablet", "style"],
};

/** The mark a container's element carries when it has a layout set. */
export function layoutMark(node: BuilderNode): LayoutMode | undefined {
  for (const k of ["style", "tablet", "mobile"] as const) {
    const d = (node[k] as Record<string, unknown> | undefined)?.display;
    if (d === "grid" || d === "flex") return d;
  }
  return undefined;
}

/** What a container is laid out as when nothing is set: its type's own way. */
export function defaultMode(type: string): LayoutMode | "block" {
  return type === "row" ? "grid" : type === "stack" ? "flex" : "block";
}

/** A style value as a device sees it: set there, or inherited from a larger screen. */
export function valueAt(node: BuilderNode, bp: Breakpoint, key: keyof NodeStyle): string | number | undefined {
  for (const k of CHAIN[bp]) {
    const v = (node[k] as NodeStyle | undefined)?.[key];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

/** Whether a value is set on this device itself, rather than inherited. */
export function ownValue(node: BuilderNode, bp: Breakpoint, key: keyof NodeStyle): string | number | undefined {
  return (node[BP_KEY[bp]] as NodeStyle | undefined)?.[key];
}

export function modeAt(node: BuilderNode, bp: Breakpoint): LayoutMode | "block" {
  const d = valueAt(node, bp, "display");
  return d === "grid" || d === "flex" ? d : d === "block" ? "block" : defaultMode(node.type);
}

/** Change some style keys on one device; undefined removes a key (back to inheriting). */
export function setAt(node: BuilderNode, bp: Breakpoint, patch: Partial<Record<keyof NodeStyle, string | number | undefined>>): BuilderNode {
  const key = BP_KEY[bp];
  const next: NodeStyle = { ...(node[key] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete next[k as keyof NodeStyle];
    else next[k as keyof NodeStyle] = v;
  }
  const out: BuilderNode = { ...node };
  if (Object.keys(next).length) out[key] = next; else delete out[key];
  return out;
}

export interface GridPreset { key: string; label: string; cols: number; rows: number }

/** Rows 0 means "as many as the items need". */
export const GRID_PRESETS: GridPreset[] = [
  { key: "1x1", label: "1×1", cols: 1, rows: 1 },
  { key: "2", label: "2 columns", cols: 2, rows: 0 },
  { key: "3", label: "3 columns", cols: 3, rows: 0 },
  { key: "4", label: "4 columns", cols: 4, rows: 0 },
  { key: "2x2", label: "2×2", cols: 2, rows: 2 },
  { key: "3x2", label: "3×2", cols: 3, rows: 2 },
  { key: "2x3", label: "2×3", cols: 2, rows: 3 },
  { key: "3x3", label: "3×3", cols: 3, rows: 3 },
  { key: "4x2", label: "4×2", cols: 4, rows: 2 },
  { key: "4x3", label: "4×3", cols: 4, rows: 3 },
  { key: "6", label: "6 columns", cols: 6, rows: 0 },
];

/** An empty cell: a column a grid places like any other child. */
export function makeCell(n: number): BuilderNode {
  return { id: newId(), type: "column", name: `Cell ${n}`, props: {}, style: {}, children: [] };
}

/**
 * Put a container on a grid of `cols` × `rows`. On desktop, and when asked,
 * empty cells are added so every cell of the grid is there to drop into —
 * never more children than it needs, and never anything taken away.
 */
export function applyGrid(node: BuilderNode, bp: Breakpoint, cols: number, rows: number, fill = false): BuilderNode {
  let next = setAt(node, bp, {
    display: "grid", gridColumns: cols, gridRows: rows > 0 ? rows : undefined,
    gridAuto: undefined, gridTemplate: undefined,
  });
  if (fill && LAYOUT_CONTAINERS.has(node.type)) {
    const want = cols * Math.max(1, rows);
    const have = next.children?.length ?? 0;
    if (have < want) {
      next = { ...next, children: [...(next.children ?? []), ...Array.from({ length: want - have }, (_, i) => makeCell(have + i + 1))] };
    }
  }
  return next;
}

export function applyFlex(node: BuilderNode, bp: Breakpoint, direction: "row" | "column"): BuilderNode {
  return setAt(node, bp, { display: "flex", flexDirection: direction });
}

/** Back to the container type's own layout on this device. */
export function clearLayout(node: BuilderNode, bp: Breakpoint): BuilderNode {
  return setAt(node, bp, {
    display: undefined, gridColumns: undefined, gridRows: undefined, gridAuto: undefined, gridMin: undefined,
    gridTemplate: undefined, gridAutoFlow: undefined, justifyItems: undefined, alignContent: undefined,
  });
}

/** Every child the same width in a flex row: grow from a zero basis. */
export function equalWidths(node: BuilderNode, bp: Breakpoint, on: boolean): BuilderNode {
  return {
    ...node,
    children: (node.children ?? []).map((c) => setAt(c, bp, on ? { flexGrow: 1, flexBasis: 0 } : { flexGrow: undefined, flexBasis: undefined })),
  };
}

/** How many columns a grid container has on a device (null: fit-to-width or custom widths). */
export function columnsAt(node: BuilderNode, bp: Breakpoint): number | null {
  if (node.type === "row" && valueAt(node, bp, "gridColumns") === undefined) {
    const n = Number(valueAt(node, bp, "columns") ?? (node.children?.length || 2));
    return Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 2;
  }
  return gridColumnsAt(node)[bp];
}

interface Area { col: number; row: number; colSpan: number; rowSpan: number }

function areaAt(child: BuilderNode, bp: Breakpoint): Area | null {
  const col = Number(valueAt(child, bp, "gridColumn"));
  const row = Number(valueAt(child, bp, "gridRow"));
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) return null;
  return {
    col, row,
    colSpan: Math.max(1, Number(valueAt(child, bp, "gridColumnSpan") ?? 1) || 1),
    rowSpan: Math.max(1, Number(valueAt(child, bp, "gridRowSpan") ?? 1) || 1),
  };
}

const covers = (a: Area, col: number, row: number) =>
  col >= a.col && col < a.col + a.colSpan && row >= a.row && row < a.row + a.rowSpan;

/**
 * Put one child in a cell, on one device. If another child was placed by hand
 * in that cell, it takes the moved child's old cell (a swap), or goes back to
 * flowing with the rest when the moved child had none — two items never end
 * up drawn on top of each other. Children nobody placed rearrange themselves
 * around it: that is how a grid fills its remaining cells.
 */
export function placeInCell(parent: BuilderNode, childId: string, bp: Breakpoint, col: number, row: number): BuilderNode {
  const kids = parent.children ?? [];
  const moving = kids.find((k) => k.id === childId);
  if (!moving) return parent;
  const was = areaAt(moving, bp);
  const children = kids.map((k) => {
    if (k.id === childId) return setAt(k, bp, { gridColumn: col, gridRow: row });
    const a = areaAt(k, bp);
    if (a && covers(a, col, row)) {
      return was ? setAt(k, bp, { gridColumn: was.col, gridRow: was.row }) : setAt(k, bp, { gridColumn: undefined, gridRow: undefined });
    }
    return k;
  });
  return { ...parent, children };
}

/** Span a child over more cells, on one device. */
export function setSpan(parent: BuilderNode, childId: string, bp: Breakpoint, colSpan: number, rowSpan: number): BuilderNode {
  return {
    ...parent,
    children: (parent.children ?? []).map((k) => (k.id === childId
      ? setAt(k, bp, { gridColumnSpan: colSpan > 1 ? colSpan : undefined, gridRowSpan: rowSpan > 1 ? rowSpan : undefined })
      : k)),
  };
}

/** Let a child flow with the rest again on one device. */
export function autoPlace(child: BuilderNode, bp: Breakpoint): BuilderNode {
  return setAt(child, bp, { gridColumn: undefined, gridRow: undefined, gridColumnSpan: undefined, gridRowSpan: undefined });
}

// ── Ready-made layout containers for the Add panel ───────────────────────────

/** A grid of empty cells, ready to drop into. */
export function gridContainer(cols: number, rows: number): BuilderNode {
  return {
    id: newId(), type: "stack", name: `Grid ${cols}×${rows}`, props: { direction: "column" },
    style: { display: "grid", gridColumns: cols, gridRows: rows, gap: "16px" },
    children: Array.from({ length: cols * rows }, (_, i) => makeCell(i + 1)),
  };
}

/** Boxes side by side that share the width, and stack on a phone. */
export function flexRow(boxes = 3): BuilderNode {
  return {
    id: newId(), type: "stack", name: "Flex row", props: { direction: "row" },
    style: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "16px", alignItems: "stretch" },
    mobile: { flexDirection: "column" },
    children: Array.from({ length: boxes }, (_, i) => ({ ...makeCell(i + 1), name: `Box ${i + 1}`, style: { flexGrow: 1, flexBasis: 0 } })),
  };
}

export function flexColumn(boxes = 2): BuilderNode {
  return {
    id: newId(), type: "stack", name: "Flex column", props: { direction: "column" },
    style: { display: "flex", flexDirection: "column", gap: "16px" },
    children: Array.from({ length: boxes }, (_, i) => ({ ...makeCell(i + 1), name: `Box ${i + 1}` })),
  };
}

export const LAYOUT_PRESETS: { key: string; label: string; blurb: string; cols?: number; rows?: number; create: () => BuilderNode }[] = [
  { key: "grid-2x2", label: "Grid 2×2", blurb: "Four cells to drop things into.", cols: 2, rows: 2, create: () => gridContainer(2, 2) },
  { key: "grid-3x3", label: "Grid 3×3", blurb: "Nine cells.", cols: 3, rows: 3, create: () => gridContainer(3, 3) },
  { key: "grid-4x3", label: "Grid 4×3", blurb: "Twelve cells — a card wall.", cols: 4, rows: 3, create: () => gridContainer(4, 3) },
  { key: "grid-3", label: "3 columns", blurb: "Three cells across, as many rows as needed.", cols: 3, rows: 1, create: () => gridContainer(3, 1) },
  { key: "flex-row", label: "Flex row", blurb: "Boxes side by side, sharing the width; stacked on phones.", create: () => flexRow() },
  { key: "flex-column", label: "Flex column", blurb: "Boxes one under another, with even spacing.", create: () => flexColumn() },
];
