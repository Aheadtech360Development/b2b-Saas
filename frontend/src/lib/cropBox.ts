/**
 * The crop box in the image editor: how it changes when one of its handles is dragged.
 *
 * It had one handle, at the bottom-right corner. So a design could only be
 * cropped from the right and from the bottom; trimming the top or the left
 * meant dragging the whole box and then the corner, and getting it exact was
 * guesswork. A crop box has eight handles — four corners, four sides — and the
 * side opposite the one being dragged stays where it is.
 *
 * Kept apart from the component so the arithmetic can be tested on its own.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** Which handle is being dragged, by compass point. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/**
 * The box after a handle has been dragged by (dx, dy).
 *
 * `W` and `H` are the picture's size: the box never leaves it. `ratio` is
 * width over height when the shape is locked, or null when it is free.
 */
export function resizeCrop(
  start: Rect, handle: Handle, dx: number, dy: number, W: number, H: number, ratio: number | null, min = 20,
): Rect {
  const least = Math.min(min, W, H);
  const west = handle.includes("w"), east = handle.includes("e");
  const north = handle.includes("n"), south = handle.includes("s");
  let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;

  if (!ratio) {
    if (west) left = clamp(left + dx, 0, right - least);
    if (east) right = clamp(right + dx, left + least, W);
    if (north) top = clamp(top + dy, 0, bottom - least);
    if (south) bottom = clamp(bottom + dy, top + least, H);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  // A locked shape. The smallest box of that shape with no side under `least`.
  const minW = Math.max(least, least * ratio);

  if ((west || east) && (north || south)) {
    // A corner: the opposite corner is the anchor, and the box grows from it.
    const ax = west ? right : left;
    const ay = north ? bottom : top;
    const wide = west ? ax - (left + dx) : right + dx - ax;
    const tall = north ? ay - (top + dy) : bottom + dy - ay;
    const roomW = west ? ax : W - ax;
    const roomH = north ? ay : H - ay;
    // Whichever way the pointer went further decides the size.
    const w = clamp(Math.max(wide, tall * ratio), Math.min(minW, roomW, roomH * ratio), Math.min(roomW, roomH * ratio));
    const h = w / ratio;
    return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
  }

  if (west || east) {
    // A side: the width follows the pointer, the height follows the width,
    // and the box stays centred on the line it was centred on.
    const ax = west ? right : left;
    const cy = top + (bottom - top) / 2;
    const roomW = west ? ax : W - ax;
    const roomH = 2 * Math.min(cy, H - cy);
    const wide = west ? ax - (left + dx) : right + dx - ax;
    const w = clamp(wide, Math.min(minW, roomW, roomH * ratio), Math.min(roomW, roomH * ratio));
    const h = w / ratio;
    return { x: west ? ax - w : ax, y: cy - h / 2, w, h };
  }

  const ay = north ? bottom : top;
  const cx = left + (right - left) / 2;
  const roomH = north ? ay : H - ay;
  const roomW = 2 * Math.min(cx, W - cx);
  const tall = north ? ay - (top + dy) : bottom + dy - ay;
  const minH = minW / ratio;
  const h = clamp(tall, Math.min(minH, roomH, roomW / ratio), Math.min(roomH, roomW / ratio));
  const w = h * ratio;
  return { x: cx - w / 2, y: north ? ay - h : ay, w, h };
}

/** The box moved by (dx, dy), kept inside the picture. */
export function moveCrop(start: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return { ...start, x: clamp(start.x + dx, 0, Math.max(0, W - start.w)), y: clamp(start.y + dy, 0, Math.max(0, H - start.h)) };
}

/** The mouse pointer to show over a handle. */
export function cursorFor(handle: Handle): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize";
}
