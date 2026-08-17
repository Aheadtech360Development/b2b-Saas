"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { rolesService, type CustomRole, type ScopeCatalog } from "@/services/roles.service";

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "20px" };
const BTN: React.CSSProperties = { border: "none", color: "#fff", padding: "9px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };

const BLANK = { id: "", name: "", scopes: [] as string[], read_only: false };

export default function RolesPage() {
  const [catalog, setCatalog] = useState<ScopeCatalog | null>(null);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => { rolesService.list().then(setRoles).catch(() => setRoles([])); }, []);
  useEffect(() => { rolesService.scopes().then(setCatalog).catch(() => {}); load(); }, [load]);

  function toggleScope(key: string) {
    if (!editing) return;
    setEditing({ ...editing, scopes: editing.scopes.includes(key) ? editing.scopes.filter((s) => s !== key) : [...editing.scopes, key] });
  }

  async function save() {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) { setError("Give the role a name."); return; }
    if (editing.scopes.length === 0) { setError("Pick at least one section."); return; }
    setSaving(true);
    try {
      if (editing.id) await rolesService.update(editing.id, { name: editing.name, scopes: editing.scopes, read_only: editing.read_only });
      else await rolesService.create({ name: editing.name, scopes: editing.scopes, read_only: editing.read_only });
      setEditing(null); load();
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not save the role.");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: "24px", maxWidth: "860px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800 }}>Roles &amp; permissions</h1>
          <p style={{ fontSize: "13px", color: "#6B6B6B", marginTop: "4px" }}>Create custom roles with exactly the access a team member needs — e.g. a sales rep who sees orders but not pricing.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/admin/users" style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2", textDecoration: "none" }}>← Users</Link>
          <button onClick={() => setEditing({ ...BLANK })} style={{ ...BTN, background: "var(--brand-primary, #1C3557)" }}>＋ New role</button>
        </div>
      </div>

      {/* Fixed roles (reference) */}
      {catalog && (
        <div style={{ ...CARD, marginTop: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Built-in roles</div>
          <div style={{ display: "grid", gap: "6px" }}>
            {catalog.fixed_roles.filter((r) => r.key !== "platform_admin").map((r) => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", padding: "6px 0", borderBottom: "1px solid #F4F3EF" }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: "#999", fontSize: "12px", textAlign: "right" }}>{r.key === "tenant_admin" ? "Everything" : r.scopes.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom roles */}
      <div style={{ ...CARD, marginTop: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>Custom roles</div>
        {roles.length === 0 ? (
          <div style={{ color: "#999", fontSize: "13px" }}>No custom roles yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {roles.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", border: "1px solid #F1EFEB", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>{r.name} {r.read_only && <span style={{ fontSize: "11px", color: "#92400E", background: "#FEF3C7", padding: "1px 7px", borderRadius: "10px", marginLeft: "6px" }}>read-only</span>}</div>
                  <div style={{ fontSize: "12px", color: "#999" }}>{r.scopes.join(", ")}</div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
                  <button onClick={() => setEditing({ id: r.id, name: r.name, scopes: [...r.scopes], read_only: r.read_only })} style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Edit</button>
                  <button onClick={() => { if (confirm(`Delete “${r.name}”? Users on it revert to Viewer.`)) rolesService.remove(r.id).then(load).catch(() => {}); }} style={{ background: "none", border: "none", color: "#B91C1C", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editing && catalog && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: "100%", maxWidth: "480px", maxHeight: "88vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "14px" }}>{editing.id ? "Edit role" : "New role"}</h2>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>Role name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Sales rep" style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "14px", margin: "5px 0 16px" }} />

            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", marginBottom: "8px" }}>Sections this role can access</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {catalog.scopes.map((s) => (
                <label key={s.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", border: "1px solid #EFEDE8", borderRadius: "7px", padding: "8px 10px", cursor: "pointer", background: editing.scopes.includes(s.key) ? "#F4F6FB" : "#fff" }}>
                  <input type="checkbox" checked={editing.scopes.includes(s.key)} onChange={() => toggleScope(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", marginTop: "14px" }}>
              <input type="checkbox" checked={editing.read_only} onChange={(e) => setEditing({ ...editing, read_only: e.target.checked })} />
              Read-only (can view its sections but not make changes)
            </label>

            {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "9px 11px", borderRadius: "7px", fontSize: "13px", marginTop: "12px" }}>{error}</div>}

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button onClick={save} disabled={saving} style={{ ...BTN, background: saving ? "#9ca3af" : "var(--brand-primary, #1C3557)" }}>{saving ? "Saving…" : "Save role"}</button>
              <button onClick={() => setEditing(null)} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
