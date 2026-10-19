"use client";

import { ask } from "@/lib/dialog";
/**
 * Suppliers — the brand's supplier connections, what it imports from
 * each, how it prices those imports and how often stock is synced.
 *
 * Overview (SupplierOverview) → Advanced settings (Products for Import · Browse
 * Catalog · Edit Supplier). Every
 * setting is saved on the brand's own supplier setup on the server; imports and
 * syncs run there too, and this screen polls their progress.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suppliersService, type SupplierDetail, type SupplierJob } from "@/services/suppliers.service";
import { ProductsForImport } from "./ProductsForImport";
import { BrowseCatalog } from "./BrowseCatalog";
import { EditSupplier } from "./EditSupplier";
import { Badge, Btn, CARD, JobBanner, MUTED, Spinner, errText, fmtDate } from "./ui";
import { SupplierOverview } from "./SupplierOverview";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";

type Tab = "import" | "browse" | "edit";

export function SuppliersManager() {
  const [open, setOpen] = useState<{ id: string; tab: Tab } | null>(null);
  const [adding, setAdding] = useState(false);
  if (open) {
    return (
      <ProductsFrame active="suppliers" title="Suppliers" sub="Advanced settings: what is imported, how it is priced and synced, and how orders are sent.">
        <SupplierView id={open.id} initialTab={open.tab} onBack={() => setOpen(null)} />
      </ProductsFrame>
    );
  }
  return (
    <ProductsFrame active="suppliers" title="Suppliers" sub="Connect a blank catalogue and keep it in sync."
      actions={<button type="button" className="pc-btn" onClick={() => setAdding(true)}>+ Add manual supplier</button>}>
      <SupplierOverview onOpen={(id, tab) => setOpen({ id, tab })} addOpen={adding} onAddClosed={() => setAdding(false)} />
    </ProductsFrame>
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
  const editDirty = useRef(false);
  const leaveOk = async () => !editDirty.current || ask("You have unsaved supplier changes. Leave without saving?");
  const goTab = async (t: Tab) => {
    if (t === tab || (tab === "edit" && !(await leaveOk()))) return;
    editDirty.current = false;
    setTab(t);
  };

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
  const [turningOn, setTurningOn] = useState(false);
  const turnOn = async () => {
    setTurningOn(true);
    try {
      const { config } = await suppliersService.update(id, { active: true });
      onSaved(config);
    } catch (e) {
      setError(errText(e));
    }
    setTurningOn(false);
  };
  const running = job?.status === "running";

  const body = useMemo(() => {
    if (!detail) return null;
    if (tab !== "edit" && connected && !detail.config.active) {
      return (
        <div style={{ ...CARD, textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{detail.label} is turned off</div>
          <p style={{ ...MUTED, marginBottom: 14 }}>
            Nothing is imported, synced or sent to S&S while it&apos;s off. Your key and settings are kept.
          </p>
          <Btn onClick={turnOn} busy={turningOn}>Turn on</Btn>
        </div>
      );
    }
    if (tab !== "edit" && !connected) {
      return (
        <div style={{ ...CARD, textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connect {detail.label} first</div>
          <p style={{ ...MUTED, marginBottom: 14 }}>
            Add your {detail.label} account number and API key. Products, prices and stock all come from your own account.
          </p>
          <Btn onClick={() => goTab("edit")}>Open connection settings</Btn>
        </div>
      );
    }
    if (tab === "import") {
      return <ProductsForImport id={id} config={detail.config} running={running} dataVersion={dataVersion}
        onSaved={onSaved} onJobStarted={onJobStarted} onBrowse={() => goTab("browse")} />;
    }
    if (tab === "browse") {
      return <BrowseCatalog id={id} config={detail.config} dataVersion={dataVersion} onSaved={onSaved} />;
    }
    return <EditSupplier id={id} detail={detail} running={running} onSaved={onSaved}
      onJobStarted={onJobStarted} onConnectionChanged={load} onDirtyChange={(d) => { editDirty.current = d; }} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, tab, connected, running, dataVersion, id, load, turningOn]);

  return (
    <div style={{ maxWidth: 1180 }}>
      <button type="button" className="pc-back" onClick={async () => { if (await leaveOk()) onBack(); }} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", marginBottom: 10 }}>
        ← All suppliers
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 className="pc-h2" style={{ fontSize: 22, margin: 0 }}>{detail?.config.name || detail?.label || "Supplier"}</h2>
        {detail && (!connected
          ? <Badge text="Not connected" color="#D97706" />
          : detail.config.active
            ? <Badge text={`Active${detail.connection.account ? ` · ${detail.connection.account}` : ""}`} color="#0F7B4B" />
            : <Badge text="Off" color="#6B6B6B" />)}
        {detail?.config.last_sync_at && <span style={MUTED}>Last sync {fmtDate(detail.config.last_sync_at)}</span>}
      </div>

      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}

      {job && <JobBanner job={job} onDismiss={job.status === "running" ? undefined : () => setJob(null)} />}

      <nav className="pc-tabs" aria-label="Supplier settings">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="pc-tab" data-on={tab === t.id ? "" : undefined}
            aria-current={tab === t.id ? "page" : undefined} onClick={() => goTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {detail ? body : !error && <div style={{ padding: 30, textAlign: "center" }}><Spinner /></div>}
    </div>
  );
}
