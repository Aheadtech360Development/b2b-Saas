"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET) — UTC-5/4" },
  { value: "America/Chicago", label: "Central Time (CT) — UTC-6/5" },
  { value: "America/Denver", label: "Mountain Time (MT) — UTC-7/6" },
  { value: "America/Phoenix", label: "Mountain Time Arizona (MT) — UTC-7" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) — UTC-8/7" },
  { value: "America/Anchorage", label: "Alaska Time (AKT) — UTC-9/8" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT) — UTC-10" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  time_zone: string | null;
  phone: string | null;
  phone_ext: string | null;
  fax: string | null;
  email: string;
  web_address: string | null;
  notes: string | null;
  home_address1: string | null;
  home_address2: string | null;
  home_postal_code: string | null;
  home_city: string | null;
  home_state: string | null;
  home_country: string | null;
  home_phone: string | null;
  home_fax: string | null;
  home_email: string | null;
  alt_contacts: string | null;
  notify_order_confirmation: boolean;
  notify_order_shipped: boolean;
  notify_invoices: boolean;
  is_primary: boolean;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  time_zone: "",
  phone: "",
  phone_ext: "",
  fax: "",
  email: "",
  web_address: "",
  notes: "",
  home_address1: "",
  home_address2: "",
  home_postal_code: "",
  home_city: "",
  home_state: "",
  home_country: "US",
  home_phone: "",
  home_fax: "",
  home_email: "",
  alt_contacts: "",
  notify_order_confirmation: true,
  notify_order_shipped: true,
  notify_invoices: false,
  is_primary: false,
};

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function ManageContactsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"entry" | "detail">("entry");
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadContacts();
  }, [isLoading]);

  async function loadContacts() {
    setLoading(true);
    try {
      const data = await apiClient.get<Contact[]>("/api/v1/account/contacts");
      setContacts(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load contacts." });
    } finally {
      setLoading(false);
    }
  }

  function handleAddNew() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setActiveTab("entry");
    setMessage(null);
  }

  function handleEdit(contact: Contact) {
    setForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      time_zone: contact.time_zone || "",
      phone: contact.phone || "",
      phone_ext: contact.phone_ext || "",
      fax: contact.fax || "",
      email: contact.email,
      web_address: contact.web_address || "",
      notes: contact.notes || "",
      home_address1: contact.home_address1 || "",
      home_address2: contact.home_address2 || "",
      home_postal_code: contact.home_postal_code || "",
      home_city: contact.home_city || "",
      home_state: contact.home_state || "",
      home_country: contact.home_country || "US",
      home_phone: contact.home_phone || "",
      home_fax: contact.home_fax || "",
      home_email: contact.home_email || "",
      alt_contacts: contact.alt_contacts || "",
      notify_order_confirmation: contact.notify_order_confirmation,
      notify_order_shipped: contact.notify_order_shipped,
      notify_invoices: contact.notify_invoices,
      is_primary: contact.is_primary,
    });
    setEditingId(contact.id);
    setShowForm(true);
    setActiveTab("entry");
    setMessage(null);
  }

  async function handleZipLookup(zip: string) {
    if (zip.length < 5) return;
    try {
      const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const place = data.places?.[0];
      if (place) {
        setForm(p => ({
          ...p,
          home_city: place["place name"] || p.home_city,
          home_state: place["state abbreviation"] || p.home_state,
        }));
      }
    } catch {
      // silently fail
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        await apiClient.patch(`/api/v1/account/contacts/${editingId}`, form);
        setMessage({ type: "success", text: "Contact updated successfully!" });
      } else {
        await apiClient.post("/api/v1/account/contacts", form);
        setMessage({ type: "success", text: "Contact added successfully!" });
      }
      await loadContacts();
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch {
      setMessage({ type: "error", text: "Failed to save contact." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    try {
      await apiClient.delete(`/api/v1/account/contacts/${id}`);
      setMessage({ type: "success", text: "Contact deleted." });
      await loadContacts();
    } catch {
      setMessage({ type: "error", text: "Failed to delete contact." });
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manage Contacts</h1>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            + Add Contact
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
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">
              {editingId ? "Edit Contact" : "Add New Contact"}
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(["entry", "detail"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "entry" ? "Contact Entry" : "Contact Detail"}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {/* CONTACT ENTRY TAB */}
            {activeTab === "entry" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))}
                      required
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Time Zone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Zone</label>
                  <select
                    value={form.time_zone}
                    onChange={(e) => setForm(p => ({ ...p, time_zone: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Select Time Zone</option>
                    {US_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                {/* Phone + Ext */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone #</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(555) 000-0000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ext</label>
                    <input
                      type="text"
                      value={form.phone_ext}
                      onChange={(e) => setForm(p => ({ ...p, phone_ext: e.target.value }))}
                      placeholder="1234"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Fax */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fax #</label>
                  <input
                    type="tel"
                    value={form.fax}
                    onChange={(e) => setForm(p => ({ ...p, fax: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>

                {/* Web Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Web Address</label>
                  <input
                    type="url"
                    value={form.web_address}
                    onChange={(e) => setForm(p => ({ ...p, web_address: e.target.value }))}
                    placeholder="https://example.com"
                    className={inputCls}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Primary contact */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_primary}
                    onChange={(e) => setForm(p => ({ ...p, is_primary: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 font-medium">Set as Primary Contact</span>
                </label>
              </>
            )}

            {/* CONTACT DETAIL TAB */}
            {activeTab === "detail" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Address 1</label>
                  <input
                    type="text"
                    value={form.home_address1}
                    onChange={(e) => setForm(p => ({ ...p, home_address1: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Address 2</label>
                  <input
                    type="text"
                    value={form.home_address2}
                    onChange={(e) => setForm(p => ({ ...p, home_address2: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                {/* ZIP — auto-fill */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal / ZIP Code</label>
                  <input
                    type="text"
                    value={form.home_postal_code}
                    onChange={(e) => {
                      const zip = e.target.value;
                      setForm(p => ({ ...p, home_postal_code: zip }));
                      if (zip.length === 5) handleZipLookup(zip);
                    }}
                    maxLength={10}
                    placeholder="Enter ZIP to auto-fill city & state"
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-400 mt-1">City &amp; State auto-fill on valid ZIP</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={form.home_city}
                      onChange={(e) => setForm(p => ({ ...p, home_city: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prov / State</label>
                    <select
                      value={form.home_state}
                      onChange={(e) => setForm(p => ({ ...p, home_state: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Select State</option>
                      {US_STATES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select
                    value={form.home_country}
                    onChange={(e) => setForm(p => ({ ...p, home_country: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Home Phone</label>
                    <input
                      type="tel"
                      value={form.home_phone}
                      onChange={(e) => setForm(p => ({ ...p, home_phone: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Home Fax</label>
                    <input
                      type="tel"
                      value={form.home_fax}
                      onChange={(e) => setForm(p => ({ ...p, home_fax: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Email</label>
                  <input
                    type="email"
                    value={form.home_email}
                    onChange={(e) => setForm(p => ({ ...p, home_email: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alt Contacts</label>
                  <textarea
                    value={form.alt_contacts}
                    onChange={(e) => setForm(p => ({ ...p, alt_contacts: e.target.value }))}
                    rows={3}
                    placeholder="Any additional contact information..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </>
            )}
          </div>

          {/* Form buttons */}
          <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Contact" : "Add Contact"}
            </button>
          </div>
        </form>
      )}

      {/* Contacts List */}
      {contacts.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400 text-sm">No contacts yet.</p>
          <button
            onClick={handleAddNew}
            className="mt-3 text-blue-600 text-sm font-medium hover:underline"
          >
            Add your first contact
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`bg-white border rounded-lg p-5 ${
                contact.is_primary ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </p>
                    {contact.is_primary && (
                      <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                    <p>{contact.email}</p>
                    {contact.phone && (
                      <p>{contact.phone}{contact.phone_ext ? ` ext. ${contact.phone_ext}` : ""}</p>
                    )}
                    {contact.fax && <p className="text-xs">Fax: {contact.fax}</p>}
                    {contact.web_address && (
                      <p className="text-xs">
                        <a href={contact.web_address} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{contact.web_address}</a>
                      </p>
                    )}
                    {contact.time_zone && (
                      <p className="text-xs text-gray-400">
                        {US_TIMEZONES.find(tz => tz.value === contact.time_zone)?.label || contact.time_zone}
                      </p>
                    )}
                    {/* Home / alternate contact info */}
                    {contact.home_email && contact.home_email !== contact.email && (
                      <p className="text-xs text-gray-400">Home email: {contact.home_email}</p>
                    )}
                    {contact.home_phone && (
                      <p className="text-xs text-gray-400">Home: {contact.home_phone}</p>
                    )}
                    {contact.home_address1 && (
                      <p className="text-xs text-gray-400">
                        {[contact.home_address1, contact.home_city, contact.home_state, contact.home_country].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {contact.alt_contacts && (
                      <p className="text-xs text-gray-400 italic">{contact.alt_contacts}</p>
                    )}
                    {contact.notes && (
                      <p className="text-xs text-gray-400 italic">Note: {contact.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 ml-4 shrink-0">
                  <button
                    onClick={() => handleEdit(contact)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(contact.id)}
                    className="text-sm text-red-500 hover:text-red-600 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
