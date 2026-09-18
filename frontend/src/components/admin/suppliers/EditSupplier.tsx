"use client";

import { useEffect, useState } from "react";
import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import {
  suppliersService, type PriceRule, type SupplierConfig, type SupplierDetail, type SupplierJob,
} from "@/services/suppliers.service";
import { Badge, Btn, CARD, INPUT, LABEL, MUTED, Toggle, errText, fmtDate } from "./ui";

type Section = "connection" | "inventory" | "pricing" | "sync" | "order" | "advanced";

const SECTIONS: { id: Section; label: string; soon?: boolean }[] = [
  { id: "connection", label: "Connection" },
  { id: "inventory", label: "Inventory" },
  { id: "pricing", label: "Product pricing" },
  { id: "sync", label: "Automatic sync" },
  { id: "order", label: "Order settings", soon: true },
  { id: "advanced", label: "Advanced", soon: true },
];

export function EditSupplier({
  id, detail, running, onSaved, onJobStarted, onConnectionChanged,
}: {
  id: string; detail: SupplierDetail; running: boolean; onSaved: (c: SupplierConfig) => void;
  onJobStarted: (j: SupplierJob) => void; onConnectionChanged: () => void;
}) {
  const [section, setSection] = useState<Section>(detail.connection.connected ? "inventory" : "connection");
  const cfg = detail.config;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <nav style={{ ...CARD, padding: 6, flex: "0 0 200px", display: "grid", gap: 2 }}>
        {SECTIONS.map((s) => (
          <button key={s.id} disabled={s.soon} onClick={() => setSection(s.id)} style={{
            textAlign: "left", padding: "9px 10px", borderRadius: 8, border: "none", fontSize: 13,
            cursor: s.soon ? "default" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: section === s.id ? "#F2F2F2" : "transparent", fontWeight: section === s.id ? 700 : 500,
            color: s.soon ? "#B0B0B0" : "#1A1A1A",
          }}>
            {s.label}{s.soon && <span style={{ fontSize: 10 }}>Soon</span>}
          </button>
        ))}
      </nav>

      <div style={{ flex: "1 1 460px", minWidth: 0 }}>
        {section === "connection" && <Connection id={id} detail={detail} onSaved={onSaved} onConnectionChanged={onConnectionChanged} />}
        {section === "inventory" && <InventorySection id={id} cfg={cfg} onSaved={onSaved} />}
        {section === "pricing" && <PricingSection id={id} cfg={cfg} onSaved={onSaved} />}
        {section === "sync" && (
          <SyncSection id={id} cfg={cfg} connected={detail.connection.connected} running={running}
            onSaved={onSaved} onJobStarted={onJobStarted} />
        )}
      </div>
    </div>
  );
}

// ── Save helper ──────────────────────────────────────────────────────────────

function useSaver(id: string, onSaved: (c: SupplierConfig) => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (body: Parameters<typeof suppliersService.update>[1]) => {
    setBusy(true);
    setMsg(null);
    try {
      const { config } = await suppliersService.update(id, body);
      onSaved(config);
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy(false);
  };
  const note = msg && <span style={{ fontSize: 13, color: msg.ok ? "#16A34A" : "#B42318" }}>{msg.text}</span>;
  return { busy, save, note };
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>{children}</div>;
}

function Head({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
      <p style={MUTED}>{text}</p>
    </div>
  );
}

// ── Connection ───────────────────────────────────────────────────────────────

function Connection({ id, detail, onSaved, onConnectionChanged }: {
  id: string; detail: SupplierDetail; onSaved: (c: SupplierConfig) => void; onConnectionChanged: () => void;
}) {
  const [name, setName] = useState(detail.config.name);
  const { busy, save, note } = useSaver(id, onSaved);
  const [lastConnected, setLastConnected] = useState(detail.connection.connected);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <Head title="Supplier name" text="How this supplier is labelled in your admin." />
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ ...INPUT, width: "100%" }} />
        <Footer>{note}<Btn onClick={() => save({ name: name.trim() })} busy={busy} disabled={!name.trim() || name.trim() === detail.config.name}>Save</Btn></Footer>
      </div>
      <div>
        <IntegrationsPanel category="supplier" onChanged={(ps) => {
          const p = ps.find((x) => x.key === id);
          const now = !!p?.connection?.connected;
          if (now !== lastConnected) {
            setLastConnected(now);
            onConnectionChanged();
          }
        }} />
        <p style={{ ...MUTED, fontSize: 12, marginTop: 10 }}>
          Your account number and API key are stored for your store only. Catalogue, cost prices and stock all come
          from your own {detail.label} account.
        </p>
      </div>
    </div>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

function InventorySection({ id, cfg, onSaved }: { id: string; cfg: SupplierConfig; onSaved: (c: SupplierConfig) => void }) {
  const [sync, setSync] = useState(cfg.inventory.sync);
  const [safety, setSafety] = useState(String(cfg.inventory.safety_stock));
  const { busy, save, note } = useSaver(id, onSaved);
  const n = Math.max(0, Math.floor(Number(safety) || 0));
  const dirty = sync !== cfg.inventory.sync || n !== cfg.inventory.safety_stock;

  return (
    <div style={CARD}>
      <Head title="Inventory" text="Keep the stock of imported products matched to the supplier's warehouses." />
      <label style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Toggle on={sync} onChange={() => setSync(!sync)} />
        <span style={{ fontSize: 13 }}>
          <b>Sync inventory</b><br />
          <span style={{ color: "#8A8A8A" }}>Each sync sets your stock to the supplier&apos;s total across all its warehouses.</span>
        </span>
      </label>
      <label style={LABEL}>Safety stock (per variant)</label>
      <input type="number" min={0} value={safety} onChange={(e) => setSafety(e.target.value)} disabled={!sync}
        style={{ ...INPUT, width: 140 }} />
      <p style={{ ...MUTED, fontSize: 12, marginTop: 6 }}>
        Held back from what you show as available, so you don&apos;t sell the last few units the supplier may already have sold.
        {n > 0 && ` Example: supplier has 52 → your store shows ${Math.max(0, 52 - n)}.`}
      </p>
      <Footer>{note}<Btn onClick={() => save({ inventory: { sync, safety_stock: n } })} busy={busy} disabled={!dirty}>Save</Btn></Footer>
    </div>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────

const SCOPES: { id: PriceRule["scope"]; label: string }[] = [
  { id: "all", label: "All products" },
  { id: "brand", label: "Brand" },
  { id: "category", label: "Category" },
  { id: "style", label: "Style" },
];
const ROUNDING: { v: number | null; label: string }[] = [
  { v: null, label: "No rounding" },
  { v: 0.99, label: "End in .99" },
  { v: 0.95, label: "End in .95" },
  { v: 0, label: "Whole dollars" },
];

function PricingSection({ id, cfg, onSaved }: { id: string; cfg: SupplierConfig; onSaved: (c: SupplierConfig) => void }) {
  const [rules, setRules] = useState<PriceRule[]>(cfg.pricing.rules);
  const [round, setRound] = useState<number | null>(cfg.pricing.round_to);
  const { busy, save, note } = useSaver(id, onSaved);
  useEffect(() => { setRules(cfg.pricing.rules); setRound(cfg.pricing.round_to); }, [cfg.pricing]);

  const dirty = JSON.stringify({ rules, round }) !== JSON.stringify({ rules: cfg.pricing.rules, round: cfg.pricing.round_to });
  const set = (i: number, patch: Partial<PriceRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const incomplete = rules.some((r) => r.scope !== "all" && !r.value.trim());

  // Worked example with the broadest active rule.
  const ex = rules.find((r) => r.active && r.scope === "all") ?? rules.find((r) => r.active);
  const exPrice = ex ? roundPrice(10 * (1 + ex.markup_pct / 100) + ex.markup_fixed, round) : null;

  return (
    <div style={CARD}>
      <Head title="Product pricing" text="Your selling price = supplier cost + markup. The most specific rule wins: style, then brand, then category, then all products." />
      {rules.length === 0 && (
        <div style={{ fontSize: 13, color: "#8A8A8A", padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, marginBottom: 10 }}>
          No markup rules — imported products are priced at the supplier&apos;s cost + 40% (the default).
        </div>
      )}
      {rules.map((r, i) => (
        <div key={r.id ?? `new-${i}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8, opacity: r.active ? 1 : 0.55 }}>
          <select value={r.scope} onChange={(e) => set(i, { scope: e.target.value as PriceRule["scope"], value: e.target.value === "all" ? "" : r.value })} style={{ ...INPUT, flex: "0 1 140px" }}>
            {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {r.scope !== "all" && (
            <input value={r.value} onChange={(e) => set(i, { value: e.target.value })}
              placeholder={r.scope === "brand" ? "e.g. Gildan" : r.scope === "category" ? "e.g. T-Shirts" : "Style number, e.g. 3001"}
              style={{ ...INPUT, flex: "1 1 150px" }} />
          )}
          <span style={{ fontSize: 13 }}>+</span>
          <input type="number" value={r.markup_pct} onChange={(e) => set(i, { markup_pct: Number(e.target.value) || 0 })} style={{ ...INPUT, width: 80 }} />
          <span style={{ fontSize: 13 }}>% +$</span>
          <input type="number" step="0.01" value={r.markup_fixed} onChange={(e) => set(i, { markup_fixed: Number(e.target.value) || 0 })} style={{ ...INPUT, width: 80 }} />
          <Toggle on={r.active} onChange={() => set(i, { active: !r.active })} title={r.active ? "Active" : "Paused"} />
          <button type="button" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Remove rule"
            style={{ ...INPUT, width: 36, padding: 0, cursor: "pointer", color: "#B42318" }}>×</button>
        </div>
      ))}
      <Btn kind="ghost" onClick={() => setRules([...rules, { scope: rules.length ? "brand" : "all", value: "", markup_pct: 50, markup_fixed: 0, active: true }])}>
        + Add markup rule
      </Btn>

      <div style={{ marginTop: 18 }}>
        <label style={LABEL}>Price rounding</label>
        <select value={round === null ? "none" : String(round)} onChange={(e) => setRound(e.target.value === "none" ? null : Number(e.target.value))} style={{ ...INPUT, width: 200 }}>
          {ROUNDING.map((o) => <option key={o.label} value={o.v === null ? "none" : String(o.v)}>{o.label}</option>)}
        </select>
      </div>
      {exPrice !== null && (
        <p style={{ ...MUTED, fontSize: 12, marginTop: 10 }}>Example: a $10.00 item sells for <b>${exPrice.toFixed(2)}</b>.</p>
      )}
      <p style={{ ...MUTED, fontSize: 12, marginTop: 6 }}>Applies to products imported from now on; products already in your store keep their price.</p>
      <Footer>
        {incomplete && <span style={{ fontSize: 13, color: "#B45309" }}>Fill in the brand, category or style for each rule.</span>}
        {note}
        <Btn busy={busy} disabled={!dirty || incomplete} onClick={() => save({
          pricing: { rules: rules.map((r) => ({ ...r, value: r.value.trim() })), round_to: round },
        })}>Save</Btn>
      </Footer>
    </div>
  );
}

function roundPrice(p: number, to: number | null) {
  if (to === null) return p;
  if (p <= 0) return p;
  if (to === 0) return Math.ceil(p);
  const whole = Math.floor(p);
  const cand = whole + to;
  return cand >= p ? cand : whole + 1 + to;
}

// ── Automatic sync ───────────────────────────────────────────────────────────

const EVERY = [1, 3, 6, 12, 24, 48, 168];

function SyncSection({ id, cfg, connected, running, onSaved, onJobStarted }: {
  id: string; cfg: SupplierConfig; connected: boolean; running: boolean;
  onSaved: (c: SupplierConfig) => void; onJobStarted: (j: SupplierJob) => void;
}) {
  const [enabled, setEnabled] = useState(cfg.automatic_sync.enabled);
  const [every, setEvery] = useState(cfg.automatic_sync.every_hours);
  const [autoImport, setAutoImport] = useState(cfg.auto_import);
  const { busy, save, note } = useSaver(id, onSaved);
  const [starting, setStarting] = useState<"" | "stock" | "full">("");
  const [err, setErr] = useState("");
  const dirty = enabled !== cfg.automatic_sync.enabled || every !== cfg.automatic_sync.every_hours || autoImport !== cfg.auto_import;

  const run = async (full: boolean) => {
    setStarting(full ? "full" : "stock");
    setErr("");
    try {
      const { job } = await suppliersService.startSync(id, full);
      onJobStarted(job);
    } catch (e) {
      setErr(errText(e));
    }
    setStarting("");
  };

  const next = cfg.automatic_sync.enabled && cfg.last_sync_at
    ? new Date(new Date(cfg.last_sync_at).getTime() + cfg.automatic_sync.every_hours * 3600_000).toISOString()
    : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <Head title="Automatic sync" text="Runs on our servers on a schedule — your admin doesn't need to be open." />
        <label style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
          <span style={{ fontSize: 13 }}><b>Sync automatically</b></span>
        </label>
        <label style={LABEL}>Every</label>
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))} disabled={!enabled} style={{ ...INPUT, width: 160 }}>
          {EVERY.map((h) => <option key={h} value={h}>{h === 168 ? "week" : h === 1 ? "hour" : `${h} hours`}</option>)}
        </select>
        <label style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
          <Toggle on={autoImport} onChange={() => setAutoImport(!autoImport)} />
          <span style={{ fontSize: 13 }}>
            <b>Auto import</b><br />
            <span style={{ color: "#8A8A8A" }}>Each sync also imports new supplier products that match your import filters.</span>
          </span>
        </label>
        <p style={{ ...MUTED, fontSize: 12, marginTop: 12 }}>
          Stock is updated when inventory sync is on (Inventory section).
          {next && ` Next run around ${fmtDate(next)}.`}
        </p>
        <Footer>{note}<Btn busy={busy} disabled={!dirty} onClick={() => save({ automatic_sync: { enabled, every_hours: every }, auto_import: autoImport })}>Save</Btn></Footer>
      </div>

      <div style={CARD}>
        <Head title="Sync now" text="Run a sync right away instead of waiting for the schedule." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => run(false)} busy={starting === "stock"} disabled={!connected || running || !!starting || !cfg.inventory.sync}
            title={!cfg.inventory.sync ? "Inventory sync is off" : undefined}>Sync stock</Btn>
          <Btn kind="ghost" onClick={() => run(true)} busy={starting === "full"} disabled={!connected || running || !!starting}
            title="Stock, plus new matching products when Auto import is on">Full sync</Btn>
        </div>
        {!connected && <p style={{ ...MUTED, fontSize: 12, marginTop: 8 }}>Connect the supplier first.</p>}
        {err && <p style={{ fontSize: 13, color: "#B42318", marginTop: 8 }}>{err}</p>}
      </div>

      <div style={CARD}>
        <Head title="History" text="The last runs, newest first." />
        {cfg.history.length === 0 ? <p style={MUTED}>No runs yet.</p> : (
          <div style={{ display: "grid", gap: 0 }}>
            {cfg.history.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #F2F2F2" : "none", alignItems: "flex-start", flexWrap: "wrap" }}>
                <Badge text={h.status} color={h.status === "completed" ? "#16A34A" : h.status === "running" ? "#2563EB" : "#B42318"} />
                <div style={{ flex: "1 1 240px", fontSize: 13 }}>
                  <div><b>{h.kind === "import" ? "Import" : h.kind === "sync" ? "Full sync" : "Stock sync"}</b>
                    <span style={{ color: "#8A8A8A" }}> · {h.trigger === "schedule" ? "scheduled" : "manual"}</span></div>
                  {h.message && <div style={{ color: "#4A4A4A" }}>{h.message}</div>}
                </div>
                <div style={{ fontSize: 12, color: "#8A8A8A", whiteSpace: "nowrap" }}>{fmtDate(h.finished_at || h.started_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
