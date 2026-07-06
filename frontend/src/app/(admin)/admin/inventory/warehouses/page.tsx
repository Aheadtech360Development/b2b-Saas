"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

export default function AdminWarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminService.listWarehouses().then((d) => setWarehouses(d as Warehouse[]));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true); setMsg(null);
    try {
      const w = await adminService.createWarehouse({ name, code, address: location || undefined }) as Warehouse;
      setWarehouses((prev) => [...prev, w]);
      setName(""); setCode(""); setLocation(""); setShowForm(false);
    } catch { setMsg("Failed to create warehouse"); } finally { setIsSaving(false); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Warehouses</h1>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 text-white rounded-md px-3 py-1.5 text-sm hover:bg-brand-700">Add Warehouse</button>
      </div>

      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <form onSubmit={handleCreate} className="space-y-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse name" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (e.g. WH-01)" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase" />
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address (optional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isSaving} className="bg-brand-600 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {isSaving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Location</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr><td colSpan={3} className="py-8 text-center text-gray-400">No warehouses</td></tr>
            ) : warehouses.map((w) => (
              <tr key={w.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{w.name}</td>
                <td className="px-4 py-3 text-gray-500">{w.location ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${w.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {w.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
