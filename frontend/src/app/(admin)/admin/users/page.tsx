"use client";

/**
 * Settings, Team and roles: who can sign in to this admin, and what each role
 * may do.
 *
 * Staff only: buyers are customers and live under Customers. A new person is
 * emailed a link to set their own password; nobody types one for them. The
 * roles table is not written here: it is read from the rules the API enforces
 * on every request (backend core/permissions.role_table), so the screen cannot
 * say one thing and the server do another.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import { adminService, type AdminUser } from "@/services/admin.service";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { rolesService, type AreaLevel, type CustomRole, type RoleTable } from "@/services/roles.service";
import { ask, tell } from "@/lib/dialog";

const PAGE_SIZE = 50;
const LEVEL_WORDS: Record<AreaLevel, [string, string]> = { edit: ["Edit", "green"], view: ["View", "blue"], part: ["Some", "amber"], none: ["None", ""] };
const SECTION_WORDS: Record<string, string> = {
  orders: "Orders", production: "Print queue", products: "Products", collections: "Collections", inventory: "Inventory",
  customers: "Customers", storefront: "Storefront", media: "Media", content: "Content", discounts: "Discounts",
  analytics: "Reports", settings: "Settings", staff: "Team and roles", billing: "Billing and disputes", payouts: "Payouts", audit: "Audit log",
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function TeamAndRolesPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [qText, setQText] = useState("");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [table, setTable] = useState<RoleTable | null>(null);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    setLoading(true);
    try {
      const data = await adminService.listUsers({ staff_only: true, q: q || undefined, role: roleFilter || undefined, status: statusFilter || undefined, page, page_size: PAGE_SIZE });
      if (mine !== asked.current) return;
      setUsers(data.items ?? []); setTotal(data.total ?? 0); setFailed(false);
    } catch {
      if (mine === asked.current) { setUsers([]); setFailed(true); }
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [q, roleFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setTimeout(() => { setPage(1); setQ(qText.trim()); }, 300);
    return () => window.clearTimeout(t);
  }, [qText]);
  useEffect(() => {
    rolesService.list().then(setCustomRoles).catch(() => {});
    rolesService.table().then(setTable).catch(() => {});
  }, []);

  const roleOf = (u: AdminUser) => (u.custom_role_id ? customRoles.find((r) => r.id === u.custom_role_id)?.name ?? "Custom role" : ROLE_LABELS[u.role] ?? u.role);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const narrowed = !!(q || roleFilter || statusFilter);

  return (
    <SettingsFrame active="team" title="Team and roles" sub="Staff only. Buyers live under Customers."
      actions={<button type="button" className="pc-btn" data-kind="primary" onClick={() => setEditing("new")}><Plus size={17} strokeWidth={2.4} /> Invite someone</button>}>
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      <div style={{ display: "grid", gap: "18px" }}>
        <section className="pc-card" data-card="team" aria-busy={loading}>
          <div className="pc-card-head"><h2 className="pc-h2">Team</h2></div>
          <div className="pc-filters" style={{ padding: "14px 20px 0", margin: 0 }}>
            <label className="pc-field" style={{ flex: 1, minWidth: "200px" }}>
              <Search size={17} strokeWidth={2} />
              <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Name or email" aria-label="Search the team" />
            </label>
            <select className="pc-input" style={{ width: "auto" }} value={roleFilter} aria-label="Role" onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
              <option value="">Every role</option>
              {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select className="pc-input" style={{ width: "auto" }} value={statusFilter} aria-label="Status" onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">Active and deactivated</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </div>
          <div className="pc-scroll-x" style={{ marginTop: "14px", borderTop: "1px solid var(--pc-line)" }}>
            <table className="pc-table" style={{ minWidth: "680px" }}>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>2-step</th><th>Last active</th></tr></thead>
              <tbody>
                {loading && users.length === 0 && [0, 1].map((i) => (
                  <tr key={i}><td colSpan={5}><div className="at-skel" style={{ height: "18px", width: `${60 - i * 12}%`, borderRadius: "6px" }} /></td></tr>
                ))}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={5} className="pc-empty">{failed ? "The team could not be loaded. Reload to try again." : narrowed ? "Nobody matches this search." : "Nobody yet. Invite the first person."}</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} data-href data-user={u.email} tabIndex={0} onClick={() => setEditing(u)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(u); }}
                    style={{ opacity: u.is_active ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 600 }}>{u.full_name || u.first_name || u.email}
                      {!u.is_active && <span className="pc-pill" style={{ marginLeft: "8px", textTransform: "none" }}>Deactivated</span>}</td>
                    <td className="pc-td-clip" title={u.email}>{u.email}</td>
                    <td><span className="pc-pill" data-tone={u.role === "administrator" || u.role === "admin" ? "blue" : undefined} style={{ textTransform: "none" }}>{roleOf(u)}</span></td>
                    <td><span className="pc-pill" data-tone={u.two_factor ? "green" : "amber"} style={{ textTransform: "none" }}>{u.two_factor ? "On" : "Off"}</span></td>
                    <td style={{ whiteSpace: "nowrap", color: u.last_login ? undefined : "var(--pc-muted)" }}>{u.last_login ? day(u.last_login) : u.invited ? "Invited, not signed in yet" : "Never signed in"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pc-table-foot">
            <span>{total} {total === 1 ? "person" : "people"}</span>
            {pages > 1 ? (
              <span className="pc-row-actions">
                <button type="button" className="pc-link" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button type="button" className="pc-link" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ opacity: page >= pages ? 0.4 : 1 }}>Next</button>
              </span>
            ) : <span>Click a person to change their role or access</span>}
          </div>
          <div style={{ padding: "0 20px 18px" }}>
            <div className="pc-note" data-tone="blue">New people get an email invite and set their own password. You never type one for them.</div>
          </div>
        </section>

        <section className="pc-card" data-card="roles">
          <div className="pc-card-head">
            <h2 className="pc-h2">Roles</h2>
            <Link href="/admin/users/roles" className="pc-btn" style={{ height: "36px" }}>Custom roles</Link>
          </div>
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: `${240 + (table?.roles.length ?? 6) * 118}px` }} data-roles-table>
              <thead><tr><th>Area</th>{table?.roles.map((r) => <th key={r.key} data-role={r.key} style={{ textTransform: "none", letterSpacing: 0, fontSize: "13px" }}>{r.label}</th>)}</tr></thead>
              <tbody>
                {!table && <tr><td colSpan={7}><div className="at-skel" style={{ height: "18px", width: "55%", borderRadius: "6px" }} /></td></tr>}
                {table?.areas.map((a) => (
                  <tr key={a.key} data-area={a.key}>
                    <td style={{ fontWeight: 600 }}>{a.label}</td>
                    {table.roles.map((r) => {
                      const cell = a.levels[r.key];
                      const [label, tone] = LEVEL_WORDS[cell?.level ?? "none"];
                      // What the cell is made of, for a role that has part of a place.
                      const made = Object.entries(cell?.sections ?? {}).map(([s, l]) => `${SECTION_WORDS[s] ?? s}: ${l === "write" ? "edit" : l === "read" ? "view" : "none"}`).join(" · ");
                      return (
                        <td key={r.key} data-level={cell?.level ?? "none"} title={made}>
                          {cell?.level && cell.level !== "none"
                            ? <span className="pc-pill" data-tone={tone} style={{ textTransform: "none" }}>{label}</span>
                            : <span style={{ color: "var(--pc-muted)" }}>None</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pc-sub-line" style={{ margin: 0, padding: "12px 20px 16px", fontSize: "13px" }}>
            Production gives a press operator the print queue and a look at orders, and nothing else. &quot;Some&quot; means part of a place: hover it to see which part. Need something different? Make a custom role.
          </p>
        </section>
      </div>

      {editing && (
        <PersonModal
          user={editing === "new" ? null : editing}
          customRoles={customRoles}
          onClose={() => setEditing(null)}
          onDone={(text, bad) => { setEditing(null); setFlash({ text, bad }); load(); }}
        />
      )}
    </SettingsFrame>
  );
}

// ── Invite somebody, or change one person ────────────────────────────────────

function PersonModal({ user, customRoles, onClose, onDone }: {
  user: AdminUser | null;
  customRoles: CustomRole[];
  onClose: () => void;
  onDone: (text: string, bad?: boolean) => void;
}) {
  const [f, setF] = useState({
    first_name: user?.first_name ?? "", last_name: user?.last_name ?? "", email: user?.email ?? "",
    role: user?.custom_role_id ? `custom:${user.custom_role_id}` : user && ASSIGNABLE_ROLES.some((r) => r.value === user.role) ? user.role : user?.role === "admin" ? "administrator" : "editor",
    is_active: user?.is_active ?? true,
  });
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const picked = f.role.startsWith("custom:") ? null : ASSIGNABLE_ROLES.find((r) => r.value === f.role);
  const name = user?.full_name || user?.email || "";

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.first_name.trim() || !f.email.trim()) { setError("A first name and an email are needed."); return; }
    setSaving("save"); setError("");
    const custom = f.role.startsWith("custom:") ? f.role.slice(7) : null;
    try {
      if (user) {
        await adminService.updateUser(user.id, { first_name: f.first_name, last_name: f.last_name, email: f.email, role: custom ? undefined : f.role, custom_role_id: custom, is_active: f.is_active });
        onDone(`Saved ${f.first_name.trim()}.`);
      } else {
        const made = await adminService.createUser({ first_name: f.first_name.trim(), last_name: f.last_name.trim(), email: f.email.trim(), role: custom ? undefined : f.role, custom_role_id: custom ?? undefined });
        if (made.invite_sent === false) onDone(`${f.first_name.trim()} was added, but the invite email could not be sent. Open them and send it again.`, true);
        else onDone(`Invite sent to ${f.email.trim()}. They set their own password from it.`);
      }
    } catch (err) {
      setError(errorText(err, "That could not be saved."));
      setSaving("");
    }
  }

  async function send(kind: "invite" | "reset") {
    if (!user) return;
    setSaving(kind); setError("");
    try {
      if (kind === "invite") await adminService.inviteUserAgain(user.id);
      else await adminService.resetUserPassword(user.id);
      onDone(kind === "invite" ? `Invite sent again to ${user.email}.` : `A password reset link was emailed to ${user.email}.`);
    } catch (err) {
      setError(errorText(err, "The email could not be sent."));
      setSaving("");
    }
  }

  async function remove() {
    if (!user || !await ask(`Delete ${name}? Their messages and saved carts go with them. This cannot be undone.`, { title: "Delete this person", ok: "Delete", danger: true })) return;
    setSaving("delete"); setError("");
    try {
      await adminService.deleteUser(user.id);
      onDone(`${name} was deleted.`);
    } catch (err) {
      // The server says why (orders on record, the account you are signed in with…).
      await tell(errorText(err, "This person could not be deleted."), { title: "Not deleted" });
      setSaving("");
    }
  }

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label={user ? name : "Invite someone"} onSubmit={save} data-person-modal>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">{user ? name : "Invite someone"}</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>
              {user ? (user.last_login ? `Last signed in ${day(user.last_login)}.` : user.invited ? "Invited, not signed in yet." : "Has never signed in.")
                : "They get an email with a link to set their own password."}
            </p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px", display: "grid", gap: "14px" }}>
          {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
          <div className="pc-form2">
            <label><span className="pc-label">First name *</span><input className="pc-input" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} autoFocus required /></label>
            <label><span className="pc-label">Last name</span><input className="pc-input" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></label>
            <label className="pc-wide"><span className="pc-label">Email *</span><input className="pc-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required /></label>
            <label className="pc-wide"><span className="pc-label">Role</span>
              <select className="pc-input" value={f.role} onChange={(e) => set("role", e.target.value)} data-role-select>
                {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                {customRoles.length > 0 && <optgroup label="Custom roles">{customRoles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}</optgroup>}
              </select>
              <span className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px", display: "block" }}>{picked ? picked.desc : "A role you made under Custom roles."}</span></label>
          </div>
          {user && (
            <div className="pc-switch-row" style={{ alignItems: "center" }}>
              <span>Can sign in
                <div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>Switch off to deactivate: they keep their history and cannot sign in.</div>
              </span>
              <button type="button" className="pc-switch" role="switch" aria-label="Can sign in" aria-checked={f.is_active} data-on={f.is_active ? "" : undefined} onClick={() => set("is_active", !f.is_active)} />
            </div>
          )}
          {user && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {user.invited && <button type="button" className="pc-btn" disabled={!!saving} onClick={() => send("invite")}>{saving === "invite" ? "Sending…" : "Send the invite again"}</button>}
              <button type="button" className="pc-btn" disabled={!!saving} onClick={() => send("reset")}>{saving === "reset" ? "Sending…" : "Email a password reset link"}</button>
            </div>
          )}
        </div>
        <div className="pc-panel-foot" style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          {user ? <button type="button" className="pc-btn" onClick={remove} disabled={!!saving}>{saving === "delete" ? "Deleting…" : "Delete"}</button> : <span />}
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="pc-btn" onClick={onClose} disabled={!!saving}>Cancel</button>
            <button type="submit" className="pc-btn" data-kind="primary" disabled={!!saving}>{saving === "save" ? "Saving…" : user ? "Save" : "Send invite"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
