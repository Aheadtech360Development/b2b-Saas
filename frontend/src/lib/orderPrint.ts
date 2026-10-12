/**
 * What the shop prints for an order: a pick list for whoever pulls and prints
 * the goods, and a packing slip that goes in the parcel.
 *
 * Both are plain pages built from the order as the server gives it and sent to
 * the browser's own print dialog through a hidden frame, so nothing is drawn
 * over the admin and nothing has to be closed afterwards.
 */

export interface PrintLine {
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  /** A configured line's chosen options, as "Option: value". */
  options?: string[];
  /** A gang sheet line: its reference and size. */
  sheet?: string | null;
}

export interface PrintOrder {
  order_number: string;
  created_at: string;
  customer: string;
  email?: string | null;
  phone?: string | null;
  method: string;
  po_number?: string | null;
  note?: string | null;
  address: string[];
  lines: PrintLine[];
}

const esc = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};

const CSS = `
  * { box-sizing: border-box; }
  body { font: 13px/1.45 -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 24px 28px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 0; }
  .muted { color: #555; }
  .order { page-break-after: always; break-after: page; }
  .order:last-child { page-break-after: auto; break-after: auto; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .cols { display: flex; gap: 32px; margin-bottom: 14px; }
  .cols > div { flex: 1; }
  .label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #555; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #555; border-bottom: 1px solid #999; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .box { width: 16px; height: 16px; border: 1.5px solid #111; display: inline-block; }
  .note { border: 1px solid #999; padding: 8px 10px; margin-top: 12px; }
  .foot { margin-top: 18px; font-size: 12px; color: #555; }
`;

function lineCells(line: PrintLine): string {
  const detail = [line.color, line.size].filter(Boolean).join(" / ");
  const extra = [...(line.options ?? []), line.sheet ?? ""].filter(Boolean).map(esc).join("<br>");
  return `<td><strong>${esc(line.product_name)}</strong>${extra ? `<div class="muted">${extra}</div>` : ""}</td>
    <td>${esc(line.sku)}</td><td>${esc(detail) || "&nbsp;"}</td><td class="num"><strong>${esc(line.quantity)}</strong></td>`;
}

function orderHead(o: PrintOrder, title: string): string {
  return `<div class="head">
      <div><h1>${esc(title)} ${esc(o.order_number)}</h1><div class="muted">Placed ${esc(day(o.created_at))}${o.po_number ? ` · PO ${esc(o.po_number)}` : ""}</div></div>
      <div style="text-align:right"><h2>${esc(o.customer)}</h2><div class="muted">${esc(o.method)}</div></div>
    </div>`;
}

/** One page per order: what to pull, with a box to tick beside each line. */
export function pickListHtml(orders: PrintOrder[]): string {
  return orders.map((o) => {
    const units = o.lines.reduce((sum, l) => sum + l.quantity, 0);
    return `<section class="order">
      ${orderHead(o, "Pick list")}
      <table>
        <thead><tr><th style="width:28px"></th><th>Item</th><th>SKU</th><th>Colour / size</th><th class="num">Qty</th></tr></thead>
        <tbody>${o.lines.map((l) => `<tr><td><span class="box"></span></td>${lineCells(l)}</tr>`).join("")}</tbody>
      </table>
      ${o.note ? `<div class="note"><div class="label">Note on the order</div>${esc(o.note)}</div>` : ""}
      <div class="foot">${o.lines.length} ${o.lines.length === 1 ? "line" : "lines"}, ${units} ${units === 1 ? "unit" : "units"}. Picked by: ____________  Checked by: ____________</div>
    </section>`;
  }).join("");
}

/** What goes in the parcel: who it is for and what is in it. No prices. */
export function packingSlipHtml(o: PrintOrder, shop: string): string {
  const units = o.lines.reduce((sum, l) => sum + l.quantity, 0);
  return `<section class="order">
    ${orderHead(o, "Packing slip")}
    <div class="cols">
      <div><div class="label">${o.method.toLowerCase().includes("pickup") ? "Collected by" : "Ship to"}</div>${o.address.map(esc).join("<br>") || esc(o.customer)}</div>
      <div><div class="label">From</div>${esc(shop)}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>SKU</th><th>Colour / size</th><th class="num">Qty</th></tr></thead>
      <tbody>${o.lines.map((l) => `<tr>${lineCells(l)}</tr>`).join("")}</tbody>
    </table>
    <div class="foot">${units} ${units === 1 ? "unit" : "units"} in this order. Thank you for your order.</div>
  </section>`;
}

/** Send a page to the print dialog without leaving the one the person is on. */
export function printHtml(title: string, body: string): void {
  if (typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`);
  doc.close();
  const win = frame.contentWindow;
  // The frame is taken away once the dialog has gone, or after a minute if the
  // browser never says so.
  const done = () => { window.setTimeout(() => frame.remove(), 500); };
  win.addEventListener("afterprint", done);
  window.setTimeout(() => frame.remove(), 60_000);
  window.setTimeout(() => { win.focus(); win.print(); }, 150);
}

// ── From the order as the admin API gives it ─────────────────────────────────

interface ApiLine {
  product_name: string; sku: string; color: string | null; size: string | null; quantity: number;
  configuration?: { breakdown?: { option: string; value: string }[] } | null;
  gang_sheet?: { reference?: string; sheet_name?: string; width_in?: number; height_in?: number } | null;
}
interface ApiOrder {
  order_number: string; created_at: string; company_name?: string | null; customer_name?: string | null;
  customer_email?: string | null; customer_phone?: string | null; guest_name?: string | null; guest_email?: string | null;
  shipping_method?: string | null; po_number?: string | null; order_notes?: string | null;
  shipping_address?: { full_name?: string; address_line1?: string; address_line2?: string; city?: string; state?: string; postal_code?: string; zip_code?: string; country?: string } | null;
  items: ApiLine[];
}

export function methodWords(method: string | null | undefined): string {
  const m = (method ?? "").toLowerCase();
  if (m.includes("will_call") || m.includes("pickup")) return "Will Call pickup";
  if (m.includes("expedited")) return "Ship, expedited";
  if (!m) return "Ship";
  return `Ship, ${m.replace(/_/g, " ")}`;
}

export function toPrintOrder(o: ApiOrder): PrintOrder {
  const a = o.shipping_address ?? {};
  const cityLine = [a.city, [a.state, a.postal_code ?? a.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    order_number: o.order_number,
    created_at: o.created_at,
    customer: o.company_name || o.customer_name || o.guest_name || o.guest_email || "Guest",
    email: o.customer_email ?? o.guest_email ?? null,
    phone: o.customer_phone ?? null,
    method: methodWords(o.shipping_method),
    po_number: o.po_number ?? null,
    note: o.order_notes ?? null,
    address: [a.full_name, a.address_line1, a.address_line2, cityLine, a.country].filter((s): s is string => !!s),
    lines: (o.items ?? []).map((i) => ({
      product_name: i.product_name,
      sku: i.sku,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      options: (i.configuration?.breakdown ?? []).map((b) => `${b.option}: ${b.value}`),
      sheet: i.gang_sheet
        ? [i.gang_sheet.reference, i.gang_sheet.width_in && i.gang_sheet.height_in ? `${i.gang_sheet.width_in} x ${i.gang_sheet.height_in} in` : ""].filter(Boolean).join(", ")
        : null,
    })),
  };
}
