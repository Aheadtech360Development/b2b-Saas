"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

const SETTING_FIELDS = [
  { key: "mov", label: "Minimum Order Value ($)", type: "number", placeholder: "e.g. 200" },
  {
    key: "guest_pricing_mode",
    label: "Guest Pricing Mode",
    type: "select",
    options: [
      { value: "hidden", label: "Hidden (login required)" },
      { value: "retail", label: "Show retail price" },
      { value: "wholesale", label: "Show wholesale price" },
    ],
  },
  { key: "low_stock_threshold", label: "Low-Stock Alert Threshold (units)", type: "number", placeholder: "e.g. 10" },
  { key: "notification_email", label: "Notification Email", type: "email", placeholder: "ops@example.com" },
];

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiClient.get("/api/v1/admin/settings").then((r: any) => {
      setValues(r.data ?? {});
    }).finally(() => setLoading(false));
  }, []);

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/v1/admin/settings", values);
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure global platform behaviour and thresholds.
        </p>
      </div>

      {message && (
        <div
          className={`border rounded p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">General Settings</h2>
          </div>
          <div className="px-6 py-6 space-y-5">
            {SETTING_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <select
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    step={field.type === "number" ? "any" : undefined}
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
