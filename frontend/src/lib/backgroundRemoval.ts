/**
 * Background removal, without freezing the tab or eating the artwork.
 *
 * Two things the library does not handle on its own:
 *
 * 1. It only moves the work to a Web Worker when WebGPU is available
 *    (`proxyToWorker = useWebGPU && config.proxyToWorker` in its own source).
 *    Without WebGPU the model runs on the main thread, and on a large photo the
 *    browser puts up "Page Unresponsive". Asking for the GPU gets the worker;
 *    shrinking the input first is what keeps the CPU path survivable when there
 *    isn't one.
 *
 * 2. The model looks for a subject. Handed a photo with no clear subject it can
 *    return an almost entirely transparent image — the buyer's design simply
 *    gone. A result that empty is refused rather than saved over their file.
 */

/** Longest edge handed to the model. Beyond this the CPU path stalls for minutes. */
const MAX_EDGE = 2048;

/** A result with less opaque area than this almost certainly ate the design. */
const MIN_OPAQUE_RATIO = 0.02;

export interface RemovalProgress {
  /** 0–1, or null while the step has no measurable size. */
  ratio: number | null;
  /** What is happening, in words a buyer can read. */
  label: string;
}

export class BackgroundRemovalError extends Error {}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new BackgroundRemovalError("That image could not be read."));
    img.src = src;
  });
}

/** Shrink to MAX_EDGE if needed; the original is returned untouched otherwise. */
async function shrinkForModel(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MAX_EDGE) return file;

    const scale = MAX_EDGE / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/png" });
  } catch {
    return file;               // unreadable here is the model's problem, not ours
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How much of the result is actually opaque, 0–1. */
async function opaqueRatio(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    // Sampling a small copy is enough to tell "empty" from "has a subject", and
    // avoids reading millions of pixels to answer a yes/no question.
    const w = Math.max(1, Math.min(160, img.naturalWidth));
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w) || 1);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 1;
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 16) opaque++;
    return opaque / (w * h);
  } catch {
    return 1;                  // can't tell — don't block the buyer
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Strip the background from `file`.
 *
 * Throws `BackgroundRemovalError` with a message worth showing when the model
 * can't find a subject, so the caller can keep the original artwork.
 */
export async function removeImageBackground(
  file: File,
  onProgress?: (p: RemovalProgress) => void,
): Promise<File> {
  const input = await shrinkForModel(file);
  const { removeBackground } = await import("@imgly/background-removal");

  const out = await removeBackground(input, {
    // Ask for the GPU: it is also what gets the work off the main thread.
    device: "gpu",
    proxyToWorker: true,
    // Half-precision — a smaller download and quicker inference, with no
    // difference that matters on a print cut-out.
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key: string, current: number, total: number) => {
      const downloading = key.toLowerCase().includes("fetch") || key.toLowerCase().includes("download");
      onProgress?.({
        ratio: total > 0 ? Math.min(1, current / total) : null,
        label: downloading ? "Downloading the tool" : "Removing the background",
      });
    },
  });

  if (await opaqueRatio(out) < MIN_OPAQUE_RATIO) {
    throw new BackgroundRemovalError(
      "We couldn't find a clear subject in this image, so removing the background would have erased it. " +
      "Your design is unchanged — try an image where the subject stands out from its background.",
    );
  }

  const name = file.name.replace(/\.\w+$/, "") + "-nobg.png";
  return new File([out], name, { type: "image/png" });
}
