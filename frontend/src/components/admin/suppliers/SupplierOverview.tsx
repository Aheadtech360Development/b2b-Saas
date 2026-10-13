"use client";

/**
 * Suppliers at a glance: each catalogue the shop can connect, how far it has
 * come in four steps (connect, import, sync, send orders), and the manual
 * suppliers it buys from by purchase order (the manufacturers). Everything a
 * catalogue can be set to sits behind Advanced settings (SupplierView).
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { suppliersService, type SupplierRow } from "@/services/suppliers.service";
import { errText, fmtDate } from "./ui";

export type SupplierTab = "import" | "browse" | "edit";

interface Maker { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; notes?: string | null }
type MakerDraft = { name: string; contact_name: string; email: string; phone: string; notes: string };
const NO_MAKER: MakerDraft = { name: "", contact_name: "", email: "", phone: "", notes: "" };
const MAKERS = "/api/v1/admin/purchase-orders/manufacturers";

/** The four steps, each done or not, and the words under it. */
function steps(r: SupplierRow): { title: string; sub: string; done: boolean }[] {
  const sync = r.automatic_sync;
  const orders = r.orders;
  const sending = !!orders && orders.sync !== "disabled";
  return [
    { title: "Connect", sub: r.connected ? `Account ${r.account ?? "connected"}` : "Account number and API key", done: r.connected },
    { title: "Import", sub: r.imported ? `${r.imported} ${r.imported === 1 ? "product" : "products"} in your catalog` : "Choose products", done: !!r.imported },
    { title: "Sync", sub: sync?.enabled ? `Stock and prices every ${sync.every_hours} h` : r.last_sync_at ? "Synced by hand" : "Stock and prices", done: !!sync?.enabled },
    { title: "Auto-order", sub: sending ? (orders!.test_mode ? "Test mode, nothing is placed" : "Orders go to the supplier") : `Send orders to ${r.label.split(" ")[0]}`, done: sending && !orders!.test_mode },
  ];
}

export function SupplierOverview({ onOpen, addOpen, onAddClosed }: {
  onOpen: (id: string, tab: SupplierTab) => void;
  /** The frame's "Add manual supplier" button opens the form here. */
  addOpen: boolean;
  onAddClosed: () => void;
}) {
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [makers, setMakers] = useState<Maker[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Maker | "new" | null>(null);

  const load = useCallback(async () => {
    try { setRows(await suppliersService.list()); setError(""); }
    catch (e) { setError(errText(e)); setRows([]); }
    try { setMakers(await apiClient.get<Maker[]>(MAKERS)); }
    catch { setMakers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (addOpen) setEditing("new"); }, [addOpen]);

  // Keep a running import or sync's progress fresh.
  const running = rows?.some((r) => r.job?.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function toggleOn(r: SupplierRow) {
    const off = r.active !== false;
    if (off && !await ask(`Turn off ${r.name || r.label}? Nothing is imported, synced or sent to it until you turn it back on. Your key, settings and products stay as they are.`, { title: "Turn off the supplier", ok: "Turn off", danger: true })) return;
    setBusy(r.id);
    try { await suppliersService.update(r.id, { active: !off }); await load(); }
    catch (e) { setError(errText(e)); }
    setBusy("");
  }

  async function toggleAuto(r: SupplierRow) {
    setBusy(`auto:${r.id}`);
    try { await suppliersService.update(r.id, { auto_import: !r.auto_import }); await load(); }
    catch (e) { setError(errText(e)); }
    setBusy("");
  }

  const closeMaker = () => { setEditing(null); onAddClosed(); };

  return (
    <div style={{ display: "grid", gap: "18px" }} data-suppliers>
      {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
      {rows === null && <div className="pc-card" style={{ padding: "22px" }}><div className="at-skel" style={{ height: "18px", width: "50%", borderRadius: "6px" }} /></div>}

      {rows?.map((r) => {
        if (!r.available) {
          return (
            <section key={r.id} className="pc-card" style={{ padding: "18px 20px" }} data-supplier={r.id}>
              <h2 className="pc-h2">{r.label}</h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
                <span className="pc-pill" style={{ textTransform: "none" }}>Coming soon</span>
              </div>
              <p className="pc-sub-line" style={{ margin: "10px 0 0" }}>Not available yet.</p>
            </section>
          );
        }
        const all = steps(r);
        const at = all.findIndex((s) => !s.done);
        const on = r.active !== false;
        const [pill, tone] = !r.connected ? ["Not connected", "amber"] : on ? ["Connected", "green"] : ["Off", ""];
        return (
          <section key={r.id} className="pc-card" style={{ padding: "18px 20px" }} data-supplier={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <h2 className="pc-h2">{r.name || r.label}</h2>
              {r.connected && (
                <span className="pc-switch-row" style={{ alignItems: "center", fontSize: "13.5px" }}>
                  {on ? "On" : "Off"}
                  <button type="button" className="pc-switch" role="switch" aria-label={`${r.label} on`} aria-checked={on} data-on={on ? "" : undefined}
                    disabled={busy === r.id} onClick={() => toggleOn(r)} />
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "10px" }}>
              <span className="pc-pill" data-tone={tone || undefined} style={{ textTransform: "none" }}>{pill}</span>
              <span className="pc-sub-line" style={{ fontSize: "13px" }}>
                {r.last_sync_at ? `Last sync ${fmtDate(r.last_sync_at)}.` : "Never synced."}
                {" "}{r.imported ? `${r.imported} ${r.imported === 1 ? "product" : "products"} imported.` : "Nothing imported yet."}
              </span>
            </div>
            {r.job?.status === "running" && (
              <div className="pc-note" data-tone="blue" style={{ marginTop: "12px" }}>{r.job.kind === "import" ? "Importing" : "Syncing"}… {r.job.message}</div>
            )}
            <ol className="pc-steps4" aria-label="Setup">
              {all.map((s, i) => (
                <li key={s.title} data-done={s.done ? "" : undefined} data-now={i === at ? "" : undefined}>
                  <span className="pc-step-n" aria-hidden>{s.done ? "✓" : i + 1}</span>
                  <b>{s.title}</b>
                  <span>{s.sub}</span>
                </li>
              ))}
            </ol>
            {r.connected && on && (
              <div className="pc-switch-row" style={{ marginBottom: "16px", maxWidth: "560px" }}>
                <span>Auto import
                  <div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>Each sync also brings in new products that match your import filters.</div>
                </span>
                <button type="button" className="pc-switch" role="switch" aria-label="Auto import" aria-checked={!!r.auto_import} data-on={r.auto_import ? "" : undefined}
                  disabled={busy === `auto:${r.id}`} onClick={() => toggleAuto(r)} />
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {!r.connected
                ? <button type="button" className="pc-btn" data-kind="primary" onClick={() => onOpen(r.id, "edit")}>Connect {r.label.split(" ")[0]}</button>
                : <button type="button" className="pc-btn" data-kind="primary" onClick={() => onOpen(r.id, r.imported ? "import" : "browse")}>{r.imported ? "Choose products" : "Import products"}</button>}
              <button type="button" className="pc-btn" onClick={() => onOpen(r.id, "edit")}>Advanced settings</button>
            </div>
          </section>
        );
      })}

      <section className="pc-card" data-manual-suppliers>
        <div className="pc-card-head" style={{ display: "block" }}>
          <h2 className="pc-h2">Manual suppliers</h2>
          <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>People you buy from outside a catalogue, used on purchase orders.</p>
        </div>
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "560px" }}>
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {makers === null && <tr><td colSpan={4}><div className="at-skel" style={{ height: "16px", width: "40%", borderRadius: "6px" }} /></td></tr>}
              {makers?.length === 0 && <tr><td colSpan={4} className="pc-empty">No manual suppliers yet. Add the people you order blanks or prints from by hand.</td></tr>}
              {makers?.map((m) => (
                <tr key={m.id} data-href tabIndex={0} onClick={() => setEditing(m)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(m); }}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{m.contact_name || <span style={{ color: "var(--pc-muted)" }}>Not given</span>}</td>
                  <td className="pc-td-clip">{m.email || <span style={{ color: "var(--pc-muted)" }}>Not given</span>}</td>
                  <td>{m.phone || <span style={{ color: "var(--pc-muted)" }}>Not given</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <MakerModal maker={editing === "new" ? null : editing} onClose={closeMaker} onSaved={() => { closeMaker(); load(); }} />}
    </div>
  );
}

function MakerModal({ maker, onClose, onSaved }: { maker: Maker | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<MakerDraft>(maker
    ? { name: maker.name, contact_name: maker.contact_name ?? "", email: maker.email ?? "", phone: maker.phone ?? "", notes: maker.notes ?? "" }
    : NO_MAKER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof MakerDraft, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the supplier a name."); return; }
    setSaving(true); setError("");
    const body = {
      name: f.name.trim(), contact_name: f.contact_name.trim() || null, email: f.email.trim() || null,
      phone: f.phone.trim() || null, notes: f.notes.trim() || null,
    };
    try {
      if (maker) await apiClient.put(`${MAKERS}/${maker.id}`, body);
      else await apiClient.post(MAKERS, body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The supplier could not be saved.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!maker || !await ask(`Remove ${maker.name}? Purchase orders already made with them keep their name.`, { title: "Remove supplier", ok: "Remove", danger: true })) return;
    setSaving(true);
    try { await apiClient.delete(`${MAKERS}/${maker.id}`); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "The supplier could not be removed."); setSaving(false); }
  }

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label={maker ? maker.name : "Add manual supplier"} onSubmit={save} data-maker-modal>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">{maker ? maker.name : "Add manual supplier"}</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>Somebody you order from by hand. They show on purchase orders.</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px" }}>
          {error && <div className="pc-note" data-tone="red" style={{ marginBottom: "12px" }} role="alert">{error}</div>}
          <div className="pc-form2">
            <label className="pc-wide"><span className="pc-label">Name *</span>
              <input className="pc-input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus required /></label>
            <label><span className="pc-label">Contact</span><input className="pc-input" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></label>
            <label><span className="pc-label">Phone</span><input className="pc-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="pc-wide"><span className="pc-label">Email</span><input className="pc-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="pc-wide"><span className="pc-label">Notes</span><textarea className="pc-input" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Lead times, minimums, account number" /></label>
          </div>
        </div>
        <div className="pc-panel-foot" style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          {maker ? <button type="button" className="pc-btn" onClick={remove} disabled={saving}>Remove</button> : <span />}
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="pc-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="pc-btn" data-kind="primary" disabled={saving}>{saving ? "Saving…" : maker ? "Save" : "Add supplier"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
