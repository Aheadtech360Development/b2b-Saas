"use client";

/**
 * Manage Suppliers — the brand's supplier connections, what it imports from
 * each, how it prices those imports and how often stock is synced.
 *
 * List → View (Products for Import · Browse Catalog · Edit Supplier). Every
 * setting is saved on the brand's own supplier setup on the server; imports and
 * syncs run there too, and this screen polls their progress.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suppliersService, type SupplierDetail, type SupplierJob, type SupplierRow } from "@/services/suppliers.service";
import { ProductsForImport } from "./ProductsForImport";
import { BrowseCatalog } from "./BrowseCatalog";
import { EditSupplier } from "./EditSupplier";
import { Badge, Btn, CARD, JobBanner, MUTED, Spinner, Toggle, errText, fmtDate } from "./ui";

type Tab = "import" | "browse" | "edit";

export function SuppliersManager() {
  const [open, setOpen] = useState<{ id: string; tab: Tab } | null>(null);
  if (open) {
    return <SupplierView id={open.id} initialTab={open.tab} onBack={() => setOpen(null)} />;
  }
  return <SupplierList onOpen={(id, tab) => setOpen({ id, tab })} />;
}

// ── List ─────────────────────────────────────────────────────────────────────

function SupplierList({ onOpen }: { onOpen: (id: string, tab: Tab) => void }) {
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await suppliersService.list());
      setError("");
    } catch (e) {
      setError(errText(e));
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the list's progress fresh while a job is running.
  const running = rows?.some((r) => r.job?.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const toggleAuto = async (row: SupplierRow) => {
    setSaving(row.id);
    try {
      await suppliersService.update(row.id, { auto_import: !row.auto_import });
      await load();
    } catch (e) {
      setError(errText(e));
    }
    setSaving("");
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#1A1A1A" }}>Manage Suppliers</h1>
        <p style={{ ...MUTED, marginTop: 4 }}>
          Connect a supplier, choose which of its products to import, and keep their stock in sync.
        </p>
      </div>

      {error && <div style={{ ...CARD, borderColor: "#F5C2C0", background: "#FFF5F5", color: "#B42318", marginBottom: 12 }}>{error}</div>}

      <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", textAlign: "left", color: "#6B6B6B" }}>
              {["Supplier", "Status", "Auto import", "Last sync", "Date created", ""].map((h) => (
                <th key={h} style={{ padding: "11px 14px", fontWeight: 600, fontSize: 12, borderBottom: "1px solid #EEE" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center" }}><Spinner /></td></tr>
            )}
            {rows?.map((r) => {
              const inactive = !r.available;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #F2F2F2", opacity: inactive ? 0.55 : 1 }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, color: "#1A1A1A" }}>{r.name || r.label}</div>
                    <div style={{ fontSize: 12, color: "#8A8A8A" }}>
                      {r.label}{r.account ? ` · Account ${r.account}` : ""}
                    </div>
                    {r.job?.status === "running" && (
                      <div style={{ fontSize: 12, color: "#2563EB", marginTop: 4 }}>
                        {r.job.kind === "import" ? "Importing" : "Syncing"}… {r.job.message}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {inactive ? <Badge text="Inactive · coming soon" color="#8A8A8A" />
                      : r.connected ? <Badge text="Active" color="#16A34A" />
                        : <Badge text="Not connected" color="#D97706" />}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {inactive ? <span style={{ color: "#B0B0B0" }}>—</span> : (
                      <Toggle on={!!r.auto_import} busy={saving === r.id} onChange={() => toggleAuto(r)}
                        title="When on, every automatic sync also imports new products that match your import filters" />
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", color: "#4A4A4A" }}>{inactive ? "—" : fmtDate(r.last_sync_at) || "Never"}</td>
                  <td style={{ padding: "12px 14px", color: "#4A4A4A" }}>{inactive ? "—" : fmtDate(r.created_at, false) || "—"}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {inactive ? (
                      <span style={{ fontSize: 12, color: "#8A8A8A" }}>Available soon</span>
                    ) : (
                      <>
                        <Btn onClick={() => onOpen(r.id, r.connected ? "import" : "edit")}>View</Btn>{" "}
                        <Btn kind="ghost" onClick={() => onOpen(r.id, "edit")}>Edit</Btn>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "import", label: "Products for Import" },
  { id: "browse", label: "Browse Catalog" },
  { id: "edit", label: "Edit Supplier" },
];

function SupplierView({ id, initialTab, onBack }: { id: string; initialTab: Tab; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState("");
  const [job, setJob] = useState<SupplierJob | null>(null);
  // Bumped whenever a job finishes, so the tabs refetch what it changed.
  const [dataVersion, setDataVersion] = useState(0);
  const lastStatus = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const d = await suppliersService.get(id);
      setDetail(d);
      setJob(d.job);
      lastStatus.current = d.job?.status;
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll the job while it runs; when it ends, reload what it changed.
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const { job: j } = await suppliersService.job(id);
        setJob(j);
        if (lastStatus.current === "running" && j?.status !== "running") {
          setDataVersion((v) => v + 1);
          load();
        }
        lastStatus.current = j?.status;
      } catch { /* keep the last known state; try again next tick */ }
    }, 2000);
    return () => clearInterval(t);
  }, [job?.status, id, load]);

  const onJobStarted = (j: SupplierJob) => {
    lastStatus.current = "running";
    setJob(j);
  };

  const onSaved = (cfg: SupplierDetail["config"]) => {
    setDetail((d) => (d ? { ...d, config: cfg } : d));
  };

  const connected = detail?.connection.connected;
  const running = job?.status === "running";

  const body = useMemo(() => {
    if (!detail) return null;
    if (tab !== "edit" && !connected) {
      return (
        <div style={{ ...CARD, textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connect {detail.label} first</div>
          <p style={{ ...MUTED, marginBottom: 14 }}>
            Add your {detail.label} account number and API key. Products, prices and stock all come from your own account.
          </p>
          <Btn onClick={() => setTab("edit")}>Open connection settings</Btn>
        </div>
      );
    }
    if (tab === "import") {
      return <ProductsForImport id={id} config={detail.config} running={running} dataVersion={dataVersion}
        onSaved={onSaved} onJobStarted={onJobStarted} onBrowse={() => setTab("browse")} />;
    }
    if (tab === "browse") {
      return <BrowseCatalog id={id} config={detail.config} dataVersion={dataVersion} onSaved={onSaved} />;
    }
    return <EditSupplier id={id} detail={detail} running={running} onSaved={onSaved}
      onJobStarted={onJobStarted} onConnectionChanged={load} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, tab, connected, running, dataVersion, id, load]);

  return (
    <div style={{ maxWidth: 1180 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, color: "#6B6B6B", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
        ← Manage Suppliers
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#1A1A1A" }}>{detail?.config.name || detail?.label || "Supplier"}</h1>
        {detail && (connected
          ? <Badge text={`Active${detail.connection.account ? ` · ${detail.connection.account}` : ""}`} color="#16A34A" />
          : <Badge text="Not connected" color="#D97706" />)}
        {detail?.config.last_sync_at && <span style={MUTED}>Last sync {fmtDate(detail.config.last_sync_at)}</span>}
      </div>

      {error && <div style={{ ...CARD, borderColor: "#F5C2C0", background: "#FFF5F5", color: "#B42318", marginBottom: 12 }}>{error}</div>}

      {job && <JobBanner job={job} onDismiss={job.status === "running" ? undefined : () => setJob(null)} />}

      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #E3E3E3", marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 16px", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#1A1A1A" : "#6B6B6B",
            borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent", marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {detail ? body : !error && <div style={{ padding: 30, textAlign: "center" }}><Spinner /></div>}
    </div>
  );
}
