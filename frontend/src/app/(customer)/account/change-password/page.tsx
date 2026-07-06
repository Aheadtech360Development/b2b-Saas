"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  );
}

function CheckItem({ met, text }: { met: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 transition-colors ${met ? "text-green-600" : "text-gray-400"}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="w-3.5 h-3.5 shrink-0"
      >
        {met ? (
          <path
            fillRule="evenodd"
            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
            clipRule="evenodd"
          />
        ) : (
          <circle cx="8" cy="8" r="5" opacity="0.3" />
        )}
      </svg>
      {text}
    </li>
  );
}

function getPasswordStrength(pw: string) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) return { label: "Weak", color: "bg-red-500", textColor: "text-red-600", pct: "25%" };
  if (score === 3) return { label: "Fair", color: "bg-yellow-500", textColor: "text-yellow-600", pct: "50%" };
  if (score === 4) return { label: "Good", color: "bg-blue-500", textColor: "text-blue-600", pct: "75%" };
  return { label: "Strong", color: "bg-green-500", textColor: "text-green-600", pct: "100%" };
}

export default function ChangePasswordPage() {
  const { isLoading } = useAuthStore();

  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.current_password) errs.current_password = "Current password is required";
    if (!form.new_password) {
      errs.new_password = "New password is required";
    } else if (form.new_password.length < 8) {
      errs.new_password = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(form.new_password)) {
      errs.new_password = "Password must contain at least one uppercase letter";
    } else if (!/[0-9]/.test(form.new_password)) {
      errs.new_password = "Password must contain at least one number";
    } else if (form.new_password === form.current_password) {
      errs.new_password = "New password must be different from current password";
    }
    if (!form.confirm_password) {
      errs.confirm_password = "Please confirm your new password";
    } else if (form.new_password !== form.confirm_password) {
      errs.confirm_password = "Passwords do not match";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setMessage(null);

    try {
      await apiClient.patch("/api/v1/account/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setMessage({
        type: "success",
        text: "Password changed successfully! A confirmation email has been sent.",
      });
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setFieldErrors({});
    } catch (err: unknown) {
      const apiErr = err as { status?: number; code?: string };
      if (apiErr?.status === 400 || apiErr?.code === "VALIDATION_ERROR") {
        setFieldErrors({ current_password: "Current password is incorrect" });
      } else {
        setMessage({ type: "error", text: "Failed to change password. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  const strength = getPasswordStrength(form.new_password);
  const pwMatch = form.confirm_password !== "" && form.new_password === form.confirm_password;

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Change Password</h1>

      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium mb-6 ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">

        {/* Current Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={show.current ? "text" : "password"}
              value={form.current_password}
              onChange={(e) => setForm((p) => ({ ...p, current_password: e.target.value }))}
              className={`w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                fieldErrors.current_password ? "border-red-400" : "border-gray-300"
              }`}
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShow((p) => ({ ...p, current: !p.current }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              <EyeIcon open={show.current} />
            </button>
          </div>
          {fieldErrors.current_password && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.current_password}</p>
          )}
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={show.new ? "text" : "password"}
              value={form.new_password}
              onChange={(e) => setForm((p) => ({ ...p, new_password: e.target.value }))}
              className={`w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                fieldErrors.new_password ? "border-red-400" : "border-gray-300"
              }`}
              placeholder="Enter new password"
            />
            <button
              type="button"
              onClick={() => setShow((p) => ({ ...p, new: !p.new }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              <EyeIcon open={show.new} />
            </button>
          </div>

          {/* Strength bar */}
          {form.new_password && strength && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                  style={{ width: strength.pct }}
                />
              </div>
              <p className={`text-xs mt-1 font-medium ${strength.textColor}`}>
                Password strength: {strength.label}
              </p>
            </div>
          )}

          {fieldErrors.new_password && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.new_password}</p>
          )}

          <ul className="text-xs mt-2 space-y-1">
            <CheckItem met={form.new_password.length >= 8} text="At least 8 characters" />
            <CheckItem met={/[A-Z]/.test(form.new_password)} text="At least one uppercase letter" />
            <CheckItem met={/[0-9]/.test(form.new_password)} text="At least one number" />
          </ul>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={show.confirm ? "text" : "password"}
              value={form.confirm_password}
              onChange={(e) => setForm((p) => ({ ...p, confirm_password: e.target.value }))}
              className={`w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                fieldErrors.confirm_password ? "border-red-400" : "border-gray-300"
              }`}
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShow((p) => ({ ...p, confirm: !p.confirm }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              <EyeIcon open={show.confirm} />
            </button>
          </div>
          {pwMatch && (
            <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              Passwords match
            </p>
          )}
          {fieldErrors.confirm_password && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.confirm_password}</p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
