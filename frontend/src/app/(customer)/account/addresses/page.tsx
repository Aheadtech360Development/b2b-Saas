"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";

interface Address {
  id: string;
  label: string | null;
  full_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

const EMPTY_FORM = {
  label: "",
  full_name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  phone: "",
  is_default: false,
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function AddressBookPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadAddresses();
  }, [isLoading]);

  async function loadAddresses() {
    setLoading(true);
    try {
      const data = await apiClient.get<Address[]>("/api/v1/account/addresses");
      setAddresses(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load addresses." });
    } finally {
      setLoading(false);
    }
  }

  function handleAddNew() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setMessage(null);
    setTimeout(() => document.getElementById("addr-label")?.focus(), 50);
  }

  function handleEdit(addr: Address) {
    setForm({
      label: addr.label || "",
      full_name: addr.full_name || "",
      line1: addr.line1,
      line2: addr.line2 || "",
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
      phone: addr.phone || "",
      is_default: addr.is_default,
    });
    setEditingId(addr.id);
    setShowForm(true);
    setMessage(null);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        await apiClient.patch(`/api/v1/account/addresses/${editingId}`, form);
        setMessage({ type: "success", text: "Address updated successfully!" });
      } else {
        await apiClient.post("/api/v1/account/addresses", form);
        setMessage({ type: "success", text: "Address added successfully!" });
      }
      await loadAddresses();
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch {
      setMessage({ type: "error", text: "Failed to save address." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this address?")) return;
    try {
      await apiClient.delete(`/api/v1/account/addresses/${id}`);
      setMessage({ type: "success", text: "Address deleted." });
      await loadAddresses();
    } catch {
      setMessage({ type: "error", text: "Failed to delete address." });
    }
  }

  async function handleZipLookup(zip: string) {
    if (zip.length < 5) return;
    try {
      const country = form.country || "US";
      const countryCode = country === "CA" ? "ca" : "us";
      const resp = await fetch(
        `https://api.zippopotam.us/${countryCode}/${zip}`
      );
      if (!resp.ok) return;
      const data = await resp.json();
      const place = data.places?.[0];
      if (place) {
        setForm(p => ({
          ...p,
          city: place["place name"] || p.city,
          state: place["state abbreviation"] || p.state,
          country: country,
        }));
      }
    } catch {
      // silently fail — user can still type manually
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await apiClient.patch(`/api/v1/account/addresses/${id}/set-default`, {});
      setMessage({ type: "success", text: "Default address updated!" });
      await loadAddresses();
    } catch {
      setMessage({ type: "error", text: "Failed to set default address." });
    }
  }

  const handleAddressAutofill = useCallback((addr: { street: string; city: string; state: string; zipCode: string }) => {
    setForm(prev => ({
      ...prev,
      line1: addr.street || prev.line1,
      city: addr.city || prev.city,
      state: addr.state || prev.state,
      postal_code: addr.zipCode || prev.postal_code,
    }));
  }, []);
  const streetInputRef = useAddressAutocomplete(handleAddressAutofill);

  if (loading && !message) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Address Book</h1>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            + Add Address
          </button>
        )}
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            {editingId ? "Edit Address" : "Add New Address"}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              id="addr-label"
              type="text"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Home, Office, Warehouse"
              required
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              placeholder="Recipient full name"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address Line 1 <span className="text-red-500">*</span>
            </label>
            <input
              ref={streetInputRef}
              type="text"
              value={form.line1}
              onChange={(e) => setForm((p) => ({ ...p, line1: e.target.value }))}
              placeholder="Street address"
              required
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
            <input
              type="text"
              value={form.line2}
              onChange={(e) => setForm((p) => ({ ...p, line2: e.target.value }))}
              placeholder="Apt, Suite, Unit (optional)"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP / Postal Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => {
                const zip = e.target.value;
                setForm(p => ({ ...p, postal_code: zip }));
                if (zip.length === 5) {
                  handleZipLookup(zip);
                }
              }}
              maxLength={10}
              required
              placeholder="Enter ZIP to auto-fill city & state"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              City &amp; State will auto-fill when you enter a valid ZIP code
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                required
                className={inputCls}
              >
                <option value="">Select State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country <span className="text-red-500">*</span>
            </label>
            <select
              value={form.country}
              onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
              required
              className={inputCls}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="(555) 000-0000"
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              checked={form.is_default}
              onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="is_default" className="text-sm text-gray-700">
              Set as Default Ship-to Address
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Address" : "Add Address"}
            </button>
          </div>
        </form>
      )}

      {/* Address list */}
      {addresses.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400 text-sm">No addresses yet.</p>
          <button
            onClick={handleAddNew}
            className="mt-3 text-blue-600 text-sm font-medium hover:underline"
          >
            Add your first address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-white border rounded-lg p-5 relative ${
                addr.is_default ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"
              }`}
            >
              {addr.is_default && (
                <span className="absolute top-3 right-3 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  Default
                </span>
              )}

              <p className="font-semibold text-gray-900 mb-1">{addr.label || "Address"}</p>

              <div className="text-sm text-gray-600 space-y-0.5">
                {addr.full_name && <p>{addr.full_name}</p>}
                <p>{addr.line1}</p>
                {addr.line2 && <p>{addr.line2}</p>}
                <p>
                  {addr.city}, {addr.state} {addr.postal_code}
                </p>
                <p>
                  {addr.country === "US"
                    ? "United States"
                    : addr.country === "CA"
                    ? "Canada"
                    : addr.country}
                </p>
                {addr.phone && <p className="text-gray-500">{addr.phone}</p>}
              </div>

              <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100 items-center">
                <button
                  onClick={() => handleEdit(addr)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Edit
                </button>
                {!addr.is_default && (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => handleDelete(addr.id)}
                  className="text-sm text-red-500 hover:text-red-600 font-medium ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
