/**
 * A print file comes back as the file that was uploaded.
 *
 * Innterflow's order 1011 (2026-11-06): the buyer's own 22 x 30 sheet, a 27.5
 * megapixel PNG, answered "Bad Request" on download, because ImageKit sends
 * every image through its optimiser and refuses one past 25 megapixels. With
 * `tr=orig-true` ImageKit sends the uploaded file itself. Every download and
 * every link to an uploaded file asks for that; nothing else is touched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, originalFile, showOriginalOnError } from "@/lib/download";

const SHEET = "https://ik.imagekit.io/9vhlgquzw/tenants/innterflow/Dise%C3%B1o_sin_t%C3%ADtulo_Q_x8PIEJw.png";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("the file as it was uploaded", () => {
  it("asks ImageKit for the original, keeping what the address already says", () => {
    expect(originalFile(SHEET)).toBe(`${SHEET}?tr=orig-true`);
    expect(originalFile(`${SHEET}?updatedAt=1`)).toBe(`${SHEET}?updatedAt=1&tr=orig-true`);
    expect(originalFile(`${SHEET}#top`)).toBe(`${SHEET}?tr=orig-true#top`);
  });

  it("leaves alone a transformation already asked for, a signed address, and anything not on ImageKit", () => {
    for (const url of [
      `${SHEET}?tr=w-300`, "https://ik.imagekit.io/9vhlgquzw/tr:w-300/tenants/innterflow/a.png",
      `${SHEET}?ik-s=abc&ik-t=1`, "https://cdn.example.com/a.png", "/api/v1/gang-sheets/x/print", "",
    ]) expect(originalFile(url)).toBe(url);
  });

  it("a picture ImageKit will not deliver shows the file itself, once, and is given up after that", () => {
    const img = document.createElement("img");
    img.src = "https://ik.imagekit.io/9vhlgquzw/tr:w-150/tenants/innterflow/sheet.png?tr=w-300";
    const giveUp = vi.fn();
    showOriginalOnError(img, giveUp);
    expect(img.src).toBe("https://ik.imagekit.io/9vhlgquzw/tenants/innterflow/sheet.png?tr=orig-true");
    expect(giveUp).not.toHaveBeenCalled();
    showOriginalOnError(img, giveUp);
    expect(giveUp).toHaveBeenCalledWith(img);

    // A file on the shop's own server has no other copy to show: given up at once.
    const lost = document.createElement("img");
    lost.src = "https://b2b-saas-production.up.railway.app/media/artwork/x/Dise%C3%B1o%20sin%20t%C3%ADtulo.png";
    const hide = vi.fn();
    showOriginalOnError(lost, hide);
    expect(hide).toHaveBeenCalledWith(lost);
    expect(lost.src).toContain("/media/artwork/x/");
  });

  it("downloads the original under the name given, and opens the original if the download is refused", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(url); return new Response(new Blob(["png"]), { status: 200 }); }));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await downloadFile(SHEET, "1011-Iris-chavez-sheet.png")).toBe(true);
    expect(seen).toEqual([`${SHEET}?tr=orig-true`]);
    expect(click).toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad Request", { status: 400 })));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    expect(await downloadFile(SHEET)).toBe(false);
    expect(open).toHaveBeenCalledWith(`${SHEET}?tr=orig-true`, "_blank", "noopener,noreferrer");
  });
});
