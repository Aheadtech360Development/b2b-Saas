"use client";

import { useCallback, useEffect, useState } from "react";
import {
  suppliersService, type OrderSettings as Settings, type SupplierMeta, type SupplierOrderRow, type WaitingOrder,
} from "@/services/suppliers.service";
import { Card } from "./SyncSettings";
import { Badge, Btn, CARD, INPUT, LABEL, MUTED, Spinner, Toggle, errText, fmtDate } from "./ui";

const hourLabel = (utcHour: number) => {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return `${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} your time (${String(utcHour).padStart(2, "0")}:00 UTC)`;
};

export function OrderSettings({ id, value, saved, onChange, meta, connected, dirty }: {
  id: string; value: Settings; saved: Settings; onChange: (v: Settings) => void; meta: SupplierMeta;
  connected: boolean; dirty: boolean;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });
  const setAddr = (k: keyof Settings["store_address"], v: string | boolean) =>
    onChange({ ...value, store_address: { ...value.store_address, [k]: v } });
  const [warehouses, setWarehouses] = useState<{ code: string; label: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: number; type: string; name: string }[] | null>(null);
  const [profileErr, setProfileErr] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    if (!connected) return;
    suppliersService.locations(id).then((r) => setWarehouses(r.warehouses)).catch(() => {});
  }, [id, connected]);

  const loadProfiles = async () => {
    setLoadingProfiles(true);
    setProfileErr("");
    try {
      setProfiles((await suppliersService.paymentProfiles(id)).profiles);
    } catch (e) {
      setProfileErr(errText(e));
    }
    setLoadingProfiles(false);
  };

  const po = (value.po_template || "{{ order.order_number }}").replace(/\{\{\s*order\.order_number\s*\}\}/g, "1001")
    .replace(/\{\{\s*order\.po_number\s*\}\}/g, "PO-55");
  const on = value.sync !== "disabled";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Order Sync Settings</div>
        <p style={MUTED}>How store orders with this supplier&apos;s products are sent to it as purchase orders. Off by default.</p>
      </div>

      <div style={{ ...CARD, borderColor: value.test_mode ? "#FCD34D" : "#F5C2C0", background: value.test_mode ? "#FFFBEB" : "#FFF5F5", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Toggle on={value.test_mode} onChange={() => set("test_mode", !value.test_mode)} />
        <div style={{ flex: "1 1 300px", fontSize: 13 }}>
          <b>Test mode {value.test_mode ? "on" : "off"}</b> —{" "}
          {value.test_mode
            ? "orders are sent to S&S as test orders: created and cancelled at once, nothing ships and nothing is charged."
            : "orders are placed for real. S&S ships them and bills your account."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14 }}>
        <Card title="Order Sync" help="When orders go to S&S. Only orders placed after you turn this on are ever sent.">
          <select value={value.sync} onChange={(e) => set("sync", e.target.value as Settings["sync"])} style={{ ...INPUT, width: "100%" }}>
            <option value="disabled">Disabled</option>
            <option value="automatic">Automatic — as soon as an order is paid or confirmed</option>
            <option value="scheduled">Scheduled — once a day</option>
            <option value="manual">Manual — I send them from the list below</option>
          </select>
          {value.sync === "scheduled" && (
            <div style={{ marginTop: 10 }}>
              <label style={LABEL}>Send at</label>
              <select value={value.schedule_hour} onChange={(e) => set("schedule_hour", Number(e.target.value))} style={{ ...INPUT, width: "100%" }}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
          )}
        </Card>

        <Card title="Combine Orders" help="One supplier PO for all orders in a scheduled run. Only when they all ship to your address.">
          <select value={value.combine ? "yes" : "no"} onChange={(e) => set("combine", e.target.value === "yes")}
            disabled={value.sync !== "scheduled" || value.ship_to !== "store"} style={{ ...INPUT, width: "100%" }}>
            <option value="no">No — each order is a new supplier PO</option>
            <option value="yes">Yes — one PO per scheduled run</option>
          </select>
        </Card>

        <Card title="Ship To Address" help="Where S&S ships the order.">
          <select value={value.ship_to} onChange={(e) => onChange({ ...value, ship_to: e.target.value as Settings["ship_to"], combine: e.target.value === "store" && value.combine })} style={{ ...INPUT, width: "100%" }}>
            <option value="customer">Ship to Customer (Dropship)</option>
            <option value="store">Ship to My Address</option>
          </select>
          {value.ship_to === "store" && (
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <input value={value.store_address.customer} onChange={(e) => setAddr("customer", e.target.value)} placeholder="Company" style={INPUT} />
              <input value={value.store_address.attn} onChange={(e) => setAddr("attn", e.target.value)} placeholder="Attention" style={INPUT} />
              <input value={value.store_address.address} onChange={(e) => setAddr("address", e.target.value)} placeholder="Address *" style={INPUT} />
              <div style={{ display: "flex", gap: 6 }}>
                <input value={value.store_address.city} onChange={(e) => setAddr("city", e.target.value)} placeholder="City *" style={{ ...INPUT, flex: 2 }} />
                <input value={value.store_address.state} onChange={(e) => setAddr("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="ST *" style={{ ...INPUT, flex: 1, minWidth: 0 }} />
                <input value={value.store_address.zip} onChange={(e) => setAddr("zip", e.target.value)} placeholder="ZIP *" style={{ ...INPUT, flex: 1, minWidth: 0 }} />
              </div>
              <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={value.store_address.residential} onChange={(e) => setAddr("residential", e.target.checked)} /> Residential address
              </label>
            </div>
          )}
        </Card>

        <Card title="Store Fulfillment" help="When the store order is marked shipped (the customer gets the shipped email).">
          <select value={value.fulfillment} onChange={(e) => set("fulfillment", e.target.value as Settings["fulfillment"])} style={{ ...INPUT, width: "100%" }}>
            <option value="on_ship">When S&S ships it (with tracking)</option>
            <option value="on_po">When the supplier PO is placed</option>
            <option value="never">Never — I&apos;ll update orders myself</option>
          </select>
        </Card>

        <Card title="Supplier PO Number" help={`Sent to S&S as your PO number. Preview: ${po}`}>
          <input value={value.po_template} onChange={(e) => set("po_template", e.target.value)} spellCheck={false}
            style={{ ...INPUT, width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }} />
          <p style={{ ...MUTED, fontSize: 11, marginTop: 6 }}>Use {"{{ order.order_number }}"} or {"{{ order.po_number }}"} (the customer&apos;s PO).</p>
        </Card>

        <Card title="Warehouse Selection" help="Which S&S warehouses may ship your orders.">
          <select value={value.warehouses} onChange={(e) => set("warehouses", e.target.value as Settings["warehouses"])} style={{ ...INPUT, width: "100%" }}>
            <option value="auto">Auto Select Warehouses</option>
            <option value="list">Only these warehouses</option>
          </select>
          {value.warehouses === "list" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8, fontSize: 12 }}>
              {[...warehouses, { code: "DS", label: "Dropshipping" }].map((w) => (
                <label key={w.code} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={value.warehouse_list.includes(w.code)} onChange={(e) =>
                    set("warehouse_list", e.target.checked ? [...value.warehouse_list, w.code] : value.warehouse_list.filter((c) => c !== w.code))} />
                  {w.label}
                </label>
              ))}
              {warehouses.length === 0 && <span style={{ color: "#8A8A8A" }}>Connect the supplier to list warehouses.</span>}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <select value={value.warehouse_preference} onChange={(e) => set("warehouse_preference", e.target.value as Settings["warehouse_preference"])} style={{ ...INPUT, width: "100%" }}>
              <option value="fewest">Prefer fewest shipments</option>
              <option value="fastest">Prefer fastest delivery</option>
            </select>
          </div>
        </Card>

        <Card title="Shipping Method" help="Sent to S&S with each order.">
          <select value={value.shipping_method} onChange={(e) => set("shipping_method", e.target.value)} style={{ ...INPUT, width: "100%" }}>
            {meta.shipping_methods.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
            <input type="checkbox" checked={value.ship_blind} onChange={(e) => set("ship_blind", e.target.checked)} />
            Ship blind (no S&S branding on the package)
          </label>
        </Card>

        <Card title="Order Payment" help="On account uses your S&S credit terms. A saved card is one stored on the S&S website.">
          <select value={value.payment} onChange={(e) => set("payment", e.target.value as Settings["payment"])} style={{ ...INPUT, width: "100%" }}>
            <option value="credit">On account (credit terms)</option>
            <option value="card">Saved card on S&S</option>
          </select>
          {value.payment === "card" && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <input value={value.payment_email} onChange={(e) => set("payment_email", e.target.value)} placeholder="S&S website login email" style={INPUT} />
              <div style={{ display: "flex", gap: 6 }}>
                {profiles && profiles.length > 0 ? (
                  <select value={value.payment_profile_id ?? ""} onChange={(e) => set("payment_profile_id", e.target.value ? Number(e.target.value) : null)} style={{ ...INPUT, flex: 1 }}>
                    <option value="">Choose a saved card…</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </select>
                ) : (
                  <input value={value.payment_profile_id ?? ""} onChange={(e) => set("payment_profile_id", e.target.value ? Number(e.target.value.replace(/\D/g, "")) || null : null)}
                    placeholder="Payment profile ID" style={{ ...INPUT, flex: 1 }} />
                )}
                <Btn kind="ghost" onClick={loadProfiles} busy={loadingProfiles} disabled={!connected}>Load cards</Btn>
              </div>
              {profileErr && <span style={{ fontSize: 12, color: "#B42318" }}>{profileErr}</span>}
            </div>
          )}
        </Card>

        <Card title="Confirmation Email" help="Optional: S&S emails its order confirmation here.">
          <input value={value.email_confirmation} onChange={(e) => set("email_confirmation", e.target.value)} placeholder="orders@yourbrand.com" style={{ ...INPUT, width: "100%" }} />
        </Card>
      </div>

      {on && saved.sync !== "disabled" && <OrdersPanel id={id} dirty={dirty} />}
      {on && saved.sync === "disabled" && <p style={{ ...MUTED, fontSize: 12 }}>Save the supplier to start sending orders.</p>}
    </div>
  );
}

// ── Orders waiting + recent POs ──────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  placed: "#2563EB", shipped: "#16A34A", test: "#B45309", failed: "#B42318", sending: "#6B6B6B",
};

function OrdersPanel({ id, dirty }: { id: string; dirty: boolean }) {
  const [data, setData] = useState<{ waiting: WaitingOrder[]; recent: SupplierOrderRow[]; test_mode: boolean; mode: string } | null>(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "send" | "track">("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await suppliersService.orders(id));
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy("send");
    setNote("");
    try {
      const { results } = await suppliersService.sendOrders(id, [...pick]);
      setNote(results.map((r) => `#${r.order_number}: ${r.message}`).join("  ·  "));
      setPick(new Set());
      await load();
    } catch (e) {
      setNote(errText(e));
    }
    setBusy("");
  };

  const track = async () => {
    setBusy("track");
    setNote("");
    try {
      const { shipped } = await suppliersService.refreshTracking(id);
      setNote(shipped ? `${shipped} order${shipped === 1 ? "" : "s"} shipped and updated.` : "No new shipments from S&S yet.");
      await load();
    } catch (e) {
      setNote(errText(e));
    }
    setBusy("");
  };

  if (error) return <p style={{ color: "#B42318", fontSize: 13 }}>{error}</p>;
  if (!data) return <div style={{ padding: 16 }}><Spinner /></div>;

  return (
    <div style={{ display: "grid", gap: 16, borderTop: "1px solid #EEE", paddingTop: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Orders to Send</div>
          <p style={MUTED}>Paid or confirmed orders with S&S items that haven&apos;t been placed yet.
            {data.mode === "automatic" && " Automatic mode sends new ones within a few minutes; failed ones wait here for you."}</p>
        </div>
        <Btn onClick={send} busy={busy === "send"} disabled={!pick.size || !!busy || dirty}
          title={dirty ? "Save your changes first" : undefined}>
          {data.test_mode ? "Send as test" : "Send to S&S"}{pick.size ? ` (${pick.size})` : ""}
        </Btn>
      </div>
      {note && <div style={{ fontSize: 13, background: "#F6F9FF", border: "1px solid #C9D8F5", borderRadius: 8, padding: "8px 12px" }}>{note}</div>}
      {data.waiting.length === 0 ? <p style={MUTED}>Nothing waiting.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B6B6B" }}>
                <th style={{ padding: 6, width: 30 }}>
                  <input type="checkbox" aria-label="Select all" checked={pick.size === data.waiting.length}
                    onChange={(e) => setPick(e.target.checked ? new Set(data.waiting.map((w) => w.order_id)) : new Set())} />
                </th>
                {["Order", "Customer", "S&S items", "Placed", "Last attempt"].map((h) => <th key={h} style={{ padding: 6, fontSize: 12 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.waiting.map((w) => (
                <tr key={w.order_id} style={{ borderTop: "1px solid #F2F2F2" }}>
                  <td style={{ padding: 6 }}>
                    <input type="checkbox" aria-label={`Select order ${w.order_number}`} checked={pick.has(w.order_id)} onChange={(e) => {
                      const n = new Set(pick);
                      if (e.target.checked) n.add(w.order_id); else n.delete(w.order_id);
                      setPick(n);
                    }} />
                  </td>
                  <td style={{ padding: 6, fontWeight: 600 }}>#{w.order_number}</td>
                  <td style={{ padding: 6 }}>{w.customer || "—"}</td>
                  <td style={{ padding: 6 }} title={w.lines.map((l) => `${l.qty} × ${l.sku}`).join("\n")}>
                    {w.pieces} pc · {w.lines.length} line{w.lines.length === 1 ? "" : "s"}
                  </td>
                  <td style={{ padding: 6, color: "#6B6B6B" }}>{fmtDate(w.created_at)}</td>
                  <td style={{ padding: 6, maxWidth: 260 }}>
                    {w.last_attempt ? (
                      <span style={{ fontSize: 12, color: w.last_attempt.status === "failed" ? "#B42318" : "#B45309" }}>
                        {w.last_attempt.status === "test" ? "Sent as test" : w.last_attempt.error || w.last_attempt.status}
                      </span>
                    ) : <span style={{ color: "#8A8A8A", fontSize: 12 }}>Not sent</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <div style={{ flex: "1 1 300px", fontWeight: 700, fontSize: 15 }}>Supplier Orders</div>
        <Btn kind="ghost" onClick={track} busy={busy === "track"} disabled={!!busy}>Check for shipments</Btn>
      </div>
      {data.recent.length === 0 ? <p style={MUTED}>No orders sent yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B6B6B" }}>
                {["Order", "Status", "S&S order", "PO", "Tracking", "Sent"].map((h) => <th key={h} style={{ padding: 6, fontSize: 12 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #F2F2F2", verticalAlign: "top" }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>#{r.order_number}</td>
                  <td style={{ padding: 6 }}>
                    <Badge text={r.status === "test" ? "test" : r.status} color={STATUS_TONE[r.status] ?? "#6B6B6B"} />
                    {r.error && <div style={{ fontSize: 12, color: "#B42318", marginTop: 4, maxWidth: 260 }}>{r.error}</div>}
                  </td>
                  <td style={{ padding: 6 }}>{r.supplier_order_numbers || "—"}</td>
                  <td style={{ padding: 6 }}>{r.po_number || "—"}</td>
                  <td style={{ padding: 6 }}>{r.tracking_number ? `${r.carrier ? `${r.carrier} ` : ""}${r.tracking_number}` : "—"}</td>
                  <td style={{ padding: 6, color: "#6B6B6B", whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}<div style={{ fontSize: 11 }}>{r.trigger}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
