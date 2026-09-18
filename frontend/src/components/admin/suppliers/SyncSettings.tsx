"use client";

import { useState } from "react";
import { suppliersService, type AutoSync, type HistoryEntry, type SupplierJob } from "@/services/suppliers.service";
import { Badge, Btn, INPUT, LABEL, MUTED, errText, fmtDate } from "./ui";

const FREQ: { v: number; label: string }[] = [
  { v: 1, label: "Every hour" }, { v: 3, label: "Every 3 hours" }, { v: 6, label: "Every 6 hours" },
  { v: 12, label: "Every 12 hours" }, { v: 24, label: "Every day" }, { v: 48, label: "Every 2 days" },
  { v: 168, label: "Every week" },
];

export function SyncSettings({ id, value, onChange, history, lastSync, connected, running, dirty, onJobStarted }: {
  id: string; value: AutoSync; onChange: (v: AutoSync) => void; history: HistoryEntry[]; lastSync: string | null;
  connected: boolean; running: boolean; dirty: boolean; onJobStarted: (j: SupplierJob) => void;
}) {
  const set = <K extends keyof AutoSync>(k: K, v: AutoSync[K]) => onChange({ ...value, [k]: v });
  const [starting, setStarting] = useState<"" | "stock" | "full">("");
  const [err, setErr] = useState("");

  const run = async (full: boolean) => {
    setStarting(full ? "full" : "stock");
    setErr("");
    try {
      onJobStarted((await suppliersService.startSync(id, full)).job);
    } catch (e) {
      setErr(errText(e));
    }
    setStarting("");
  };

  const next = value.enabled && lastSync ? new Date(new Date(lastSync).getTime() + value.every_hours * 3600_000).toISOString() : null;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <Card title="Maximum Variants Per Product" help="Products are imported with at most this many variants.">
          <select value={value.max_variants} onChange={(e) => set("max_variants", Number(e.target.value))} style={{ ...INPUT, width: "100%" }}>
            <option value={100}>100 Variants</option>
            <option value={250}>250 Variants</option>
            <option value={2048}>2048 Variants</option>
            <option value={0}>No limit</option>
          </select>
        </Card>
        <Card title="Frequency of Automatic Sync" help="How often our servers sync this supplier — your admin doesn't need to be open.">
          <select value={value.enabled ? value.every_hours : 0}
            onChange={(e) => { const n = Number(e.target.value); onChange({ ...value, enabled: n > 0, every_hours: n || value.every_hours }); }}
            style={{ ...INPUT, width: "100%" }}>
            <option value={0}>Off — only when I click Sync</option>
            {FREQ.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
          </select>
        </Card>
        <Card title="Action on Unavailable Products" help="What to do with products (or variants) S&S no longer sells.">
          <select value={value.on_unavailable} onChange={(e) => set("on_unavailable", e.target.value as AutoSync["on_unavailable"])} style={{ ...INPUT, width: "100%" }}>
            <option value="none">No Action</option>
            <option value="zero_stock">Set stock to 0</option>
            <option value="draft">Set product to Draft (variants: discontinued)</option>
            <option value="archive">Archive product (variants: discontinued)</option>
          </select>
        </Card>
        <Card title="Update Settings" help="Which fields a sync changes on products already in your store.">
          <select value={value.update} onChange={(e) => set("update", e.target.value as AutoSync["update"])} style={{ ...INPUT, width: "100%" }}>
            <option value="inventory">Only Inventory</option>
            <option value="inventory_price">Inventory and Prices</option>
            <option value="all">Everything (all matched fields)</option>
            <option value="none">Nothing</option>
          </select>
        </Card>
        <Card title="Auto Create Products & Variants" help="What a sync creates, based on your saved import filters.">
          <select value={value.create} onChange={(e) => set("create", e.target.value as AutoSync["create"])} style={{ ...INPUT, width: "100%" }}>
            <option value="always">Always Create Products & Variants</option>
            <option value="variants_only">Only New Variants on Existing Products</option>
            <option value="never">Don&apos;t Create Anything</option>
          </select>
        </Card>
        <Card title="Always Update Variant Images" help="“Always” refreshes images on every sync, whatever the update setting.">
          <select value={value.images} onChange={(e) => set("images", e.target.value as AutoSync["images"])} style={{ ...INPUT, width: "100%" }}>
            <option value="use_update">Use Update Settings</option>
            <option value="always">Always</option>
          </select>
        </Card>
        <Card title="Handle Variant Limit" help="For products with more variants than the maximum.">
          <select value={value.variant_limit} onChange={(e) => set("variant_limit", e.target.value as AutoSync["variant_limit"])}
            disabled={!value.max_variants} style={{ ...INPUT, width: "100%" }}>
            <option value="limit">Limit Products to Max Variants (Default)</option>
            <option value="skip">Skip Products Over the Limit</option>
          </select>
        </Card>
      </div>
      {next && <p style={{ ...MUTED, fontSize: 12 }}>Next automatic sync around {fmtDate(next)}.</p>}

      <div style={{ borderTop: "1px solid #EEE", paddingTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Sync Now</div>
        <p style={{ ...MUTED, marginBottom: 10 }}>
          Sync stock updates quantities only. Full sync applies all the settings above right now.
          {dirty && " Save your changes first — a sync uses the saved settings."}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => run(false)} busy={starting === "stock"} disabled={!connected || running || !!starting}>Sync stock</Btn>
          <Btn kind="ghost" onClick={() => run(true)} busy={starting === "full"} disabled={!connected || running || !!starting}>Full sync</Btn>
        </div>
        {!connected && <p style={{ ...MUTED, fontSize: 12, marginTop: 8 }}>Connect the supplier first.</p>}
        {err && <p style={{ fontSize: 13, color: "#B42318", marginTop: 8 }}>{err}</p>}
      </div>

      <div style={{ borderTop: "1px solid #EEE", paddingTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Sync History</div>
        {history.length === 0 ? <p style={MUTED}>No runs yet.</p> : history.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #F2F2F2" : "none", alignItems: "flex-start", flexWrap: "wrap" }}>
            <Badge text={h.status} color={h.status === "completed" ? "#16A34A" : h.status === "running" ? "#2563EB" : "#B42318"} />
            <div style={{ flex: "1 1 240px", fontSize: 13 }}>
              <b>{h.kind === "import" ? "Import" : h.kind === "sync" ? "Full sync" : "Stock sync"}</b>
              <span style={{ color: "#8A8A8A" }}> · {h.trigger === "schedule" ? "scheduled" : "manual"}</span>
              {h.message && <div style={{ color: "#4A4A4A" }}>{h.message}</div>}
            </div>
            <div style={{ fontSize: 12, color: "#8A8A8A", whiteSpace: "nowrap" }}>{fmtDate(h.finished_at || h.started_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #E3E3E3", borderRadius: 12, padding: 16 }}>
      <label style={{ ...LABEL, fontSize: 13, color: "#1A1A1A" }}>{title}</label>
      {children}
      {help && <p style={{ ...MUTED, fontSize: 12, marginTop: 8 }}>{help}</p>}
    </div>
  );
}
