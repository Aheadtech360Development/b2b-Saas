"use client";

/**
 * A purchase order (design 37): /admin/purchase-orders/new and /<id>.
 *
 * - Supplier and delivery: the supplier (a manufacturer; one can be added
 *   here), the expected delivery date and a note.
 * - Line items: each a SKU found by SKU, product, colour or size (stocked
 *   products, with the cost last paid), or a new item typed in; quantity and
 *   cost. A new item becomes a draft product when it is received.
 * - Save draft keeps it; Send saves it, emails it to the supplier and marks
 *   it sent (a supplier with no email: marked sent after asking). Only a
 *   draft can be changed: once sent it is what the supplier was told.
 * - Receive stock: what arrived, line by line. It goes into Inventory, and the
 *   order closes once everything has come.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";

interface Supplier { id: string; name: string; email?: string | null; contact_name?: string | null }
interface Found { variant_id: string; sku: string; product_name: string; color: string | null; size: string | null; cost: number | null }
interface POLine {
  id: string; product_variant_id: string | null; product_name: string | null; variant_sku: string | null;
  variant_color: string | null; variant_size: string | null; new_product_name: string | null; new_product_sku: string | null;
  qty_ordered: number; unit_cost_expected: number;
}
interface PO {
  id: string; po_number: string; manufacturer_id: string | null; manufacturer_name: string | null; status: string;
  order_date: string | null; expected_delivery: string | null; notes: string | null;
  total_expected: number; total_received: number; line_items: POLine[];
  receivings: { id: string; received_date: string | null; notes: string | null; items: { po_line_item_id: string | null; qty_received: number; unit_cost_actual: number }[] }[];
}
interface Line {
  key: number; lineId?: string; variantId: string | null; sku: string; item: string; detail: string;
  newItem: boolean; qty: string; cost: string;
}

export const PO_STATUS: Record<string, [string, string]> = {
  draft: ["Draft", ""], sent: ["Sent", "blue"], partial: ["Part received", "amber"],
  received: ["Received", "green"], closed: ["Closed", "green"], cancelled: ["Cancelled", "red"],
};
const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);
let seq = 0;
const key = () => ++seq;
const detailOf = (color: string | null, size: string | null) => [color, size].filter(Boolean).join(" / ");

function linesOf(po: PO): Line[] {
  return po.line_items.map((li) => ({
    key: key(), lineId: li.id, variantId: li.product_variant_id, newItem: !li.product_variant_id,
    sku: li.variant_sku ?? li.new_product_sku ?? "", item: li.product_name ?? li.new_product_name ?? "",
    detail: detailOf(li.variant_color, li.variant_size), qty: String(li.qty_ordered), cost: String(li.unit_cost_expected),
  }));
}

export function PurchaseOrderEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: key(), variantId: null, sku: "", item: "", detail: "", newItem: false, qty: "1", cost: "" }]);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const p = await apiClient.get<PO>(`/api/v1/admin/purchase-orders/${id}`);
    setPo(p);
    setSupplierId(p.manufacturer_id ?? "");
    setExpected(p.expected_delivery ?? "");
    setNotes(p.notes ?? "");
    setLines(linesOf(p));
    return p;
  }, [id]);

  useEffect(() => {
    apiClient.get<Supplier[]>("/api/v1/admin/purchase-orders/manufacturers").then((s) => setSuppliers(Array.isArray(s) ? s : [])).catch(() => setSuppliers([]));
    if (!id) return;
    load()
      .then((p) => { if (p && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("receive")) setReceiving(true); })
      .catch((e) => setLoadError(errText(e, "That purchase order was not found.")));
  }, [id, load]);

  const editable = !id || (po?.status === "draft" && !(po?.receivings?.length));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);
  const received = (lineId?: string) => (po?.receivings ?? []).flatMap((r) => r.items).filter((i) => i.po_line_item_id === lineId).reduce((s, i) => s + i.qty_received, 0);
  const outstanding = (po?.line_items ?? []).some((li) => received(li.id) < li.qty_ordered);
  const patch = (k: number, p: Partial<Line>) => setLines((all) => all.map((l) => (l.key === k ? { ...l, ...p } : l)));

  function problem(): string | null {
    if (!supplierId) return "Choose the supplier.";
    const used = lines.filter((l) => l.variantId || l.item.trim());
    if (!used.length) return "Add at least one line.";
    for (const l of used) {
      if (!(Number(l.qty) >= 1) || !Number.isInteger(Number(l.qty))) return `Give ${l.sku || l.item} a whole quantity of 1 or more.`;
      if (l.cost === "" || !(Number(l.cost) >= 0)) return `Give ${l.sku || l.item} its cost (0 or more).`;
    }
    return null;
  }

  async function save(): Promise<string | null> {
    const why = problem();
    if (why) { setFlash({ text: why, bad: true }); return null; }
    const body = {
      manufacturer_id: supplierId, expected_delivery: expected || null, notes: notes.trim() || null,
      line_items: lines.filter((l) => l.variantId || l.item.trim()).map((l) => ({
        product_variant_id: l.variantId,
        new_product_name: l.variantId ? null : l.item.trim(),
        new_product_sku: l.variantId ? null : l.sku.trim() || null,
        qty_ordered: Number(l.qty), unit_cost_expected: Number(l.cost),
      })),
    };
    if (!id) {
      const made = await apiClient.post<{ id: string }>("/api/v1/admin/purchase-orders/", body);
      return made.id;
    }
    await apiClient.put(`/api/v1/admin/purchase-orders/${id}`, body);
    return id;
  }

  async function saveDraft() {
    setBusy("save");
    setFlash(null);
    try {
      const saved = await save();
      if (!saved) return;
      if (!id) { router.replace(`/admin/purchase-orders/${saved}?saved=1`); return; }
      await load();
      setFlash({ text: "Draft saved." });
    } catch (e) {
      setFlash({ text: errText(e, "It could not be saved."), bad: true });
    } finally {
      setBusy("");
    }
  }

  async function send() {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setBusy("send");
    setFlash(null);
    try {
      const saved = await save();
      if (!saved) return;
      let text: string;
      if (supplier?.email) {
        try {
          await apiClient.post(`/api/v1/admin/purchase-orders/${saved}/send-email`);
          text = `Sent to ${supplier.email}.`;
        } catch (e) {
          await tell(`The order is saved, but the email did not go: ${errText(e, "the mail service refused it")}. Send it again from here, or mark it sent once you have sent it yourself.`);
          text = "Saved as a draft.";
        }
      } else if (await ask(`${supplier?.name ?? "This supplier"} has no email address, so nothing can be emailed. Mark the order as sent anyway?`, { ok: "Mark as sent" })) {
        await apiClient.post(`/api/v1/admin/purchase-orders/${saved}/mark-sent`);
        text = "Marked as sent.";
      } else {
        text = "Saved as a draft.";
      }
      if (!id) { router.replace(`/admin/purchase-orders/${saved}?sent=${encodeURIComponent(text)}`); return; }
      await load();
      setFlash({ text });
    } catch (e) {
      setFlash({ text: errText(e, "It could not be sent."), bad: true });
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("saved")) setFlash({ text: "Draft saved." });
    if (sp.get("sent")) setFlash({ text: sp.get("sent")! });
  }, []);

  if (loadError) {
    return <div className="pc-page"><Link href="/admin/purchase-orders" className="pc-back">← Products</Link><div className="pc-card pc-empty" style={{ marginTop: "16px" }}>{loadError}</div></div>;
  }
  if (id && !po) return <div className="pc-page"><div className="pc-card pc-empty">Loading the purchase order…</div></div>;

  const [statusWord, statusTone] = PO_STATUS[po?.status ?? "draft"] ?? [po?.status ?? "", ""];
  return (
    <div className="pc-page" data-po={po?.po_number ?? "new"}>
      <Link href="/admin/purchase-orders" className="pc-back">← Products</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Purchase order</div>
          <h1 className="pc-h1">{po ? po.po_number : "New purchase order"}
            {po && <span className="pc-pill" data-tone={statusTone || undefined} style={{ textTransform: "none", marginLeft: "12px", verticalAlign: "middle" }}>{statusWord}</span>}</h1>
          <p className="pc-sub-line">{po ? `From ${po.manufacturer_name ?? "a supplier"}${po.order_date ? `, ordered ${new Date(`${po.order_date}T00:00:00`).toLocaleDateString()}` : ""}.` : "Buying from a supplier or manufacturer."}</p>
        </div>
        {editable && (
          <div className="pc-row-actions">
            <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void saveDraft()}>{busy === "save" ? "Saving…" : "Save draft"}</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => void send()}>{busy === "send" ? "Sending…" : "Send"}</button>
          </div>
        )}
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      <div className="pc-cols" style={{ marginTop: "8px" }}>
        <div className="pc-stack" style={{ gap: "18px" }}>
          <section className="pc-card pc-pad" data-card="supplier">
            <h2 className="pc-h2" style={{ marginBottom: "12px" }}>Supplier and delivery</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Supplier</span>
                <select className="pc-input" value={supplierId} disabled={!editable}
                  onChange={(e) => { if (e.target.value === "+") setAddingSupplier(true); else setSupplierId(e.target.value); }}>
                  <option value="">Choose…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="+">+ Add a supplier</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Expected delivery</span>
                <input className="pc-input" type="date" value={expected} disabled={!editable} onChange={(e) => setExpected(e.target.value)} />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Notes</span>
                <input className="pc-input" value={notes} disabled={!editable} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="For the supplier" />
              </label>
            </div>
          </section>

          <section className="pc-card pc-pad" data-card="lines" style={{ display: "grid", gap: "12px" }}>
            <h2 className="pc-h2">Line items</h2>
            <div className="pc-scroll-x" style={{ border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
              <table className="pc-table" style={{ minWidth: "620px" }}>
                <thead><tr><th>SKU</th><th>Item</th><th className="pc-num">Qty</th><th className="pc-num">Cost</th><th className="pc-num">Total</th>
                  {!editable && <th className="pc-num">Received</th>}{editable && <th aria-label="Remove" />}</tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} data-line={l.sku || l.item || "new"}>
                      <td style={{ minWidth: "160px" }}>
                        {!editable ? <b>{l.sku || "–"}</b>
                          : l.variantId ? <b>{l.sku}</b>
                          : l.newItem ? <input className="pc-input" aria-label="New item SKU" value={l.sku} placeholder="SKU (optional)" onChange={(e) => patch(l.key, { sku: e.target.value })} />
                          : <SkuSearch onPick={(f) => patch(l.key, { variantId: f.variant_id, sku: f.sku, item: f.product_name, detail: detailOf(f.color, f.size), cost: l.cost || (f.cost != null ? String(f.cost) : "") })}
                              onNew={(text) => patch(l.key, { newItem: true, item: text, sku: "" })} />}
                      </td>
                      <td>
                        {editable && l.newItem
                          ? <input className="pc-input" aria-label="New item name" value={l.item} placeholder="Item name" onChange={(e) => patch(l.key, { item: e.target.value })} />
                          : <>{l.item || <span style={{ color: "var(--pc-faint)" }}>Find a SKU</span>}
                              {l.detail && <div className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>{l.detail}</div>}
                              {!l.variantId && l.item && <div className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>New item: a draft product is made when it is received</div>}</>}
                      </td>
                      <td className="pc-num">{editable ? <input className="pc-input" aria-label={`Quantity of ${l.sku || l.item || "the line"}`} inputMode="numeric" value={l.qty} style={{ width: "76px", textAlign: "right" }} onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9]/g, "") })} /> : l.qty}</td>
                      <td className="pc-num">{editable ? <input className="pc-input" aria-label={`Cost of ${l.sku || l.item || "the line"}`} inputMode="decimal" value={l.cost} placeholder="0.00" style={{ width: "96px", textAlign: "right" }} onChange={(e) => patch(l.key, { cost: e.target.value.replace(/[^0-9.]/g, "") })} /> : money(Number(l.cost))}</td>
                      <td className="pc-num" style={{ fontWeight: 600 }}>{money((Number(l.qty) || 0) * (Number(l.cost) || 0))}</td>
                      {!editable && <td className="pc-num">{received(l.lineId)} of {l.qty}</td>}
                      {editable && <td className="pc-num"><button type="button" className="pc-x" style={{ color: "var(--pc-red)" }} aria-label="Remove the line" onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}><X size={16} /></button></td>}
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={6} className="pc-empty">No lines yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {editable && (
              <div><button type="button" className="pc-btn" onClick={() => setLines((all) => [...all, { key: key(), variantId: null, sku: "", item: "", detail: "", newItem: false, qty: "1", cost: "" }])}>+ Add line</button></div>
            )}
          </section>

          {po && po.receivings.length > 0 && (
            <section className="pc-card pc-pad" data-card="receivings">
              <h2 className="pc-h2" style={{ marginBottom: "10px" }}>Received</h2>
              {po.receivings.map((r) => (
                <div key={r.id} style={{ padding: "8px 0", borderTop: "1px solid var(--pc-line-soft)" }}>
                  <b>{r.received_date ? new Date(`${r.received_date}T00:00:00`).toLocaleDateString() : "–"}</b>
                  {" · "}{r.items.reduce((s, i) => s + i.qty_received, 0)} units
                  {r.notes && <span className="pc-sub-line"> · {r.notes}</span>}
                </div>
              ))}
            </section>
          )}
        </div>

        <section className="pc-card pc-pad" data-card="review" style={{ display: "grid", gap: "12px" }}>
          <h2 className="pc-h2">Review</h2>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }} data-total>
            <span>Total</span><span>{money(total)}</span>
          </div>
          {po && po.total_received > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", color: "var(--pc-ink-2)" }}><span>Received so far</span><span>{money(po.total_received)}</span></div>
          )}
          <p className="pc-sub-line" style={{ margin: 0 }}>When stock arrives, Receive stock updates Inventory and closes the order.</p>
          <div>
            <button type="button" className="pc-btn" data-receive
              disabled={!po || !!busy || !outstanding || ["closed", "cancelled"].includes(po.status)}
              title={!po ? "Save the order first" : undefined} onClick={() => setReceiving(true)}>
              Receive stock
            </button>
          </div>
          {po && !outstanding && <p className="pc-sub-line" style={{ margin: 0 }}>Everything on this order has been received.</p>}
        </section>
      </div>

      {addingSupplier && (
        <AddSupplier onClose={() => setAddingSupplier(false)}
          onAdded={(s) => { setSuppliers((all) => [...all, s].sort((a, b) => a.name.localeCompare(b.name))); setSupplierId(s.id); setAddingSupplier(false); }} />
      )}
      {receiving && po && (
        <ReceiveStock po={po} received={received} onClose={() => setReceiving(false)}
          onDone={async (units) => {
            setReceiving(false);
            const p = await load().catch(() => null);
            setFlash({ text: `${units} ${units === 1 ? "unit" : "units"} received and added to Inventory.${p && p.status === "received" ? " The order is closed: everything has come." : ""}` });
          }} />
      )}
    </div>
  );
}

/** A SKU for a line: typed, then picked from what matches; or a new item. */
function SkuSearch({ onPick, onNew }: { onPick: (f: Found) => void; onNew: (text: string) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      apiClient.get<Found[]>(`/api/v1/admin/purchase-orders/variants?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (live) setFound(Array.isArray(r) ? r : []); })
        .catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={box} style={{ position: "relative" }}>
      <input className="pc-input" aria-label="Find a SKU" placeholder="SKU or product" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && q.trim() && (
        <div className="pc-pop" role="listbox" style={{ left: 0, right: "auto", minWidth: "320px", maxHeight: "260px", overflowY: "auto" }}>
          {found === null ? <div className="pc-pop-item" aria-disabled>Searching…</div> : found.map((f) => (
            <button key={f.variant_id} type="button" role="option" aria-selected={false} className="pc-pop-item" onClick={() => { onPick(f); setOpen(false); }}>
              <b>{f.sku}</b> · {f.product_name}{detailOf(f.color, f.size) ? ` · ${detailOf(f.color, f.size)}` : ""}{f.cost != null ? ` · ${money(f.cost)}` : ""}
            </button>
          ))}
          {found !== null && (
            <button type="button" className="pc-pop-item" style={{ borderTop: "1px solid var(--pc-line)" }} onClick={() => { onNew(q.trim()); setOpen(false); }}>
              {found.length ? "Not here: " : "No match: "}add &ldquo;{q.trim()}&rdquo; as a new item
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddSupplier({ onClose, onAdded }: { onClose: () => void; onAdded: (s: Supplier) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    if (!name.trim()) { setError("Give the supplier a name."); return; }
    setBusy(true);
    try {
      onAdded(await apiClient.post<Supplier>("/api/v1/admin/purchase-orders/manufacturers",
        { name: name.trim(), email: email.trim() || null, contact_name: contact.trim() || null }));
    } catch (e) {
      setError(errText(e, "The supplier could not be added."));
      setBusy(false);
    }
  }
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label="Add a supplier" style={{ maxWidth: "440px" }}>
        <div className="pc-panel-head"><h2 className="pc-h2">Add a supplier</h2><button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="pc-panel-body">
          <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Name</span><input className="pc-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Email</span><input className="pc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where orders are sent" /></label>
          <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Contact name</span><input className="pc-input" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          {error && <div className="pc-note" data-tone="red">{error}</div>}
          <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="pc-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={() => void add()}>{busy ? "Adding…" : "Add supplier"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What arrived, line by line: it goes into Inventory at the cost paid. */
function ReceiveStock({ po, received, onClose, onDone }: {
  po: PO; received: (lineId?: string) => number; onClose: () => void; onDone: (units: number) => void;
}) {
  const open = po.line_items.filter((li) => received(li.id) < li.qty_ordered);
  const [rows, setRows] = useState(() => Object.fromEntries(open.map((li) => [li.id, { qty: String(li.qty_ordered - received(li.id)), cost: String(li.unit_cost_expected) }])));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function receive() {
    const items = open.map((li) => ({ po_line_item_id: li.id, qty_received: Number(rows[li.id]?.qty) || 0, unit_cost_actual: Number(rows[li.id]?.cost) || 0 }))
      .filter((i) => i.qty_received > 0);
    if (!items.length) { setError("Nothing to receive: every quantity is 0."); return; }
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/admin/purchase-orders/${po.id}/receive`, { received_date: date || null, notes: notes.trim() || null, items });
      onDone(items.reduce((s, i) => s + i.qty_received, 0));
    } catch (e) {
      setError(errText(e, "The stock could not be received."));
      setBusy(false);
    }
  }
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label="Receive stock" data-receive-stock style={{ maxWidth: "620px" }}>
        <div className="pc-panel-head"><h2 className="pc-h2">Receive stock</h2><button type="button" className="pc-x" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button></div>
        <div className="pc-panel-body">
          <div className="pc-scroll-x">
            <table className="pc-table">
              <thead><tr><th>Item</th><th className="pc-num">Still to come</th><th className="pc-num">Arrived now</th><th className="pc-num">Cost each</th></tr></thead>
              <tbody>
                {open.map((li) => (
                  <tr key={li.id}>
                    <td><b>{li.variant_sku ?? li.new_product_sku ?? ""}</b> {li.product_name ?? li.new_product_name}</td>
                    <td className="pc-num">{li.qty_ordered - received(li.id)}</td>
                    <td className="pc-num"><input className="pc-input" aria-label={`Arrived now of ${li.variant_sku ?? li.product_name}`} inputMode="numeric" style={{ width: "76px", textAlign: "right" }}
                      value={rows[li.id]?.qty ?? ""} onChange={(e) => setRows((r) => ({ ...r, [li.id]: { ...r[li.id]!, qty: e.target.value.replace(/[^0-9]/g, "") } }))} /></td>
                    <td className="pc-num"><input className="pc-input" aria-label={`Cost of ${li.variant_sku ?? li.product_name}`} inputMode="decimal" style={{ width: "90px", textAlign: "right" }}
                      value={rows[li.id]?.cost ?? ""} onChange={(e) => setRows((r) => ({ ...r, [li.id]: { ...r[li.id]!, cost: e.target.value.replace(/[^0-9.]/g, "") } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Received on</span><input className="pc-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Note</span><input className="pc-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery reference, damage…" /></label>
          </div>
          {error && <div className="pc-note" data-tone="red">{error}</div>}
          <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="pc-btn" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy} onClick={() => void receive()}>{busy ? "Receiving…" : "Receive stock"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
