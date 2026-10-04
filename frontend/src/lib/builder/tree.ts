/**
 * Operations on a builder tree. Pure: each returns a new tree and leaves the
 * one it was given alone, which is what makes undo a matter of keeping the
 * old one.
 *
 * The containment rules mirror the server's (schema.py COMPONENTS): a row
 * holds only columns, and only sections, stacks and columns hold anything at
 * all. The editor enforces them as the merchant works, so a publish is never
 * the first place they find out.
 */
import type { BuilderNode } from "./types";

/** Types that can hold other elements, and what they may hold. */
const CONTAINERS: Record<string, ((child: string) => boolean) | undefined> = {
  section: (t) => t !== "section",
  stack: () => true,
  column: (t) => t !== "section",
  row: (t) => t === "column",
};

export function isContainer(type: string): boolean {
  return type in CONTAINERS;
}

export function canContain(parentType: string, childType: string): boolean {
  const rule = CONTAINERS[parentType];
  return !!rule && rule(childType);
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** A short id, unique enough for one site and safe in a CSS attribute selector. */
export function newId(): string {
  let out = "b";
  const bytes = typeof crypto !== "undefined" && "getRandomValues" in crypto
    ? crypto.getRandomValues(new Uint8Array(9))
    : Uint8Array.from({ length: 9 }, () => Math.floor(Math.random() * 256));
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function findNode(root: BuilderNode | null | undefined, id: string): BuilderNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

/** The chain from the root down to a node, both included. Empty when absent. */
export function pathTo(root: BuilderNode | null | undefined, id: string): BuilderNode[] {
  if (!root) return [];
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const rest = pathTo(child, id);
    if (rest.length) return [root, ...rest];
  }
  return [];
}

export function parentOf(root: BuilderNode | null | undefined, id: string): { parent: BuilderNode; index: number } | null {
  const path = pathTo(root, id);
  if (path.length < 2) return null;
  const parent = path[path.length - 2]!;
  return { parent, index: (parent.children ?? []).findIndex((c) => c.id === id) };
}

/** Every node, depth first. */
export function walk(root: BuilderNode | null | undefined, visit: (n: BuilderNode, depth: number) => void, depth = 0): void {
  if (!root) return;
  visit(root, depth);
  for (const child of root.children ?? []) walk(child, visit, depth + 1);
}

export function countNodes(root: BuilderNode | null | undefined): number {
  let n = 0;
  walk(root, () => { n++; });
  return n;
}

/** A deep copy with every id replaced, so a copy never collides with its original. */
export function withFreshIds(node: BuilderNode): BuilderNode {
  return {
    ...structuredClone(node),
    id: newId(),
    children: node.children?.map(withFreshIds),
  };
}

function mapTree(root: BuilderNode, fn: (n: BuilderNode) => BuilderNode | null): BuilderNode | null {
  const mapped = fn(root);
  if (!mapped) return null;
  if (!mapped.children) return mapped;
  const children: BuilderNode[] = [];
  for (const child of mapped.children) {
    const next = mapTree(child, fn);
    if (next) children.push(next);
  }
  return { ...mapped, children };
}

export function updateNode(root: BuilderNode, id: string, change: (n: BuilderNode) => BuilderNode): BuilderNode {
  return mapTree(root, (n) => (n.id === id ? change(n) : n)) ?? root;
}

/** Remove a node. The root itself cannot be removed — a template is never empty of structure. */
export function removeNode(root: BuilderNode, id: string): BuilderNode {
  if (root.id === id) return root;
  return mapTree(root, (n) => (n.id === id ? null : n)) ?? root;
}

export type Position = "before" | "after" | "inside";

/**
 * Put `node` relative to `targetId`.
 *
 * Wraps it in whatever structure the spot needs instead of refusing: a
 * heading dropped straight onto a page gets a section of its own; anything
 * other than a column dropped into a row goes into that row's first column.
 * A merchant should never have to know a page is sections of rows of
 * columns to put a heading on it.
 *
 * Returns the new tree and the id that ended up selected, or null when the
 * drop makes no sense at all (into a heading, say).
 */
export function insertNode(
  root: BuilderNode, node: BuilderNode, targetId: string, position: Position,
): { tree: BuilderNode; id: string } | null {
  const target = findNode(root, targetId);
  if (!target) return null;

  let parent: BuilderNode;
  let index: number;
  if (position === "inside") {
    if (!isContainer(target.type)) {
      // Dropped onto a leaf: treat it as "after that leaf".
      return insertNode(root, node, targetId, "after");
    }
    parent = target;
    index = (target.children ?? []).length;
  } else {
    const found = parentOf(root, targetId);
    if (!found) {
      // Before/after the root means into the root.
      return insertNode(root, node, targetId, "inside");
    }
    parent = found.parent;
    index = found.index + (position === "after" ? 1 : 0);
  }

  let placed = node;
  if (!canContain(parent.type, node.type)) {
    // Anything but a column dropped into a row goes into its first column,
    // which a valid row always has.
    const first = parent.type === "row" ? parent.children?.[0] : undefined;
    return first ? insertNode(root, node, first.id, "inside") : null;
  }

  // A loose element at the top of a page or template: give it a section, so
  // it gets the page's width and spacing like everything else.
  if (parent.type === "stack" && parent.id === root.id && node.type !== "section" && node.type !== "global_ref") {
    placed = {
      id: newId(), type: "section", props: { width: "contained" },
      style: { paddingTop: "48px", paddingBottom: "48px" }, children: [node],
    };
  }

  const tree = updateNode(root, parent.id, (p) => {
    const children = [...(p.children ?? [])];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, placed);
    return { ...p, children };
  });
  return { tree, id: node.id };
}

/** Move a node. Refuses to move a node into itself or its own children. */
export function moveNode(
  root: BuilderNode, id: string, targetId: string, position: Position,
): { tree: BuilderNode; id: string } | null {
  if (id === targetId || id === root.id) return null;
  const node = findNode(root, id);
  if (!node) return null;
  if (findNode(node, targetId)) return null;
  const without = removeNode(root, id);
  return insertNode(without, node, targetId, position);
}

/** One step up or down among its siblings. */
export function nudge(root: BuilderNode, id: string, delta: -1 | 1): BuilderNode {
  const found = parentOf(root, id);
  if (!found) return root;
  const { parent, index } = found;
  const next = index + delta;
  const siblings = parent.children ?? [];
  if (next < 0 || next >= siblings.length) return root;
  return updateNode(root, parent.id, (p) => {
    const children = [...(p.children ?? [])];
    const [moved] = children.splice(index, 1);
    children.splice(next, 0, moved!);
    return { ...p, children };
  });
}

/** A copy of a node placed straight after it, with new ids throughout. */
export function duplicateNode(root: BuilderNode, id: string): { tree: BuilderNode; id: string } | null {
  if (id === root.id) return null;
  const node = findNode(root, id);
  if (!node) return null;
  const copy = withFreshIds(node);
  const found = parentOf(root, id)!;
  const tree = updateNode(root, found.parent.id, (p) => {
    const children = [...(p.children ?? [])];
    children.splice(found.index + 1, 0, copy);
    return { ...p, children };
  });
  return { tree, id: copy.id };
}
