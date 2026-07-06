// frontend/src/app/(admin)/admin/users/page.tsx
"use client";

import { useEffect, useState } from "react";
import { adminService, type AdminUser } from "@/services/admin.service";
import { UsersIcon } from "@/components/ui/icons";

// ── Shared styles ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", border: "1.5px solid #E2E0DA",
  borderRadius: "7px", fontSize: "13px", outline: "none", boxSizing: "border-box",
  fontFamily: "var(--font-jakarta)",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", marginBottom: "5px",
};
const thStyle: React.CSSProperties = {
  padding: "11px 14px", textAlign: "left", fontSize: "10px",
  textTransform: "uppercase", letterSpacing: ".07em", color: "#7A7880", fontWeight: 700,
};

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  admin:    { bg: "rgba(232,36,42,.1)",   color: "#E8242A" },
  staff:    { bg: "rgba(26,92,255,.1)",   color: "#1A5CFF" },
  customer: { bg: "rgba(5,150,105,.1)",   color: "#059669" },
};

function autoPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Create / Edit Modal ────────────────────────────────────────────────────────

function UserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "staff",
    is_active: user?.is_active ?? true,
    password: "",
    send_welcome_email: false,
  });
  const [autoGen, setAutoGen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  function set(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() || !form.first_name.trim()) {
      setError("First name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await adminService.updateUser(user!.id, {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          is_active: form.is_active,
        });
      } else {
        const pwd = autoGen ? autoPassword() : form.password;
        await adminService.createUser({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          password: pwd || undefined,
          send_welcome_email: form.send_welcome_email,
        });
      }
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setResetMsg(null);
    try {
      await adminService.resetUserPassword(user!.id);
      setResetMsg("Password reset email sent.");
    } catch {
      setResetMsg("Failed to send reset email.");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "520px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #E2E0DA", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em", margin: 0 }}>
            {isEdit ? "EDIT USER" : "ADD USER"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#7A7880", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div style={{ background: "rgba(232,36,42,.08)", border: "1px solid rgba(232,36,42,.2)", borderRadius: "6px", padding: "10px 14px", fontSize: "13px", color: "#E8242A", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          {/* Name row */}
          <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={lbl}>First Name *</label>
              <input style={inp} value={form.first_name} onChange={e => set("first_name", e.target.value)} required />
            </div>
            <div>
              <label style={lbl}>Last Name</label>
              <input style={inp} value={form.last_name} onChange={e => set("last_name", e.target.value)} />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: "12px" }}>
            <label style={lbl}>Email *</label>
            <input style={inp} type="email" value={form.email} onChange={e => set("email", e.target.value)} required />
          </div>

          {/* Role + Status row */}
          <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={lbl}>Role</label>
              <select style={inp} value={form.role} onChange={e => set("role", e.target.value)}>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="customer">Customer</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.is_active ? "active" : "inactive"} onChange={e => set("is_active", e.target.value === "active")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>

          {/* Password (create only) */}
          {!isEdit && (
            <div style={{ marginBottom: "12px" }}>
              <label style={lbl}>Password</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  style={{ ...inp, opacity: autoGen ? 0.4 : 1 }}
                  type="text"
                  placeholder="Leave blank to auto-generate"
                  value={autoGen ? "(auto-generated)" : form.password}
                  onChange={e => set("password", e.target.value)}
                  disabled={autoGen}
                />
                <button
                  type="button"
                  onClick={() => setAutoGen(v => !v)}
                  style={{ flexShrink: 0, padding: "8px 12px", border: `1.5px solid ${autoGen ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: autoGen ? "rgba(26,92,255,.08)" : "#fff", color: autoGen ? "#1A5CFF" : "#7A7880", whiteSpace: "nowrap" }}
                >
                  Auto-generate
                </button>
              </div>
            </div>
          )}

          {/* Send welcome email toggle (create only) */}
          {!isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginBottom: "16px" }}>
              <input
                type="checkbox"
                checked={form.send_welcome_email}
                onChange={e => set("send_welcome_email", e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "#1A5CFF", flexShrink: 0 }}
              />
              <span style={{ fontSize: "13px", color: "#2A2830" }}>Send welcome email with login credentials</span>
            </label>
          )}

          {/* Reset password (edit only) */}
          {isEdit && (
            <div style={{ marginBottom: "16px", padding: "12px 14px", background: "#F4F3EF", borderRadius: "8px", border: "1px solid #E2E0DA" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830", marginBottom: "6px" }}>Password Reset</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#2A2830" }}
                >
                  Send Reset Email
                </button>
                {resetMsg && (
                  <span style={{ fontSize: "12px", color: resetMsg.startsWith("Failed") ? "#E8242A" : "#059669", fontWeight: 600 }}>
                    {resetMsg}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", paddingTop: "16px", borderTop: "1px solid #E2E0DA" }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: "10px", background: saving ? "#E2E0DA" : "#1A5CFF", color: saving ? "#aaa" : "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation ────────────────────────────────────────────────────────

function DeleteDialog({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminService.deleteUser(user.id);
      onSuccess();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "420px", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <h3 style={{ fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#2A2830", letterSpacing: ".04em", marginBottom: "10px" }}>DELETE USER</h3>
        <p style={{ fontSize: "14px", color: "#7A7880", lineHeight: 1.6, marginBottom: "20px" }}>
          Are you sure you want to delete <strong style={{ color: "#2A2830" }}>{user.full_name}</strong> ({user.email})? This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            style={{ flex: 1, padding: "10px", background: deleting ? "#E2E0DA" : "#E8242A", color: deleting ? "#aaa" : "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: deleting ? "not-allowed" : "pointer" }}>
            {deleting ? "Deleting…" : "Delete User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listUsers({
        q: q || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setUsers(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [q, roleFilter, statusFilter, page]); // eslint-disable-line

  async function handleToggleActive(user: AdminUser) {
    setTogglingId(user.id);
    try {
      await adminService.updateUser(user.id, { is_active: !user.is_active });
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  const stats = {
    total,
    admins: users.filter(u => u.role === "admin").length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
  };

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>

      {showCreate && (
        <UserModal user={null} onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />
      )}
      {editUser && (
        <UserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => { setEditUser(null); load(); }} />
      )}
      {deleteUser && (
        <DeleteDialog user={deleteUser} onClose={() => setDeleteUser(null)} onSuccess={() => { setDeleteUser(null); load(); }} />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>USERS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>{total} platform users</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}
        >
          + Add User
        </button>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Total Users",   value: stats.total,    color: "#2A2830" },
          { label: "Admins",        value: stats.admins,   color: "#E8242A" },
          { label: "Active",        value: stats.active,   color: "#059669" },
          { label: "Inactive",      value: stats.inactive, color: "#D97706" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
            <UsersIcon size={22} color={s.color} />
            <div>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "24px", color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "10px", color: "#7A7880", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by name or email…"
          style={{ padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", width: "240px" }}
        />
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          style={{ padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="customer">Customer</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span style={{ fontSize: "13px", color: "#7A7880", marginLeft: "auto" }}>
          {users.length} of {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "2px solid #E2E0DA" }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Company</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Joined</th>
              <th style={thStyle}>Last Login</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>No users found</td></tr>
            ) : users.map(user => {
              const roleCfg = ROLE_BADGE[user.role] ?? { bg: "rgba(156,163,175,.15)", color: "#9CA3AF" };
              const isToggling = togglingId === user.id;
              return (
                <tr key={user.id} style={{ borderBottom: "1px solid #F4F3EF" }}>

                  {/* Name */}
                  <td style={{ padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: user.is_admin ? "#E8242A" : "#1A5CFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-bebas)", fontSize: "14px", flexShrink: 0 }}>
                        {(user.first_name[0] ?? "?").toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>{user.full_name}</div>
                    </div>
                  </td>

                  {/* Email */}
                  <td style={{ padding: "13px 14px", fontSize: "13px", color: "#7A7880" }}>{user.email}</td>

                  {/* Role */}
                  <td style={{ padding: "13px 14px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize", background: roleCfg.bg, color: roleCfg.color }}>
                      {user.role}
                    </span>
                  </td>

                  {/* Company */}
                  <td style={{ padding: "13px 14px", fontSize: "13px", color: "#7A7880" }}>
                    {user.company_name ?? <span style={{ color: "#ccc" }}>—</span>}
                  </td>

                  {/* Status */}
                  <td style={{ padding: "13px 14px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: user.is_active ? "rgba(5,150,105,.1)" : "rgba(156,163,175,.15)", color: user.is_active ? "#059669" : "#9CA3AF" }}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Joined */}
                  <td style={{ padding: "13px 14px", fontSize: "12px", color: "#7A7880" }}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                  </td>

                  {/* Last Login */}
                  <td style={{ padding: "13px 14px", fontSize: "12px", color: "#7A7880" }}>
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : <span style={{ color: "#ccc" }}>Never</span>}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "13px 14px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <button
                        onClick={() => setEditUser(user)}
                        style={{ padding: "5px 11px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#2A2830" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={isToggling}
                        style={{ padding: "5px 11px", border: `1px solid ${user.is_active ? "#E2E0DA" : "rgba(5,150,105,.3)"}`, borderRadius: "6px", background: user.is_active ? "#fff" : "rgba(5,150,105,.06)", fontSize: "12px", fontWeight: 600, cursor: isToggling ? "not-allowed" : "pointer", color: user.is_active ? "#D97706" : "#059669", opacity: isToggling ? 0.5 : 1 }}
                      >
                        {user.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                      <button
                        onClick={() => setDeleteUser(user)}
                        style={{ padding: "5px 11px", border: "1px solid rgba(232,36,42,.25)", borderRadius: "6px", background: "rgba(232,36,42,.04)", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#E8242A" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "7px 14px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: "13px", fontWeight: 600 }}>
            ← Prev
          </button>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            style={{ padding: "7px 14px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.4 : 1, fontSize: "13px", fontWeight: 600 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
