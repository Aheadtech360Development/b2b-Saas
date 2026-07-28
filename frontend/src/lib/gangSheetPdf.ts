/**
 * Printable gang sheet preview — opens a self-contained print window that the
 * browser turns into a PDF via "Save as PDF". Zero dependencies (no PDF lib, no
 * backend render): the sheet is drawn to scale as inline SVG with every
 * placement, its size and quantity, plus the order reference and customer name.
 *
 * Shared by the customer preview and the admin download so both see the same
 * sheet. Raster artwork shows a thumbnail; formats a browser can't decode
 * (AI/PSD/EPS) show a labelled box at the correct size.
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

const RASTER = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function openSheetPdf({ reference, customerName, sheet, artworks, layout, brand }: Opts): void {
  // Draw at a fixed scale, capped so a long sheet still fits a printable page.
  const PPI = Math.min(9, 700 / sheet.width_in);
  const W = sheet.width_in * PPI;
  const H = sheet.height_in * PPI;
  const bleed = sheet.bleed_in * PPI;
  const byId = (id: string) => artworks.find((a) => a.id === id);

  const foot = (p: GangSheetPlacement) =>
    p.rotation % 180 === 0 ? { w: p.w_in, h: p.h_in } : { w: p.h_in, h: p.w_in };

  const rects = layout
    .map((p) => {
      const a = byId(p.artwork_id);
      const f = foot(p);
      const x = p.x_in * PPI, y = p.y_in * PPI, w = f.w * PPI, h = f.h * PPI;
      const isImg = a && RASTER.has((a.file_type ?? "").toLowerCase());
      const label = `${f.w}&quot;×${f.h}&quot;`;
      const inner = isImg
        ? `<image href="${esc(a!.file_url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#EEF2FF"/>` +
          `<text x="${x + w / 2}" y="${y + h / 2}" font-size="8" fill="#4338CA" text-anchor="middle">${esc((a?.file_name ?? "art").slice(0, 14))}</text>`;
      return (
        inner +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#9AA3B2" stroke-width="0.7"/>` +
        `<text x="${x + 2}" y="${y + 9}" font-size="7" fill="#334">${label}</text>`
      );
    })
    .join("");

  // Per-artwork legend (name · size · qty placed).
  const legend = artworks
    .map((a) => {
      const placed = layout.filter((p) => p.artwork_id === a.id).length;
      return `<tr><td>${esc(a.file_name)}</td><td>${a.width_in}&quot;×${a.height_in}&quot;</td><td style="text-align:center">${placed || a.quantity}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gang Sheet ${esc(reference)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#1a1a1a;margin:24px}
  h1{font-size:18px;margin:0 0 2px} .meta{font-size:12px;color:#666;margin-bottom:16px}
  .sheet{border:1px solid #C9C5BD;display:inline-block;background:#fff}
  table{border-collapse:collapse;margin-top:16px;font-size:12px;width:100%;max-width:520px}
  th,td{border:1px solid #E4E1DB;padding:6px 8px;text-align:left} th{background:#FAFAF8}
  .bar{margin-bottom:14px} button{background:#1B3A5C;color:#fff;border:none;padding:9px 18px;border-radius:6px;font-weight:600;cursor:pointer}
  @media print{.bar{display:none}}
</style></head><body>
  <div class="bar"><button onclick="window.print()">Save as PDF / Print</button></div>
  <h1>${esc(brand ?? "Gang Sheet")} — ${esc(reference)}</h1>
  <div class="meta">
    ${customerName ? "Customer: " + esc(customerName) + " · " : ""}
    Sheet ${sheet.width_in}&quot; × ${sheet.height_in}&quot; · bleed ${sheet.bleed_in}&quot; · ${new Date().toLocaleDateString()}
  </div>
  <svg class="sheet" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
    ${bleed > 0 ? `<rect x="${bleed}" y="${bleed}" width="${W - bleed * 2}" height="${H - bleed * 2}" fill="none" stroke="#D08C8C" stroke-dasharray="4 3" stroke-width="0.7"/>` : ""}
    ${rects}
  </svg>
  ${legend ? `<table><thead><tr><th>Artwork</th><th>Print size</th><th>Qty</th></tr></thead><tbody>${legend}</tbody></table>` : ""}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return; // popup blocked — caller can surface a hint
  w.document.write(html);
  w.document.close();
}
