"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetOrder,
  type GangSheetSize,
  type GangSheetStatus,
} from "@/services/gangSheets.service";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E6E1",
  borderRadius: "10px",
  padding: "20px",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #DDD9D2",
  borderRadius: "6px",
  fontSize: "13px",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6B6B6B",
  textTransform: "uppercase",
  letterSpacing: ".05em",
  marginBottom: "4px",
};
const BTN: React.CSSProperties = {
  background: "var(--brand-primary, #1C3557)",
  color: "#fff",
  border: "none",
  padding: "9px 16px",
  borderRadius: "6px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const EMPTY_SIZE = {
  name: "",
  width_in: 22,
  height_in: 60,
  price_per_sheet: 0,
  bleed_in: 0.125,
  spacing_in: 0.125,
  is_active: true,
  sort_order: 0,
};

export default function AdminGangSheetsPage() {
  const [tab, setTab] = useState<"orders" | "sizes">("orders");

  return (
    <div style={{ padding: "24px", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>Gang Sheets</h1>
      <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "20px" }}>
        Review submitted gang sheet jobs and configure the sheet sizes you offer.
      </p>

      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {(["orders", "sizes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid " + (tab === t ? "var(--brand-primary, #1C3557)" : "#E8E6E1"),
              background: tab === t ? "var(--brand-primary, #1C3557)" : "#fff",
              color: tab === t ? "#fff" : "#555",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t === "orders" ? "Orders" : "Sheet Sizes"}
          </button>
        ))}
      </div>

      {tab === "orders" ? <OrdersTab /> : <SizesTab />}
    </div>
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const [selected, setSelected] = useState<GangSheetOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    gangSheetsService
      .adminListOrders(filter || undefined)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);

  if (loading) return <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>;

  return (
    <>
      <div style={{ marginBottom: "14px" }}>
        <select style={{ ...INPUT, width: "220px" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(GANG_SHEET_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {orders.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          No gang sheet orders yet.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Reference", "Sheet", "Qty", "Total", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
                return (
                  <tr key={o.id} style={{ borderBottom: "1px solid #F1EFEB" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>{o.reference}</td>
                    <td style={{ padding: "11px 14px", color: "#555" }}>
                      {o.sheet_name} <span style={{ color: "#999" }}>({o.sheet_width_in}″×{o.sheet_height_in}″)</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>{o.sheet_quantity}</td>
                    <td style={{ padding: "11px 14px" }}>${o.subtotal.toFixed(2)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: c.bg, color: c.fg, padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                        {GANG_SHEET_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.revision_count > 0 && (
                        <span style={{ marginLeft: "6px", fontSize: "11px", color: "#9A3412" }}>
                          rev {o.revision_count}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right" }}>
                      <button
                        onClick={() => gangSheetsService.adminOrder(o.id).then(setSelected).catch(() => {})}
                        style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}
                      >
                        Review →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ReviewModal
          order={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}

function ReviewModal({ order, onClose, onChanged }: { order: GangSheetOrder; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(order.supplier_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(status: GangSheetStatus) {
    setBusy(true); setErr(null);
    try {
      await gangSheetsService.adminSetStatus(order.id, status, notes || undefined);
      onChanged();
    } catch {
      setErr("Could not update this order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "620px", maxHeight: "88vh", overflowY: "auto", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800 }}>{order.reference}</h2>
            <div style={{ fontSize: "12px", color: "#888" }}>
              {order.sheet_name} · {order.sheet_width_in}″ × {order.sheet_height_in}″ · {order.sheet_quantity} sheet(s) · ${order.subtotal.toFixed(2)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", color: "#999", cursor: "pointer" }}>×</button>
        </div>

        {order.contact_name || order.contact_email ? (
          <div style={{ fontSize: "13px", color: "#555", marginBottom: "14px" }}>
            <strong>Contact:</strong> {order.contact_name} {order.contact_email ? `· ${order.contact_email}` : ""}
          </div>
        ) : null}

        {order.customer_notes && (
          <div style={{ background: "#FAFAF8", border: "1px solid #EFEDE8", borderRadius: "8px", padding: "12px", fontSize: "13px", marginBottom: "16px" }}>
            <div style={{ ...LABEL, marginBottom: "6px" }}>Customer notes</div>
            {order.customer_notes}
          </div>
        )}

        <div style={{ ...LABEL, marginBottom: "8px" }}>Artwork ({order.artworks?.length ?? 0})</div>
        <div style={{ border: "1px solid #EFEDE8", borderRadius: "8px", marginBottom: "18px" }}>
          {(order.artworks ?? []).map((a, i) => (
            <div key={a.id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: i < (order.artworks?.length ?? 0) - 1 ? "1px solid #F1EFEB" : "none", fontSize: "13px" }}>
              <div style={{ minWidth: 0 }}>
                <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary, #1C3557)", fontWeight: 600, textDecoration: "none", wordBreak: "break-all" }}>
                  {a.file_name}
                </a>
                <div style={{ color: "#888", fontSize: "12px" }}>
                  {a.width_in}″ × {a.height_in}″ · qty {a.quantity}
                </div>
              </div>
              <a href={a.file_url} download target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap", marginLeft: "12px" }}>
                Download ↓
              </a>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={LABEL}>Notes to customer</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Explain what needs changing if you request a revision…"
            style={{ ...INPUT, resize: "vertical" }}
          />
        </div>

        {err && <div style={{ color: "#B91C1C", fontSize: "13px", marginBottom: "10px" }}>{err}</div>}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => setStatus("approved")} style={{ ...BTN, background: "#166534" }}>Approve</button>
          <button disabled={busy} onClick={() => setStatus("revision_requested")} style={{ ...BTN, background: "#C2410C" }}>Request revision</button>
          <button disabled={busy} onClick={() => setStatus("in_review")} style={{ ...BTN, background: "#B45309" }}>Mark in review</button>
          <button disabled={busy} onClick={() => setStatus("completed")} style={{ ...BTN, background: "#075985" }}>Completed</button>
          <button disabled={busy} onClick={() => setStatus("rejected")} style={{ ...BTN, background: "#991B1B" }}>Reject</button>
        </div>
      </div>
    </div>
  );
}

// ── Sheet sizes ───────────────────────────────────────────────────────────────
function SizesTab() {
  const [sizes, setSizes] = useState<GangSheetSize[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY_SIZE });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    gangSheetsService.adminListSizes().then(setSizes).catch(() => setSizes([]));
  }, []);
  useEffect(load, [load]);

  async function create() {
    if (!draft.name.trim()) { setErr("Give the sheet size a name."); return; }
    setBusy(true); setErr(null);
    try {
      await gangSheetsService.adminCreateSize(draft);
      setDraft({ ...EMPTY_SIZE });
      load();
    } catch {
      setErr("Could not save this sheet size.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: GangSheetSize) {
    await gangSheetsService.adminUpdateSize(s.id, { is_active: !s.is_active }).catch(() => {});
    load();
  }

  async function remove(s: GangSheetSize) {
    if (!confirm(`Delete "${s.name}"? Existing orders keep their saved sheet details.`)) return;
    await gangSheetsService.adminDeleteSize(s.id).catch(() => {});
    load();
  }

  return (
    <>
      <div style={{ ...CARD, marginBottom: "18px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>Add a sheet size</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px", marginBottom: "14px" }}>
          <div>
            <label style={LABEL}>Name</label>
            <input style={INPUT} value={draft.name} placeholder="DTF 22×60" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Width (in)</label>
            <input style={INPUT} type="number" step="0.25" min="0.25" value={draft.width_in} onChange={(e) => setDraft({ ...draft, width_in: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>Height (in)</label>
            <input style={INPUT} type="number" step="0.25" min="0.25" value={draft.height_in} onChange={(e) => setDraft({ ...draft, height_in: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>Price / sheet</label>
            <input style={INPUT} type="number" step="0.01" min="0" value={draft.price_per_sheet} onChange={(e) => setDraft({ ...draft, price_per_sheet: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>Bleed (in)</label>
            <input style={INPUT} type="number" step="0.025" min="0" value={draft.bleed_in} onChange={(e) => setDraft({ ...draft, bleed_in: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>Spacing (in)</label>
            <input style={INPUT} type="number" step="0.025" min="0" value={draft.spacing_in} onChange={(e) => setDraft({ ...draft, spacing_in: Number(e.target.value) })} />
          </div>
        </div>
        {err && <div style={{ color: "#B91C1C", fontSize: "13px", marginBottom: "10px" }}>{err}</div>}
        <button style={BTN} disabled={busy} onClick={create}>{busy ? "Saving…" : "Add sheet size"}</button>
      </div>

      {sizes.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>
          No sheet sizes yet. Customers cannot submit a gang sheet until at least one active size exists.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Name", "Size", "Price", "Bleed / Spacing", "Active", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #F1EFEB" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>{s.name}</td>
                  <td style={{ padding: "11px 14px", color: "#555" }}>{s.width_in}″ × {s.height_in}″</td>
                  <td style={{ padding: "11px 14px" }}>${s.price_per_sheet.toFixed(2)}</td>
                  <td style={{ padding: "11px 14px", color: "#888" }}>{s.bleed_in}″ / {s.spacing_in}″</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button onClick={() => toggle(s)} style={{ background: s.is_active ? "#DCFCE7" : "#F3F4F6", color: s.is_active ? "#166534" : "#6B7280", border: "none", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                      {s.is_active ? "Active" : "Hidden"}
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <button onClick={() => remove(s)} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", fontSize: "12px" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
