"use client";

/**
 * Edit Supplier — every setting for one supplier, in five tabs, saved together
 * with one "Save Supplier" (or thrown away with "Discard Changes").
 *
 * The draft lives here, so moving between tabs keeps unsaved edits. Credentials
 * go to the brand's connected-accounts record (verified with S&S on save); the
 * rest is the brand's supplier setup.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  suppliersService, type SupplierConfig, type SupplierDetail, type SupplierJob,
} from "@/services/suppliers.service";
import { ProductSettings } from "./ProductSettings";
import { SyncSettings } from "./SyncSettings";
import { OrderSettings } from "./OrderSettings";
import { Btn, CARD, INPUT, LABEL, MUTED, Spinner, errText } from "./ui";

export type Draft = Pick<SupplierConfig, "name" | "inventory" | "product" | "pricing" | "automatic_sync" | "orders">;
type Conn = { account_number: string; api_key: string; country: string; api_key_hint: string };
type Tab = "connection" | "inventory" | "product" | "sync" | "orders";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection Settings" },
  { id: "inventory", label: "Inventory Settings" },
  { id: "product", label: "Product Settings" },
  { id: "sync", label: "Automatic Sync" },
  { id: "orders", label: "Order Settings" },
];

const draftOf = (c: SupplierConfig): Draft => JSON.parse(JSON.stringify({
  name: c.name, inventory: c.inventory, product: c.product, pricing: c.pricing,
  automatic_sync: c.automatic_sync, orders: c.orders,
}));

export function EditSupplier({
  id, detail, running, onSaved, onJobStarted, onConnectionChanged, onDirtyChange,
}: {
  id: string; detail: SupplierDetail; running: boolean; onSaved: (c: SupplierConfig) => void;
  onJobStarted: (j: SupplierJob) => void; onConnectionChanged: () => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>(detail.connection.connected ? "inventory" : "connection");
  const [draft, setDraft] = useState<Draft>(() => draftOf(detail.config));
  const [saved, setSaved] = useState<Draft>(() => draftOf(detail.config));
  const [conn, setConn] = useState<Conn | null>(null);
  const [connSaved, setConnSaved] = useState<Conn | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadConn = useCallback(async () => {
    try {
      const r = await suppliersService.connection();
      const c = r.providers.find((p) => p.key === id)?.connection ?? {};
      const v: Conn = {
        account_number: String(c.account_number ?? ""), api_key: "",
        country: String(c.country ?? "United States") || "United States",
        api_key_hint: String(c.api_key_hint ?? ""),
      };
      setConn(v);
      setConnSaved(v);
    } catch {
      const v = { account_number: "", api_key: "", country: "United States", api_key_hint: "" };
      setConn(v);
      setConnSaved(v);
    }
  }, [id]);
  useEffect(() => { loadConn(); }, [loadConn]);

  const changed = useMemo(() => {
    const out: Partial<Draft> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach((k) => {
      if (JSON.stringify(draft[k]) !== JSON.stringify(saved[k])) (out as Record<string, unknown>)[k] = draft[k];
    });
    return out;
  }, [draft, saved]);
  const connDirty = !!conn && !!connSaved && (
    conn.account_number !== connSaved.account_number || conn.country !== connSaved.country || conn.api_key !== ""
  );
  const dirty = Object.keys(changed).length > 0 || connDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setMsg(null); };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      if (connDirty && conn) {
        if (!conn.account_number.trim()) throw new Error("Enter your S&S account number.");
        if (!connSaved?.api_key_hint && !conn.api_key.trim()) throw new Error("Enter your S&S API key.");
        await suppliersService.saveConnection({
          account_number: conn.account_number.trim(), api_key: conn.api_key.trim(), country: conn.country,
        });
        await loadConn();
        onConnectionChanged();
      }
      if (Object.keys(changed).length) {
        const { config } = await suppliersService.update(id, changed);
        onSaved(config);
        setDraft(draftOf(config));
        setSaved(draftOf(config));
      }
      setMsg({ ok: true, text: "Supplier saved." });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setSaving(false);
  };

  const discard = () => {
    setDraft(JSON.parse(JSON.stringify(saved)));
    if (connSaved) setConn({ ...connSaved });
    setMsg(null);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: "env(safe-area-inset-top, 0px)", zIndex: 5 }}>
        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Supplier</div>
          <p style={MUTED}>Manage supplier settings and configuration</p>
        </div>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? "#16A34A" : "#B42318", maxWidth: 420 }}>{msg.text}</span>}
        <Btn kind="ghost" onClick={discard} disabled={!dirty || saving}>Discard Changes</Btn>
        <Btn onClick={save} disabled={!dirty} busy={saving}>Save Supplier</Btn>
      </div>

      <div style={{ ...CARD, padding: 0 }}>
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #EEE", overflowX: "auto", padding: "0 8px" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "13px 14px", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#1A1A1A" : "#6B6B6B",
              borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent", marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ padding: 18 }}>
          {tab === "connection" && (conn
            ? <ConnectionTab label={detail.label} name={draft.name} onName={(v) => set("name", v)} conn={conn}
                onConn={(c) => { setConn(c); setMsg(null); }}
                onDisconnected={async () => { await loadConn(); onConnectionChanged(); setMsg({ ok: true, text: "Disconnected. Your API key was removed." }); }} />
            : <div style={{ padding: 20, textAlign: "center" }}><Spinner /></div>)}
          {tab === "inventory" && <InventoryTab id={id} value={draft.inventory} onChange={(v) => set("inventory", v)} connected={detail.connection.connected} />}
          {tab === "product" && (
            <ProductSettings id={id} meta={detail.meta} product={draft.product} pricing={draft.pricing}
              onProduct={(v) => set("product", v)} onPricing={(v) => set("pricing", v)} connected={detail.connection.connected} />
          )}
          {tab === "sync" && (
            <SyncSettings id={id} value={draft.automatic_sync} onChange={(v) => set("automatic_sync", v)}
              history={detail.config.history} lastSync={detail.config.last_sync_at}
              connected={detail.connection.connected} running={running} dirty={dirty} onJobStarted={onJobStarted} />
          )}
          {tab === "orders" && (
            <OrderSettings id={id} value={draft.orders} saved={saved.orders} onChange={(v) => set("orders", v)}
              meta={detail.meta} connected={detail.connection.connected} dirty={dirty} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Connection ───────────────────────────────────────────────────────────────

function ConnectionTab({ label, name, onName, conn, onConn, onDisconnected }: {
  label: string; name: string; onName: (v: string) => void; conn: Conn; onConn: (c: Conn) => void;
  onDisconnected: () => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const saved = !!conn.api_key_hint;

  const disconnect = async () => {
    if (!window.confirm(
      `Disconnect ${label}?

Your account number and API key are removed from this store. Nothing is imported, synced or sent until you connect again. Imported products and your settings stay.

To pause it without removing the key, turn it off in Manage Suppliers instead.`,
    )) return;
    setRemoving(true);
    setResult(null);
    try {
      await suppliersService.disconnect();
      await onDisconnected();
    } catch (e) {
      setResult({ ok: false, text: errText(e) });
    }
    setRemoving(false);
  };
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await suppliersService.testConnection({
        account_number: conn.account_number.trim(), api_key: conn.api_key.trim(), country: conn.country,
      });
      setResult({ ok: r.ok, text: r.message });
    } catch (e) {
      setResult({ ok: false, text: errText(e) });
    }
    setTesting(false);
  };

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{label} Connection Credentials</div>
      <Field label="Supplier Name" required help="A name to identify this supplier connection in your admin.">
        <input value={name} maxLength={80} onChange={(e) => onName(e.target.value)} style={{ ...INPUT, width: "100%" }} />
      </Field>
      <Field label="Username" required help="Your S&S account number.">
        <input value={conn.account_number} onChange={(e) => onConn({ ...conn, account_number: e.target.value })}
          placeholder="e.g. 123456" autoComplete="off" style={{ ...INPUT, width: "100%" }} />
      </Field>
      <Field label="API Key" required
        help={conn.api_key_hint ? `Saved (${conn.api_key_hint}). Leave blank to keep it; type a new key to replace it.`
          : "Don't have one? Email api@ssactivewear.com or contact your S&S rep."}>
        <input value={conn.api_key} onChange={(e) => onConn({ ...conn, api_key: e.target.value })} type="password"
          placeholder={conn.api_key_hint ? "•••••••• saved" : "Paste your API key"} autoComplete="new-password"
          style={{ ...INPUT, width: "100%" }} />
      </Field>
      <Field label="Country" required help="S&S Canada accounts use S&S's Canadian API, catalogue and warehouses.">
        <select value={conn.country} onChange={(e) => onConn({ ...conn, country: e.target.value })} style={{ ...INPUT, width: "100%" }}>
          <option>United States</option>
          <option>Canada</option>
        </select>
      </Field>
      <div style={{ borderTop: "1px solid #EEE", paddingTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Test Supplier Connection</div>
          <p style={MUTED}>Check that these credentials can reach S&S. Saving the supplier tests them too.</p>
        </div>
        <Btn kind="ghost" onClick={test} busy={testing} disabled={!conn.account_number.trim() || (!conn.api_key && !conn.api_key_hint)}>Test</Btn>
      </div>
      {result && <div style={{ fontSize: 13, color: result.ok ? "#16A34A" : "#B42318" }}>{result.text}</div>}
      {saved && (
        <div style={{ borderTop: "1px solid #EEE", paddingTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Disconnect Supplier</div>
            <p style={MUTED}>Remove your account number and API key from this store. To pause without removing them, use the on/off switch in Manage Suppliers.</p>
          </div>
          <Btn kind="danger" onClick={disconnect} busy={removing}>Disconnect</Btn>
        </div>
      )}
    </div>
  );
}

export function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}{required && <span style={{ color: "#B42318" }}> *</span>}</label>
      {children}
      {help && <p style={{ ...MUTED, fontSize: 12, marginTop: 6 }}>{help}</p>}
    </div>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

function InventoryTab({ id, value, onChange, connected }: {
  id: string; value: Draft["inventory"]; onChange: (v: Draft["inventory"]) => void; connected: boolean;
}) {
  const [data, setData] = useState<{ locations: { id: string; name: string; code: string; city: string }[]; warehouses: { code: string; label: string }[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    suppliersService.locations(id).then(setData).catch((e) => setError(errText(e)));
  }, [id]);

  // Nothing saved yet means: first location gets everything but drop-ship.
  const sourceFor = (locId: string, index: number) =>
    Object.keys(value.locations).length ? (value.locations[locId] ?? "none") : (index === 0 ? "all_except_ds" : "none");

  const setSource = (locId: string, src: string) => {
    const base: Record<string, string> = {};
    data?.locations.forEach((l, i) => { base[l.id] = sourceFor(l.id, i); });
    onChange({ ...value, locations: { ...base, [locId]: src } });
  };

  const fed = data?.locations.filter((l, i) => sourceFor(l.id, i) !== "none").length ?? 0;

  return (
    <div style={{ display: "grid", gap: 22, maxWidth: 900 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Import Supplier Inventory to Store Locations</div>
        <p style={MUTED}>Supplier stock is written to your store locations — choose which S&S warehouses feed each one.</p>
      </div>
      {error && <p style={{ color: "#B42318", fontSize: 13 }}>{error}</p>}
      {!data && !error && <Spinner />}
      {data && data.locations.length === 0 && (
        <p style={MUTED}>You have no store locations yet — your first import creates a “Default Warehouse” and fills it from every S&S warehouse except drop-ship.</p>
      )}
      {data?.locations.map((l, i) => (
        <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid #EEE", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ flex: "1 1 240px", fontSize: 13 }}>
            <b>Store location:</b> {l.name}{l.city ? ` — ${l.city}` : ""} <span style={{ color: "#8A8A8A" }}>({l.code})</span>
          </div>
          <span style={{ color: "#8A8A8A" }}>←</span>
          <select value={sourceFor(l.id, i)} onChange={(e) => setSource(l.id, e.target.value)} style={{ ...INPUT, flex: "0 1 300px" }}>
            <option value="none">Don&apos;t import stock here</option>
            <option value="all_except_ds">Supplier inventory: All except Dropshipping</option>
            <option value="all">Supplier inventory: All warehouses</option>
            <option value="DS">Supplier inventory: Dropshipping</option>
            {data.warehouses.map((w) => <option key={w.code} value={w.code}>Supplier inventory: {w.label}</option>)}
          </select>
        </div>
      ))}
      {data && data.locations.length > 0 && fed === 0 && (
        <p style={{ fontSize: 13, color: "#B45309" }}>No location receives supplier stock — stock syncs will have nowhere to write.</p>
      )}
      {!connected && <p style={{ ...MUTED, fontSize: 12 }}>Connect the supplier to list its warehouses.</p>}

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #EEE", paddingTop: 18 }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Inventory Adjustment Quantity</div>
          <p style={MUTED}>Supplier inventory is reduced by this much per variant, as a buffer against overselling.
            {value.safety_stock > 0 && ` Example: S&S has 52 → your store shows ${Math.max(0, 52 - value.safety_stock)}.`}</p>
        </div>
        <input type="number" min={0} value={value.safety_stock} placeholder="Adjustment Quantity"
          onChange={(e) => onChange({ ...value, safety_stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          style={{ ...INPUT, width: 180 }} />
      </div>
    </div>
  );
}
