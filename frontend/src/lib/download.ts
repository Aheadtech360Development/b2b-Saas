/**
 * Saving a file the browser would rather open.
 *
 * `<a download>` is ignored for a cross-origin URL. Artwork lives on the image
 * CDN, which is a different origin, so the attribute did nothing and a click
 * opened the picture in a new tab — leaving somebody to right-click and Save
 * As, on a file they asked to download.
 *
 * Fetching it first makes the file same-origin for the moment it is saved,
 * which is what the attribute needs. When that is not allowed — a host with
 * no CORS header, or an offline browser — the old behaviour is what is left,
 * so the link still does something rather than nothing.
 */

/**
 * The file itself, as it was uploaded, for an address on ImageKit.
 *
 * ImageKit hands out every image through its optimiser, and an image past its
 * limit (25 megapixels; a 22 x 30 inch sheet at 300 DPI is 59) comes back as
 * "Bad Request" instead of the file. A print file wants the original bytes in
 * any case, never a re-encoded copy: `tr=orig-true` asks for exactly that. Any
 * other address, one that already asks for a transformation, and a signed one
 * (the signature covers its query) are left as they are.
 */
export function originalFile(url: string): string {
  if (!/^https:\/\/ik\.imagekit\.io\//i.test(url) || /[?&](tr|ik-s)=|\/tr:/.test(url)) return url;
  const [head, hash] = url.split("#", 2) as [string, string | undefined];
  return `${head}${head.includes("?") ? "&" : "?"}tr=orig-true${hash !== undefined ? `#${hash}` : ""}`;
}

/** An ImageKit address without the transformation it asks for (a thumbnail's
 *  `tr=w-150`, a `/tr:` path): ImageKit cannot resize a file past its limit
 *  either, so the fallback is the file itself. */
function untransformed(url: string): string {
  if (!/^https:\/\/ik\.imagekit\.io\//i.test(url) || /[?&]ik-s=/.test(url)) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/tr:[^/]+/g, "");
    u.searchParams.delete("tr");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * A picture of an uploaded file that ImageKit would not deliver (one past its
 * limit fails every resize as well): show the file itself instead, once. When
 * that fails too, `giveUp` decides (hide it, or leave the broken picture where
 * a missing file has to be seen).
 */
export function showOriginalOnError(img: HTMLImageElement, giveUp?: (img: HTMLImageElement) => void): void {
  if (img.dataset.original !== "tried") {
    const original = originalFile(untransformed(img.src));
    if (original !== img.src) {
      img.dataset.original = "tried";
      img.src = original;
      return;
    }
  }
  giveUp?.(img);
}

/** showOriginalOnError as an <img>'s onError, leaving the picture as it is when the file is gone too. */
export function showOriginal(e: { currentTarget: HTMLImageElement }): void {
  showOriginalOnError(e.currentTarget);
}

/** A file name a browser will accept, from a URL or a stored name. */
export function fileNameFrom(url: string, fallback?: string): string {
  if (fallback && fallback.trim()) return sanitise(fallback);
  try {
    const path = new URL(url, window.location.href).pathname;
    // A path ending in a slash names a folder, not a file: its last segment
    // would save the artwork as "shop".
    if (path.endsWith("/")) return "download";
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const name = sanitise(decodeURIComponent(last));
    // Something with no extension is not a file name either.
    return name.includes(".") ? name : "download";
  } catch {
    return "download";
  }
}

function sanitise(name: string): string {
  // Windows refuses these outright and the rest confuse a download panel.
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * A design's own file name with whose it is in front: the order's number and
 * the customer, so a folder of downloads says which job each file came from.
 * "Guest" is not a name, and is left out.
 */
export function withOwner(fileName: string, orderNumber?: string | null, customer?: string | null): string {
  const lead = [orderNumber, customer]
    .map((part) => (part ?? "").replace(/^#/, "").trim().replace(/\s+/g, "-"))
    .filter((part) => part && part.toLowerCase() !== "guest")
    .join("-");
  return lead ? `${lead}-${fileName}` : fileName;
}

/**
 * Save this URL to the person's downloads.
 *
 * Resolves true when the file was saved, false when the browser was handed
 * the URL to open instead. Never throws: a download that fails is a tab that
 * opens, not an error screen on top of the work somebody was doing.
 */
export async function downloadFile(url: string, name?: string): Promise<boolean> {
  const filename = fileNameFrom(url, name);
  // The uploaded file itself, never ImageKit's optimised copy (originalFile).
  const source = originalFile(url);
  try {
    const response = await fetch(source, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    // Appended because Firefox will not follow a click on a detached node.
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked late: revoking in the same tick cancels the save in Safari.
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return true;
  } catch {
    window.open(source, "_blank", "noopener,noreferrer");
    return false;
  }
}
