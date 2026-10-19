"use client";

/** Warehouses: where stock is kept. Reached from Inventory ("Manage warehouses"). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

export default function AdminWarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminService.listWarehouses().then((d) => setWarehouses(d as Warehouse[])).catch(() => setWarehouses([]));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true); setMsg(null);
    try {
      const w = await adminService.createWarehouse({ name, code, address: location || undefined }) as Warehouse;
      setWarehouses((prev) => [...(prev ?? []), w]);
      setName(""); setCode(""); setLocation(""); setShowForm(false);
    } catch { setMsg("The warehouse could not be added."); } finally { setIsSaving(false); }
  }

  return (
    <div className="pc-page" data-warehouses>
      <Link href="/admin/inventory" className="pc-back">← Inventory</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Inventory</div>
          <h1 className="pc-h1">Warehouses</h1>
          <p className="pc-sub-line">Where your stock is kept. Each SKU&apos;s count is kept per warehouse.</p>
        </div>
        {!showForm && <button type="button" className="pc-btn" data-kind="primary" onClick={() => setShowForm(true)}>Add warehouse</button>}
      </div>

      {msg && <div className="pc-flash" data-bad="" role="alert">{msg}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="pc-card pc-pad" style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
          <h2 className="pc-h2">New warehouse</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Name</span>
              <input className="pc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main warehouse" required /></label>
            <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Code</span>
              <input className="pc-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WH-01" required /></label>
            <label style={{ display: "grid", gap: "6px" }}><span className="pc-label">Address (optional)</span>
              <input className="pc-input" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
          </div>
          <div className="pc-row-actions">
            <button type="button" className="pc-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="pc-btn" data-kind="primary" disabled={isSaving}>{isSaving ? "Adding…" : "Add warehouse"}</button>
          </div>
        </form>
      )}

      <div className="pc-card">
        <table className="pc-table">
          <thead><tr><th>Name</th><th>Location</th><th>Status</th></tr></thead>
          <tbody>
            {!warehouses ? <tr><td colSpan={3} className="pc-empty">Loading…</td></tr>
              : warehouses.length === 0 ? <tr><td colSpan={3} className="pc-empty">No warehouses yet.</td></tr>
              : warehouses.map((w) => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td style={{ color: "var(--pc-muted)" }}>{w.location ?? "—"}</td>
                  <td><span className="pc-pill" data-tone={w.is_active ? "green" : undefined} style={{ textTransform: "none" }}>{w.is_active ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
