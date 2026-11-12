"use client";

/**
 * Products → Inventory sync: the brand's own inventory system feeding the
 * shop's stock, AdvancePro (by AdvanceWare) first. Three parts: the login
 * (saved with the brand's other accounts, tested before it is kept), where
 * the stock goes (each store location takes every AdvancePro warehouse added
 * up, one warehouse, or nothing), and the sync itself (now, or on a schedule,
 * with what the last runs did). Server: backend/app/services/inventory_sync.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@/lib/dialog";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { UpgradeNotice } from "@/components/admin/UpgradeNotice";
import { Badge, Btn, CARD, INPUT, LABEL, MUTED, Spinner, Toggle, errText, fmtDate } from "@/components/admin/suppliers/ui";
import {
  inventorySyncService as api, type ApWarehouse, type StoreLocation, type SyncConfig, type SyncConnector, type SyncJob,
} from "@/services/inventorySync.service";

const KEY = "advancepro";

export function everyLabel(m: number): string {
  if (m < 60) return `${m} minutes`;
  if (m === 60) return "hour";
  if (m < 1440) return `${m / 60} hours`;
  return "day";
}

export default function InventorySyncPage() {
  return (
    <ProductsFrame active="inventory-sync" title="Inventory sync"
      sub="Keep your shop's stock in step with the inventory system you already use.">
      <UpgradeNotice feature="inventory_sync" addOn
        blurb="Your shop's stock follows AdvancePro on its own, every few minutes.">
        <InventorySync />
      </UpgradeNotice>
    </ProductsFrame>
  );
}

export function InventorySync() {
  const [connector, setConnector] = useState<SyncConnector | null>(null);
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [everyOptions, setEveryOptions] = useState<number[]>([15, 30, 60, 180, 360, 720, 1440]);
  const [error, setError] = useState("");
  const [job, setJob] = useState<SyncJob | null>(null);
  const lastStatus = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const r = await api.overview();
      const c = r.connectors.find((x) => x.key === KEY) ?? null;
      setConnector(c);
      setLocations(r.locations);
      if (r.every_minutes?.length) setEveryOptions(r.every_minutes);
      setJob(c?.job ?? null);
      lastStatus.current = c?.job?.status;
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // While a sync runs, follow it; when it ends, read what it changed.
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const { job: j } = await api.job(KEY);
        setJob(j);
        if (lastStatus.current === "running" && j?.status !== "running") void load();
        lastStatus.current = j?.status;
      } catch { /* try again next tick */ }
    }, 2000);
    return () => clearInterval(t);
  }, [job?.status, load]);

  if (error && !connector) return <div className="pc-flash" data-bad="" role="alert">{error}</div>;
  if (!connector) return <div style={{ padding: 30, textAlign: "center" }}><Spinner /></div>;

  const connected = connector.connection.connected;
  const cfg = connector.config;
  return (
    <div style={{ maxWidth: 980, display: "grid", gap: 14 }} data-inventory-sync={KEY}>
      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}
      <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span aria-hidden style={{ fontSize: 26 }}>📊</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{connector.label}</div>
          <p style={MUTED}>The inventory system by {connector.by ?? "AdvanceWare"}. Your shop&apos;s stock follows it, matched by SKU.</p>
        </div>
        {!connected ? <Badge text="Not connected" color="#D97706" />
          : cfg.active ? <Badge text={`Syncing every ${everyLabel(cfg.every_minutes)}`} color="#0F7B4B" />
          : <Badge text="Connected, not syncing on its own" color="#344054" />}
        {cfg.last_sync_at && <span style={MUTED}>Last sync {fmtDate(cfg.last_sync_at)}</span>}
      </div>

      <Connection connector={connector} onChanged={load} />
      {connected && (
        <>
          <Setup config={cfg} locations={locations}
            everyOptions={everyOptions} onSaved={(c) => setConnector((x) => (x ? { ...x, config: c } : x))} />
          <Runs connector={connector} job={job} onStarted={(j) => { lastStatus.current = "running"; setJob(j); }} />
        </>
      )}
    </div>
  );
}

// ── The login ────────────────────────────────────────────────────────────────
function Connection({ connector, onChanged }: { connector: SyncConnector; onChanged: () => void }) {
  const conn = connector.connection;
  const [editing, setEditing] = useState(!conn.connected);
  const [username, setUsername] = useState(conn.username ?? "");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrl] = useState(conn.api_url ?? "");
  const [busy, setBusy] = useState<"" | "test" | "connect" | "disconnect">("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const values = () => ({ username: username.trim(), password, api_url: apiUrl.trim() });
  const test = async () => {
    setBusy("test"); setNote(null);
    try {
      const r = await api.test(KEY, values());
      setNote({ ok: r.ok, text: r.message });
    } catch (e) { setNote({ ok: false, text: errText(e) }); }
    setBusy("");
  };
  const connect = async () => {
    setBusy("connect"); setNote(null);
    try {
      const r = await api.connect(KEY, values());
      setNote({ ok: true, text: r.message || "Connected." });
      setPassword("");
      setEditing(false);
      onChanged();
    } catch (e) { setNote({ ok: false, text: errText(e) }); }
    setBusy("");
  };
  const disconnect = async () => {
    if (!await ask("Disconnect AdvancePro? The sync stops; your shop's stock stays as it is now.", { ok: "Disconnect" })) return;
    setBusy("disconnect");
    try {
      await api.disconnect(KEY);
      await api.save(KEY, { active: false }).catch(() => undefined);
      onChanged();
    } catch (e) { setNote({ ok: false, text: errText(e) }); }
    setBusy("");
  };

  if (conn.connected && !editing) {
    return (
      <section style={CARD} data-connection="connected">
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Login</h2>
        <p style={MUTED}>Signed in as <b>{conn.username}</b>{conn.api_url ? <> at {conn.api_url}</> : null}.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={() => setEditing(true)}>Change login</Btn>
          <Btn kind="danger" onClick={disconnect} busy={busy === "disconnect"}>Disconnect</Btn>
        </div>
        {note && <p role="status" style={{ ...MUTED, marginTop: 10, color: note.ok ? "#0F7B4B" : "#C8321F" }}>{note.text}</p>}
      </section>
    );
  }
  return (
    <section style={CARD} data-connection="form">
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Connect AdvancePro</h2>
      <p style={{ ...MUTED, marginBottom: 12 }}>
        Ask AdvancePro support for an API user for your company (a test company first, if you have one), with
        two-factor sign-in turned off for it. Its stock is only read: nothing in AdvancePro is changed.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label><span style={LABEL}>API username</span>
          <input style={{ ...INPUT, width: "100%" }} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </label>
        <label><span style={LABEL}>API password</span>
          <input style={{ ...INPUT, width: "100%" }} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={conn.password_set ? `Saved (${conn.password_hint}). Leave empty to keep it.` : ""} autoComplete="new-password" />
        </label>
        <label><span style={LABEL}>API address <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <input style={{ ...INPUT, width: "100%" }} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://advanceware.net/restapibeta" />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Btn kind="ghost" onClick={test} busy={busy === "test"} disabled={!username.trim() || (!password && !conn.password_set)}>Test</Btn>
        <Btn onClick={connect} busy={busy === "connect"} disabled={!username.trim() || (!password && !conn.password_set)}>Connect</Btn>
        {conn.connected && <Btn kind="ghost" onClick={() => { setEditing(false); setNote(null); }}>Cancel</Btn>}
      </div>
      {note && <p role="status" style={{ ...MUTED, marginTop: 10, color: note.ok ? "#0F7B4B" : "#C8321F" }}>{note.text}</p>}
    </section>
  );
}

// ── Where the stock goes, and when ───────────────────────────────────────────
function Setup({ config, locations, everyOptions, onSaved }: {
  config: SyncConfig; locations: StoreLocation[]; everyOptions: number[]; onSaved: (c: SyncConfig) => void;
}) {
  const [houses, setHouses] = useState<ApWarehouse[] | null>(null);
  const [housesError, setHousesError] = useState("");
  const [locs, setLocs] = useState<Record<string, string>>(config.locations ?? {});
  const [safety, setSafety] = useState(String(config.safety_stock ?? 0));
  const [countStock, setCountStock] = useState(config.count_stock);
  const [missing, setMissing] = useState(config.missing);
  const [active, setActive] = useState(config.active);
  const [every, setEvery] = useState(config.every_minutes);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.warehouses(KEY).then((r) => setHouses(r.warehouses)).catch((e) => { setHouses([]); setHousesError(errText(e)); });
  }, []);

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      const n = Number(safety);
      const { config: saved } = await api.save(KEY, {
        locations: Object.fromEntries(locations.map((l) => [l.id, locs[l.id] ?? "none"])),
        safety_stock: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
        count_stock: countStock, missing, active, every_minutes: every,
      });
      onSaved(saved);
      setNote({ ok: true, text: "Saved." });
    } catch (e) { setNote({ ok: false, text: errText(e) }); }
    setBusy(false);
  };

  return (
    <section style={CARD} data-setup>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Where AdvancePro&apos;s stock goes</h2>
      <p style={{ ...MUTED, marginBottom: 12 }}>Each of your store locations can take every AdvancePro warehouse added up, one warehouse, or nothing.</p>
      {housesError && <p role="alert" style={{ ...MUTED, color: "#C8321F", marginBottom: 10 }}>{housesError} Every warehouse added up can still be chosen.</p>}
      {locations.length === 0 ? (
        <p style={MUTED}>You have no store locations yet. Add one under Products → Inventory first.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {locations.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 180px", fontSize: 13.5, fontWeight: 600 }}>
                {l.name} <span style={{ ...MUTED, display: "inline" }}>({l.code}){l.is_active ? "" : " · off"}</span>
              </span>
              <select style={{ ...INPUT, flex: "1 1 260px" }} aria-label={`Stock for ${l.name}`} value={locs[l.id] ?? "none"}
                onChange={(e) => setLocs((x) => ({ ...x, [l.id]: e.target.value }))} data-location={l.id}>
                <option value="none">Not synced</option>
                <option value="all">Every AdvancePro warehouse, added up</option>
                {(houses ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}{h.active ? "" : " (inactive)"}</option>)}
                {/* A warehouse chosen before that AdvancePro does not list right now stays visible. */}
                {locs[l.id] && !["all", "none"].includes(locs[l.id]!) && !(houses ?? []).some((h) => h.id === locs[l.id]) && (
                  <option value={locs[l.id]}>Warehouse {locs[l.id]}</option>
                )}
              </select>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 16 }}>
        <label><span style={LABEL}>Safety stock</span>
          <input style={{ ...INPUT, width: 120 }} type="number" min={0} value={safety} onChange={(e) => setSafety(e.target.value)} />
          <span style={{ ...MUTED, display: "block", marginTop: 4 }}>Held back from every number, so the last few are not sold twice.</span>
        </label>
        <label><span style={LABEL}>Sizes and colours AdvancePro does not have</span>
          <select style={{ ...INPUT, width: "100%" }} value={missing} onChange={(e) => setMissing(e.target.value as SyncConfig["missing"])}>
            <option value="keep">Keep their stock as it is</option>
            <option value="zero">Set their stock to 0</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Toggle on={countStock} onChange={() => setCountStock((v) => !v)} title="Count stock on synced products" />
          <span style={{ fontSize: 13.5 }}>Count stock on synced products, so shoppers cannot buy more than you have</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Toggle on={active} onChange={() => setActive((v) => !v)} title="Sync automatically" />
          <span style={{ fontSize: 13.5 }}>Sync automatically, every</span>
          <select style={INPUT} aria-label="How often" value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            {everyOptions.map((m) => <option key={m} value={m}>{everyLabel(m)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
        <Btn onClick={save} busy={busy} disabled={houses === null}>Save</Btn>
        {note && <span role="status" style={{ ...MUTED, color: note.ok ? "#0F7B4B" : "#C8321F" }}>{note.text}</span>}
      </div>
    </section>
  );
}

// ── Syncing, and what it did ─────────────────────────────────────────────────
function Runs({ connector, job, onStarted }: { connector: SyncConnector; job: SyncJob | null; onStarted: (j: SyncJob) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<"" | "shop" | "ap">("");
  const cfg = connector.config;
  const running = job?.status === "running";
  const last = job && job.status !== "running" ? job : null;
  const s = (last?.summary ?? cfg.history[0]?.summary) || null;

  const start = async (dry: boolean) => {
    // The first real sync writes AdvancePro's numbers over a live shop's stock: said once, plainly.
    if (!dry && !cfg.last_sync_at && !await ask(
      "This replaces your shop's stock with AdvancePro's numbers for every matched SKU. If you have not looked at a Preview yet, run one first. Sync now?",
      { ok: "Sync now" })) return;
    setBusy(true); setError("");
    try {
      const { job: j } = dry ? await api.preview(KEY) : await api.run(KEY);
      onStarted(j);
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  };
  const ready = Object.keys(cfg.locations ?? {}).length > 0;
  const preview = last?.preview || last?.summary?.preview ? last?.summary : null;

  return (
    <section style={CARD} data-runs>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Sync</h2>
        <Btn kind="ghost" onClick={() => start(true)} busy={busy || (running && !!job?.preview)} disabled={!ready || running}
          title="Everything a sync does, without writing anything">Preview</Btn>
        <Btn onClick={() => start(false)} busy={busy || (running && !job?.preview)} disabled={!ready || running}>
          {running && !job?.preview ? "Syncing…" : "Sync now"}
        </Btn>
      </div>
      {!ready && <p style={{ ...MUTED, marginTop: 6 }}>Choose where the stock goes, and save, first.</p>}
      {ready && !cfg.last_sync_at && !preview && (
        <p style={{ ...MUTED, marginTop: 6 }}>First time? Run a Preview: it shows every number a sync would change, and changes nothing.</p>
      )}
      {error && <p role="alert" style={{ ...MUTED, color: "#C8321F", marginTop: 8 }}>{error}</p>}
      {job && (
        <div role="status" data-job={job.status} style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 10, fontSize: 13.5,
          background: running ? "#EFF4FF" : job.status === "completed" ? "#ECFDF3" : "#FEF3F2",
          color: running ? "#1D4ED8" : job.status === "completed" ? "#067647" : "#B42318",
        }}>
          {running && <Spinner size={13} />} {job.message}
        </div>
      )}
      {s && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }} data-summary>
          <Badge text={`${s.matched ?? 0} matched`} color="#0F7B4B" />
          <Badge text={`${(s.updated ?? 0) + (s.created ?? 0)} ${s.preview ? "would change" : "changed"}`} color="#1D5FD6" />
          {!!s.to_zero && <Badge text={`${s.to_zero} ${s.preview ? "would go" : "went"} to 0`} color="#B42318" />}
          <Badge text={`${s.unchanged ?? 0} unchanged`} />
          {!!s.not_in_shop && (
            <button type="button" className="pc-link" onClick={() => setOpen(open === "shop" ? "" : "shop")}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: 12.5 }}>
              {s.not_in_shop} AdvancePro SKU{s.not_in_shop === 1 ? "" : "s"} not in your shop
            </button>
          )}
          {!!s.not_in_advancepro && (
            <button type="button" className="pc-link" onClick={() => setOpen(open === "ap" ? "" : "ap")}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: 12.5 }}>
              {s.not_in_advancepro} of your SKU{s.not_in_advancepro === 1 ? "" : "s"} not in AdvancePro
            </button>
          )}
        </div>
      )}
      {preview?.changes_sample && preview.changes_sample.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }} data-preview>
          <p style={{ ...MUTED, marginBottom: 6 }}>
            What a sync would change{(preview.updated ?? 0) + (preview.created ?? 0) > preview.changes_sample.length
              ? ` (the first ${preview.changes_sample.length}, emptied shelves first)` : ""}:
          </p>
          <table className="pc-table" style={{ width: "100%", fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ textAlign: "left" }}>SKU</th><th style={{ textAlign: "left" }}>Location</th>
              <th style={{ textAlign: "right" }}>Now</th><th style={{ textAlign: "right" }}>After the sync</th>
            </tr></thead>
            <tbody>
              {preview.changes_sample.map((c) => {
                const emptied = c.after === 0 && (c.before ?? 0) > 0;
                return (
                  <tr key={`${c.sku}-${c.location}`} data-emptied={emptied ? "" : undefined}>
                    <td style={{ fontFamily: "var(--pc-mono, monospace)" }}>{c.sku}</td>
                    <td>{c.location}</td>
                    <td style={{ textAlign: "right" }}>{c.before ?? "none"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: emptied ? "#B42318" : undefined }}>{c.after}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!!preview.count_stock_on && (
            <p style={{ ...MUTED, marginTop: 8 }}>
              {preview.count_stock_on} product{preview.count_stock_on === 1 ? "" : "s"} would start counting stock: shoppers could then buy only what AdvancePro has.
            </p>
          )}
        </div>
      )}
      {open && s && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--pc-bg, #F8FAFC)", borderRadius: 8, fontSize: 12.5 }} data-skus={open}>
          <p style={{ ...MUTED, marginBottom: 6 }}>
            {open === "shop"
              ? "In AdvancePro, with no product of that SKU in your shop. Add them, or check the SKU is written the same way in both."
              : "Sizes or colours of synced products with no AdvancePro SKU like theirs."}
          </p>
          <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {(open === "shop" ? s.not_in_shop_sample : s.not_in_advancepro_sample)?.join("  ·  ")}
          </code>
          {(open === "shop" ? (s.not_in_shop ?? 0) > (s.not_in_shop_sample?.length ?? 0)
                            : (s.not_in_advancepro ?? 0) > (s.not_in_advancepro_sample?.length ?? 0)) && <p style={{ ...MUTED, marginTop: 6 }}>And more.</p>}
        </div>
      )}
      <p style={{ ...MUTED, marginTop: 14 }}>
        Orders taken on your shop are not sent to AdvancePro yet. Enter them in AdvancePro as you do now; at each sync,
        AdvancePro&apos;s number replaces your shop&apos;s.
      </p>
      {cfg.history.length > 0 && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table className="pc-table" style={{ width: "100%", fontSize: 12.5 }} data-history>
            <thead><tr><th style={{ textAlign: "left" }}>When</th><th style={{ textAlign: "left" }}>How</th><th style={{ textAlign: "left" }}>What happened</th></tr></thead>
            <tbody>
              {cfg.history.slice(0, 10).map((h) => (
                <tr key={h.started_at}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(h.finished_at)}</td>
                  <td>{h.trigger === "schedule" ? "On schedule" : "Sync now"}</td>
                  <td style={{ color: h.status === "failed" ? "#B42318" : undefined }}>{h.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
