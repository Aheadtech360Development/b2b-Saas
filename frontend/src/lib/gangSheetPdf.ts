/**
 * Print-ready gang sheet — opens a window the browser saves as PDF.
 *
 * The printed page IS the sheet: `@page` is set to the sheet's real dimensions
 * with no margin, so "Save as PDF" produces a file a print shop can send
 * straight to the RIP at 1:1. Nothing else is on that page — a reference number
 * or a legend printed alongside would end up on the film.
 *
 * Everything the operator needs to read lives on screen instead, above the
 * sheet, and is hidden at print time: the job reference, the customer, and the
 * artwork list with sizes and quantities. The same window also hands over the
 * original uploads, because a raster preview is not what anyone prints from.
 *
 * No PDF library and no server render — the sheet is inline SVG laid out in
 * inches, which is why it stays sharp at any size.
 */
import type { GangSheetArtwork, GangSheetPlacement } from "@/services/gangSheets.service";

interface Opts {
  reference: string;
  customerName?: string | null;
  sheet: { width_in: number; height_in: number; bleed_in: number };
  artworks: GangSheetArtwork[];
  layout: GangSheetPlacement[];
  brand?: string;
}

const RASTER = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG user units per inch. 100 keeps sub-millimetre placement exact. */
const U = 100;

export function openSheetPdf({ reference, customerName, sheet, artworks, layout, brand }: Opts): void {
  const W = sheet.width_in * U;
  const H = sheet.height_in * U;
  const bleed = sheet.bleed_in * U;
  const byId = (id: string) => artworks.find((a) => a.id === id);

  // A rotated placement occupies its swapped footprint on the sheet.
  const foot = (p: GangSheetPlacement) =>
    p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };

  const rects = layout
    .map((p) => {
      const a = byId(p.artwork_id);
      const f = foot(p);
      // The footprint is the space the piece takes on the sheet; for a quarter
      // turn that is the swapped rectangle.
      const x = p.x_in * U, y = p.y_in * U, w = f.w * U, h = f.h * U;
      const cx = x + w / 2, cy = y + h / 2;
      const isImg = a && RASTER.has((a.file_type ?? "").toLowerCase());

      if (isImg) {
        // The image is drawn at its own un-rotated size, centred in that
        // footprint, and then turned about the same centre. Drawing it into the
        // swapped rectangle *and* rotating would turn it twice and land it back
        // where it started, letterboxed.
        const nw = p.w_in * U, nh = p.h_in * U;
        const spin = p.rotation ? ` transform="rotate(${p.rotation} ${cx} ${cy})"` : "";
        return `<image href="${esc(a!.file_url)}" x="${cx - nw / 2}" y="${cy - nh / 2}" width="${nw}" height="${nh}" preserveAspectRatio="xMidYMid meet"${spin}/>`;
      }

      // A format the browser can't decode (AI/PSD/EPS) still has to hold its
      // exact footprint, so the operator can see the sheet is full.
      const cap = Math.min(w, h) / 6;
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F3F4F6" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="10 6"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${cap}" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">` +
        `${esc((a?.file_name ?? "artwork").slice(0, 20))}</text>`
      );
    })
    .join("");

  const legend = artworks
    .map((a) => {
      const placed = layout.filter((p) => p.artwork_id === a.id).length;
      return (
        `<tr><td>${esc(a.file_name)}</td>` +
        `<td>${a.width_in}&quot;&times;${a.height_in}&quot;</td>` +
        `<td style="text-align:center">${placed || a.quantity}</td>` +
        `<td><a href="${esc(a.file_url)}" download="${esc(a.file_name)}" target="_blank" rel="noopener">Download</a></td></tr>`
      );
    })
    .join("");

  const files = artworks.map((a) => ({ url: a.file_url, name: a.file_name }));
  const title = `${reference} - ${sheet.width_in}x${sheet.height_in}in`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  /* The page becomes the sheet: real size, no margin, nothing else on it. */
  @page { size: ${sheet.width_in}in ${sheet.height_in}in; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; background: #F6F6F7; }
  .job { max-width: 780px; margin: 0 auto 18px; background: #fff; border: 1px solid #E3E3E3; border-radius: 10px; padding: 18px 20px; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #666; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 0; }
  button, .btn { background: #1A1A1A; color: #fff; border: none; padding: 10px 18px; border-radius: 8px;
                 font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-block; }
  button:disabled { opacity: .55; cursor: default; }
  .btn.secondary { background: #fff; color: #1A1A1A; border: 1px solid #D6D3CC; }
  table { border-collapse: collapse; margin-top: 16px; font-size: 12px; width: 100%; }
  th, td { border: 1px solid #E4E1DB; padding: 6px 8px; text-align: left; }
  th { background: #FAFAF8; }
  .hint { font-size: 12px; color: #8A8A8A; margin-top: 10px; line-height: 1.6; }
  .wrap { max-width: 780px; margin: 0 auto; }
  /* On screen the sheet is scaled to fit; in print it is its true size. */
  svg.sheet { width: 100%; height: auto; background: #fff; border: 1px solid #C9C5BD; display: block; }

  @media print {
    body { margin: 0; padding: 0; background: #fff; }
    .job { display: none !important; }
    .wrap { max-width: none; margin: 0; }
    svg.sheet { width: ${sheet.width_in}in; height: ${sheet.height_in}in; border: none; }
  }
</style></head><body>
  <div class="job">
    <h1>${esc(brand ?? "Gang Sheet")} &mdash; ${esc(reference)}</h1>
    <div class="meta">
      ${customerName ? "Customer: " + esc(customerName) + " &middot; " : ""}
      Sheet ${sheet.width_in}&quot; &times; ${sheet.height_in}&quot; &middot; bleed ${sheet.bleed_in}&quot;
      &middot; ${layout.length} placement${layout.length === 1 ? "" : "s"}
      &middot; ${new Date().toLocaleDateString()}
    </div>
    <div class="actions">
      <button id="printBtn" disabled>Loading artwork&hellip;</button>
      <button id="dlBtn" class="btn secondary">Download artwork files (${files.length})</button>
    </div>
    <div class="hint">
      Prints at true size &mdash; ${sheet.width_in}&quot; &times; ${sheet.height_in}&quot; &mdash; with no margin, so the PDF
      goes straight to the RIP. Choose <b>Save as PDF</b> and leave scaling at 100%.
      Only the sheet is printed; this panel isn&rsquo;t.
    </div>
    ${legend ? `<table><thead><tr><th>Artwork</th><th>Print size</th><th>Qty</th><th>File</th></tr></thead><tbody>${legend}</tbody></table>` : ""}
  </div>

  <div class="wrap">
    <svg class="sheet" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
      ${rects}
      ${bleed > 0 ? `<rect x="${bleed}" y="${bleed}" width="${W - bleed * 2}" height="${H - bleed * 2}" fill="none" stroke="#E5C9C9" stroke-dasharray="${U / 8} ${U / 12}" stroke-width="1.5"/>` : ""}
    </svg>
  </div>

<script>
  // Printing before the artwork has decoded produces a blank sheet, so the
  // button stays disabled until every image is in.
  (function () {
    var btn = document.getElementById('printBtn');
    var imgs = Array.prototype.slice.call(document.querySelectorAll('svg image'));
    var left = imgs.length;
    function ready() {
      btn.disabled = false;
      btn.textContent = 'Save as PDF / Print';
      btn.onclick = function () { window.print(); };
    }
    if (!left) { ready(); return; }
    var done = function () { if (--left <= 0) ready(); };
    imgs.forEach(function (el) {
      var probe = new Image();
      probe.onload = done;
      probe.onerror = done;   // a broken file must not lock the button forever
      probe.src = el.getAttribute('href');
    });
    setTimeout(function () { if (btn.disabled) ready(); }, 8000);  // never hang
  })();

  // The originals are what actually gets printed from; one click should hand
  // over every one, not make the operator work the list row by row.
  (function () {
    var files = ${JSON.stringify(files)};
    document.getElementById('dlBtn').onclick = function () {
      files.forEach(function (f, i) {
        setTimeout(function () {
          var a = document.createElement('a');
          a.href = f.url; a.download = f.name; a.target = '_blank'; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
        }, i * 400);   // staggered: browsers drop a burst of simultaneous downloads
      });
    };
  })();
</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return; // popup blocked — caller can surface a hint
  w.document.write(html);
  w.document.close();
}
