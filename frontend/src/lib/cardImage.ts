/**
 * A product card's picture at the size a grid shows it, not the 1600 × 2000
 * original: ImageKit resizes it and sends WebP or AVIF to a browser that takes
 * them (`f-auto`), in three widths for the browser to choose from (dev fix
 * list, item 34, Core Web Vitals).
 *
 * Only an ImageKit address that asks for nothing yet: one that already names
 * a transformation or is signed (the signature covers its query) is left as
 * it is, and so is any other host (a supplier's own pictures).
 */
const WIDTHS = [320, 480, 720] as const;

function isPlainImageKit(url: string): boolean {
  return /^https:\/\/ik\.imagekit\.io\//i.test(url) && !/[?&](tr|ik-s)=|\/tr:/.test(url);
}

function sized(url: string, width: number): string {
  const [head, hash] = url.split("#", 2) as [string, string | undefined];
  return `${head}${head.includes("?") ? "&" : "?"}tr=w-${width},f-auto${hash !== undefined ? `#${hash}` : ""}`;
}

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  if (!isPlainImageKit(url)) return { src: url };
  return {
    src: sized(url, 480),
    srcSet: WIDTHS.map((w) => `${sized(url, w)} ${w}w`).join(", "),
    // A grid card is a column of the page: half the screen on a phone, a
    // quarter or so on a desktop.
    sizes: "(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 300px",
  };
}
