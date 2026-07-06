"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

const USER_GROUPS = ["Admin", "Accounting", "Purchasing", "Promo Standards"];

const GROUP_COLORS: Record<string, string> = {
  Admin: "bg-purple-100 text-purple-700",
  Accounting: "bg-blue-100 text-blue-700",
  Purchasing: "bg-green-100 text-green-700",
  "Promo Standards": "bg-orange-100 text-orange-700",
  Users: "bg-gray-100 text-gray-600",
};

interface CompanyUser {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  user_group: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  user_group: "Admin",
  password: "",
  confirm_password: "",
  password_hint: "",
};

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export default function ManageUsersPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadUsers();
  }, [isLoading]);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await apiClient.get<CompanyUser[]>("/api/v1/account/users");
      setUsers(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load users." });
    } finally {
      setLoading(false);
    }
  }

  function validatePassword(password: string, email: string): string | null {
    if (password.length < 8 || password.length > 20) {
      return "Password must be between 8 and 20 characters";
    }
    if (!password[0]?.match(/[a-zA-Z]/)) {
      return "Password must begin with a letter";
    }
    const loginId = (email.split("@")[0] ?? "").toLowerCase();
    for (let i = 0; i <= loginId.length - 3; i++) {
      const chunk = loginId.slice(i, i + 3);
      if (password.toLowerCase().includes(chunk)) {
        return "Password cannot contain 3 consecutive characters from your email";
      }
    }
    return null;
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.first_name.trim()) newErrors.first_name = "First name is required";
    if (!form.last_name.trim()) newErrors.last_name = "Last name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Invalid email address";
    }
    if (!editingUser) {
      const pwError = validatePassword(form.password, form.email);
      if (pwError) newErrors.password = pwError;
      if (form.password !== form.confirm_password) {
        newErrors.confirm_password = "Passwords do not match";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleAddNew() {
    setForm(EMPTY_FORM);
    setEditingUser(null);
    setShowForm(true);
    setErrors({});
    setMessage(null);
  }

  function handleEdit(u: CompanyUser) {
    setForm({
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      user_group: u.user_group,
      password: "",
      confirm_password: "",
      password_hint: "",
    });
    setEditingUser(u);
    setShowForm(true);
    setErrors({});
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setMessage(null);
    try {
      if (editingUser) {
        await apiClient.patch(`/api/v1/account/users/${editingUser.user_id}`, {
          first_name: form.first_name,
          last_name: form.last_name,
          user_group: form.user_group,
        });
        setMessage({ type: "success", text: "User updated successfully!" });
      } else {
        await apiClient.post("/api/v1/account/users/invite", {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: "buyer",
          user_group: form.user_group,
          password: form.password,
          ...(form.password_hint ? { password_hint: form.password_hint } : {}),
        });
        setMessage({ type: "success", text: "User added successfully! A welcome email has been sent." });
      }
      await loadUsers();
      setShowForm(false);
      setEditingUser(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save user.";
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: CompanyUser) {
    try {
      await apiClient.patch(`/api/v1/account/users/${u.user_id}`, {
        is_active: !u.is_active,
      });
      setMessage({
        type: "success",
        text: `User ${!u.is_active ? "activated" : "deactivated"} successfully.`,
      });
      await loadUsers();
    } catch {
      setMessage({ type: "error", text: "Failed to update user status." });
    }
  }

  async function handleResetPassword(u: CompanyUser) {
    if (!confirm(`Send password reset email to ${u.email}?`)) return;
    try {
      await apiClient.post(`/api/v1/account/users/${u.user_id}/reset-password`, {});
      setMessage({ type: "success", text: `Password reset email sent to ${u.email}` });
    } catch {
      setMessage({ type: "error", text: "Failed to send reset email." });
    }
  }

  async function handleRemove(u: CompanyUser) {
    if (!confirm(`Remove ${u.first_name} ${u.last_name} from your company?`)) return;
    try {
      await apiClient.delete(`/api/v1/account/users/${u.user_id}`);
      setMessage({ type: "success", text: "User removed successfully." });
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove user.";
      setMessage({ type: "error", text: msg });
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage who has access to your company account.</p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            + Add User
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-md text-sm font-medium ${
          message.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-5"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            {editingUser ? "Edit User" : "Add New User"}
          </h2>

          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.first_name ? "border-red-400" : "border-gray-300"
                }`}
              />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.last_name ? "border-red-400" : "border-gray-300"
                }`}
              />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
            </div>
          </div>

          {/* Email — read-only when editing */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              readOnly={!!editingUser}
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                editingUser ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
              } ${errors.email ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* User Group */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User Group <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {USER_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, user_group: group }))}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    form.user_group === group
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          {/* Password fields — new user only */}
          {!editingUser && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.password ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  8–20 characters, must begin with a letter, no 3 consecutive chars from email
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={form.confirm_password}
                    onChange={(e) => setForm(p => ({ ...p, confirm_password: e.target.value }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.confirm_password ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {form.confirm_password && form.password === form.confirm_password && (
                  <p className="text-green-600 text-xs mt-1">Passwords match</p>
                )}
                {errors.confirm_password && (
                  <p className="text-red-500 text-xs mt-1">{errors.confirm_password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password Hint</label>
                <input
                  type="text"
                  value={form.password_hint}
                  onChange={(e) => setForm(p => ({ ...p, password_hint: e.target.value }))}
                  placeholder="Optional hint to help remember password"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingUser(null); }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingUser ? "Update User" : "Add User"}
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      {users.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400 text-sm">No users yet.</p>
          <button
            onClick={handleAddNew}
            className="mt-3 text-blue-600 text-sm font-medium hover:underline"
          >
            Add your first user
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Group</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isOwner = u.role === "owner";
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{u.first_name} {u.last_name}</p>
                        {isOwner && (
                          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            Owner
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                          Full Access
                        </span>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          GROUP_COLORS[u.user_group] ?? "bg-gray-100 text-gray-600"
                        }`}>
                          {u.user_group}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {!isOwner && (
                          <>
                            <button
                              onClick={() => handleEdit(u)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              className={`text-xs font-medium ${
                                u.is_active
                                  ? "text-orange-500 hover:text-orange-600"
                                  : "text-green-600 hover:text-green-700"
                              }`}
                            >
                              {u.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              onClick={() => handleResetPassword(u)}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                              Reset PW
                            </button>
                            <button
                              onClick={() => handleRemove(u)}
                              className="text-xs text-red-500 hover:text-red-600 font-medium"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
