"use client";

/**
 * Roles & permissions.
 *
 * A role is either full access, or partial — and partial means a level per
 * section, not one on/off switch and a global read-only flag. "Work through
 * orders, look at settings" is the ordinary case and the old shape could not
 * say it.
 *
 * Sections where a mistake costs money or changes who can do what are marked,
 * and default to View when a role is switched to partial. Handing somebody
 * Settings so they can check a tax rate should not also let them move where
 * the brand's money is paid out.
 *
 * Everything here is mirrored by the server on every request — the screen
 * hides what a person cannot use, the middleware is what stops them.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  rolesService,
  summariseScopes,
  type CustomRole,
  type Level,
  type ScopeCatalog,
  type ScopeMap,
} from "@/services/roles.service";

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "20px" };
const BTN: React.CSSProperties = { border: "none", color: "#fff", padding: "9px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const EYEBROW: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" };

type Access = "full" | "partial";
type Choice = "none" | Level;

interface Draft {
  id: string;
  name: string;
  access: Access;
  scopes: ScopeMap;
}

const BLANK: Draft = { id: "", name: "", access: "partial", scopes: {} };

export default function RolesPage() {
  const [catalog, setCatalog] = useState<ScopeCatalog | null>(null);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rolesService.list().then(setRoles).catch(() => setRoles([]));
  }, []);
  useEffect(() => { rolesService.scopes().then(setCatalog).catch(() => {}); load(); }, [load]);

  const labels: Record<string, string> = Object.fromEntries(
    (catalog?.scopes ?? []).map(s => [s.key, s.label]),
  );

  /** Full access is stored as every section at write, so the server needs no
   *  special case and the role reads the same way everywhere. */
  function isFull(role: CustomRole): boolean {
    const keys = catalog?.scopes.map(s => s.key) ?? [];
    return keys.length > 0 && keys.every(k => role.scopes?.[k] === "write");
  }

  function setLevel(key: string, choice: Choice) {
    if (!editing) return;
    const next = { ...editing.scopes };
    if (choice === "none") delete next[key];
    else next[key] = choice;
    setEditing({ ...editing, scopes: next });
  }

  function setAccess(access: Access) {
    if (!editing || !catalog) return;
    if (access === "full") {
      setEditing({
        ...editing, access,
        scopes: Object.fromEntries(catalog.scopes.map(s => [s.key, "write" as Level])),
      });
      return;
    }
    // Coming down from full: keep the everyday sections, drop the sensitive
    // ones to View. Silently leaving somebody with write over payouts while
    // the screen says "partial" would be the worst of both.
    const next: ScopeMap = {};
    for (const s of catalog.scopes) {
      const held = editing.scopes[s.key];
      if (held) next[s.key] = s.sensitive ? "read" : held;
    }
    setEditing({ ...editing, access, scopes: next });
  }

  async function save() {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) { setError("Give the role a name."); return; }
    if (Object.keys(editing.scopes).length === 0) {
      setError("Pick at least one section, or this role can do nothing.");
      return;
    }
    setSaving(true);
    try {
      const body = { name: editing.name.trim(), scopes: editing.scopes, read_only: false };
      if (editing.id) await rolesService.update(editing.id, body);
      else await rolesService.create(body);
      setEditing(null);
      load();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail || err?.message || "Could not save the role.");
    } finally {
      setSaving(false);
    }
  }

  function edit(role: CustomRole) {
    setEditing({
      id: role.id,
      name: role.name,
      access: isFull(role) ? "full" : "partial",
      scopes: { ...(role.scopes ?? {}) },
    });
    setError(null);
  }

  return (
    <div style={{ padding: "24px", maxWidth: "860px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800 }}>Roles &amp; permissions</h1>
          <p style={{ fontSize: "13px", color: "#6B6B6B", marginTop: "4px" }}>
            Give each person exactly the access their job needs — someone who ships orders does not
            need to change prices, and someone checking a tax rate does not need to move your payouts.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/admin/users" style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #E3E3E3", textDecoration: "none" }}>← Users</Link>
          <button onClick={() => { setEditing({ ...BLANK, scopes: {} }); setError(null); }} style={{ ...BTN, background: "#1A1A1A" }}>＋ New role</button>
        </div>
      </div>

      {/* Built-in roles, for reference */}
      {catalog && (
        <div style={{ ...CARD, marginTop: "16px" }}>
          <div style={EYEBROW}>Built-in roles</div>
          <div style={{ display: "grid", gap: "6px" }}>
            {catalog.fixed_roles.filter(r => r.key !== "platform_admin").map(r => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", padding: "6px 0", borderBottom: "1px solid #F6F6F7" }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: "#999", fontSize: "12px", textAlign: "right" }}>
                  {r.key === "tenant_admin"
                    ? "Everything"
                    : r.scopes.map(s => labels[s] ?? s).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom roles */}
      <div style={{ ...CARD, marginTop: "16px" }}>
        <div style={EYEBROW}>Custom roles</div>
        {roles.length === 0 ? (
          <div style={{ color: "#999", fontSize: "13px" }}>No custom roles yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {roles.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", border: "1px solid #F1EFEB", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>
                    {r.name}
                    <span style={{
                      fontSize: "11px", padding: "1px 7px", borderRadius: "10px", marginLeft: "6px",
                      color: isFull(r) ? "#065F46" : "#92400E",
                      background: isFull(r) ? "#D1FAE5" : "#FEF3C7",
                    }}>
                      {isFull(r) ? "full access" : "partial access"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>
                    {isFull(r) ? "Everything an administrator can do" : summariseScopes(r.scopes, labels)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
                  <button onClick={() => edit(r)} style={{ background: "none", border: "none", color: "#1A1A1A", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Edit</button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete “${r.name}”? Users on it revert to Viewer.`)) {
                        rolesService.remove(r.id).then(load).catch(() => {});
                      }
                    }}
                    style={{ background: "none", border: "none", color: "#B91C1C", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {editing && catalog && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...CARD, width: "100%", maxWidth: "620px", maxHeight: "88vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "14px" }}>
              {editing.id ? "Edit role" : "New role"}
            </h2>

            <label style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>Role name</label>
            <input
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Sales rep, Warehouse, Bookkeeper"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "6px", fontSize: "14px", margin: "5px 0 18px" }}
            />

            {/* Full or partial */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
              {([
                ["full", "Full access", "Everything an administrator can do."],
                ["partial", "Partial access", "Choose what they can see and change."],
              ] as const).map(([key, title, blurb]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccess(key)}
                  style={{
                    textAlign: "left", padding: "12px 14px", borderRadius: "10px", cursor: "pointer",
                    border: editing.access === key ? "1.5px solid #1A1A1A" : "1px solid #E3E3E3",
                    background: editing.access === key ? "#FAFAFA" : "#fff",
                  }}
                >
                  <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#1A1A1A" }}>{title}</div>
                  <div style={{ fontSize: "12px", color: "#8A8890", marginTop: "3px", lineHeight: 1.5 }}>{blurb}</div>
                </button>
              ))}
            </div>

            {editing.access === "full" ? (
              <div style={{ background: "#F6F6F7", border: "1px solid #E8E6E1", borderRadius: "9px", padding: "13px 15px", fontSize: "12.5px", color: "#6B6B6B", lineHeight: 1.6 }}>
                This role can do anything in the store, including adding staff, changing settings and
                moving the payment account. Give it only to people you would trust with the account itself.
              </div>
            ) : (
              <>
                <div style={{ ...EYEBROW, marginBottom: "8px" }}>What this role can do</div>
                <div style={{ border: "1px solid #EFEDE8", borderRadius: "9px", overflow: "hidden" }}>
                  {catalog.scopes.map((s, i) => {
                    const current: Choice = editing.scopes[s.key] ?? "none";
                    return (
                      <div
                        key={s.key}
                        style={{
                          display: "flex", alignItems: "center", gap: "12px", padding: "10px 13px",
                          borderTop: i ? "1px solid #F4F4F4" : "none",
                          background: current === "none" ? "#fff" : "#FBFBFC",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>
                            {s.label}
                            {s.sensitive && (
                              <span style={{ fontSize: "10.5px", color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: "9px", marginLeft: "6px", fontWeight: 700 }}>
                                sensitive
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "2px", lineHeight: 1.45 }}>
                            {current === "write" ? s.write_means
                              : current === "read" ? s.read_means
                              : "Hidden from this role"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          {([
                            ["none", "No access"],
                            ["read", "View"],
                            ["write", "Manage"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setLevel(s.key, value)}
                              style={{
                                padding: "5px 11px", borderRadius: "7px", fontSize: "12px", cursor: "pointer",
                                fontWeight: current === value ? 700 : 600,
                                border: current === value ? "1px solid #1A1A1A" : "1px solid #E3E3E3",
                                background: current === value ? "#1A1A1A" : "#fff",
                                color: current === value ? "#fff" : "#6B6B6B",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "10px", lineHeight: 1.6 }}>
                  Anything set to <strong>No access</strong> is refused by the server, not just hidden —
                  it cannot be reached by calling the API directly either.
                </p>
              </>
            )}

            {error && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "9px 11px", borderRadius: "8px", fontSize: "13px", marginTop: "12px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button onClick={save} disabled={saving} style={{ ...BTN, background: saving ? "#9ca3af" : "#1A1A1A" }}>
                {saving ? "Saving…" : "Save role"}
              </button>
              <button onClick={() => setEditing(null)} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #E3E3E3" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
