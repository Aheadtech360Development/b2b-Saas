/**
 * Background removal for the print builders.
 *
 * It used to run in the buyer's own browser: a large model downloaded on first
 * use, then the work done on whatever they were holding — minutes on a slow
 * phone. It also shrank the artwork to 2048 px for the model and handed that
 * shrunken copy back, so a design lost print resolution by having its
 * background removed.
 *
 * Now the work is done on Cloudflare (workers/image-tools), which takes the
 * same few seconds for everybody, and the artwork keeps its size:
 *
 *   1. a copy no larger than 1536 px is sent — the model needs no more, and a
 *      small upload and a small answer are quick ones;
 *   2. what comes back says which pixels are background;
 *   3. that is applied to the full-size original here.
 *
 * The old way is still here, underneath. When the service cannot be used — it
 * has not been set up, the month's allowance is spent, the connection drops —
 * the browser does the work as before rather than the button doing nothing.
 *
 * One thing neither way handles on its own: handed a picture with no clear
 * subject, the model can return an almost entirely transparent image — the
 * buyer's design simply gone. A result that empty is refused rather than saved
 * over their file.
 */
import { apiClient } from "@/lib/api-client";

/**
 * Longest edge of the copy sent to the service. Measured, not guessed: a
 * 2048 px copy came back with the same cut-out as a 1536 px one (they differed
 * over about one pixel in a hundred, at the edges) and took up to twice as
 * long, most of it downloading a larger answer.
 */
const SERVICE_EDGE = 1536;

/** Longest edge handed to the model in the browser. Beyond this the CPU path stalls for minutes. */
const MODEL_EDGE = 2048;

/** A result with less opaque area than this almost certainly ate the design. */
const MIN_OPAQUE_RATIO = 0.02;

/** How long to wait for the service before doing the work here instead. */
const SERVICE_TIMEOUT_MS = 60_000;

export interface RemovalProgress {
  /** 0–1, or null while the step has no measurable size. */
  ratio: number | null;
  /** What is happening, in words a buyer can read. */
  label: string;
}

export class BackgroundRemovalError extends Error {}

/** The service could not do it this time; the browser takes over. */
class ServiceUnavailable extends Error {}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new BackgroundRemovalError("That image could not be read."));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, quality));
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

// ── On Cloudflare ────────────────────────────────────────────────────────────

/**
 * Have the service remove the background, and keep the artwork's own size.
 *
 * Throws `ServiceUnavailable` for anything that means "not this way, this
 * time", so the caller can fall back to the browser.
 */
async function removeOnService(file: File, onProgress?: (p: RemovalProgress) => void): Promise<Blob> {
  onProgress?.({ ratio: null, label: "Preparing your image" });
  const url = URL.createObjectURL(file);
  try {
    const original = await loadImage(url);
    const W = original.naturalWidth, H = original.naturalHeight;
    if (!W || !H) throw new ServiceUnavailable("no size");

    // The copy the model sees. On white, because a JPEG has no transparency and
    // a design that is already partly see-through should not turn black.
    const scale = Math.min(1, SERVICE_EDGE / Math.max(W, H));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(W * scale));
    small.height = Math.max(1, Math.round(H * scale));
    const sctx = small.getContext("2d");
    if (!sctx) throw new ServiceUnavailable("no canvas");
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, small.width, small.height);
    sctx.drawImage(original, 0, 0, small.width, small.height);
    const copy = await toBlob(small, "image/jpeg", 0.92);
    if (!copy) throw new ServiceUnavailable("no copy");

    let ticket: { url: string; ticket: string };
    try {
      ticket = await apiClient.post<{ url: string; ticket: string }>("/api/v1/upload/cutout-ticket", {});
    } catch {
      // Not set up, or over a limit: either way the browser can still do it.
      throw new ServiceUnavailable("no ticket");
    }

    onProgress?.({ ratio: null, label: "Removing the background" });
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), SERVICE_TIMEOUT_MS);
    let cut: HTMLImageElement;
    let cutBlob: Blob;
    try {
      const res = await fetch(ticket.url, {
        method: "POST",
        body: copy,
        headers: { "content-type": "image/jpeg", "x-ticket": ticket.ticket },
        signal: stop.signal,
      });
      if (!res.ok) throw new ServiceUnavailable(`service said ${res.status}`);
      cutBlob = await res.blob();
    } catch (err) {
      throw err instanceof ServiceUnavailable ? err : new ServiceUnavailable("no answer");
    } finally {
      window.clearTimeout(timer);
    }

    onProgress?.({ ratio: null, label: "Finishing" });
    const cutUrl = URL.createObjectURL(cutBlob);
    try {
      cut = await loadImage(cutUrl);
      // The original, at its own size, kept only where the result is solid.
      const full = document.createElement("canvas");
      full.width = W;
      full.height = H;
      const fctx = full.getContext("2d");
      if (fctx) {
        fctx.drawImage(original, 0, 0);
        fctx.globalCompositeOperation = "destination-in";
        fctx.imageSmoothingEnabled = true;
        fctx.imageSmoothingQuality = "high";
        fctx.drawImage(cut, 0, 0, W, H);
        const out = await toBlob(full, "image/png");
        if (out) return out;
      }
      // A canvas this large is more than some phones will make. The smaller
      // result is still a clean cut-out, which is better than none.
      return cutBlob;
    } finally {
      URL.revokeObjectURL(cutUrl);
    }
  } catch (err) {
    if (err instanceof ServiceUnavailable) throw err;
    if (err instanceof BackgroundRemovalError) throw new ServiceUnavailable(err.message);
    throw new ServiceUnavailable("failed");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── In the browser (the fallback) ────────────────────────────────────────────

/** Shrink to MODEL_EDGE if needed; the original is returned untouched otherwise. */
async function shrinkForModel(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MODEL_EDGE) return file;

    const scale = MODEL_EDGE / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await toBlob(canvas, "image/png");
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/png" });
  } catch {
    return file;               // unreadable here is the model's problem, not ours
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The model, run on the buyer's own device.
 *
 * Two things the library does not handle on its own. It only moves the work
 * to a Web Worker when WebGPU is available, so asking for the GPU is also what
 * keeps the tab from freezing; and without one the CPU path stalls for minutes
 * on a large photo, which is why the input is shrunk first.
 */
async function removeInBrowser(file: File, onProgress?: (p: RemovalProgress) => void): Promise<Blob> {
  const input = await shrinkForModel(file);
  const { removeBackground } = await import("@imgly/background-removal");

  return removeBackground(input, {
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
  let out: Blob;
  try {
    out = await removeOnService(file, onProgress);
  } catch (err) {
    if (!(err instanceof ServiceUnavailable)) throw err;
    out = await removeInBrowser(file, onProgress);
  }

  if (await opaqueRatio(out) < MIN_OPAQUE_RATIO) {
    throw new BackgroundRemovalError(
      "We couldn't find a clear subject in this image, so removing the background would have erased it. " +
      "Your design is unchanged — try an image where the subject stands out from its background.",
    );
  }

  const name = file.name.replace(/\.\w+$/, "") + "-nobg.png";
  return new File([out], name, { type: "image/png" });
}
