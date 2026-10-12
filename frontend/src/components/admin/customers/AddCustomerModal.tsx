"use client";

/**
 * Add customer: an account the shop opens for somebody, retail or (on a plan
 * with wholesale accounts) wholesale. Opened from the customer list, and from
 * a guest's page with what their orders already say about them, which turns
 * the guest into an account and brings their orders with it.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { adminService } from "@/services/admin.service";
import { customersService, type CustomersOverview } from "@/services/customers.service";

export interface AddCustomerInitial {
  name?: string; first_name?: string; last_name?: string; email?: string; phone?: string;
  address_line1?: string; city?: string; state_province?: string; postal_code?: string; country?: string;
}

interface Tier { id: string; name: string }

export function AddCustomerModal({ overview, initial, onClose, onDone }: {
  overview: CustomersOverview | null;
  initial?: AddCustomerInitial;
  onClose: () => void;
  onDone: (id: string, invited: boolean) => void;
}) {
  const wholesaleOk = overview?.features.wholesale_accounts ?? true;
  const tiersOk = overview?.features.customer_tiers ?? true;
  const [f, setF] = useState({
    kind: "retail" as "retail" | "wholesale", name: "", first_name: "", last_name: "", email: "", phone: "",
    address_line1: "", city: "", state_province: "", postal_code: "", country: "US",
    pricing_tier_id: "", notes: "", send_invite: true,
    ...Object.fromEntries(Object.entries(initial ?? {}).filter(([, v]) => !!v)),
  });
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  useEffect(() => {
    if (f.kind !== "wholesale" || !tiersOk || tiers.length) return;
    adminService.listPricingTiers().then((t) => setTiers((Array.isArray(t) ? t : []) as Tier[])).catch(() => {});
  }, [f.kind, tiersOk, tiers.length]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the customer a name."); return; }
    setSaving(true); setError("");
    try {
      const r = await customersService.add({
        ...f,
        pricing_tier_id: f.kind === "wholesale" && f.pricing_tier_id ? f.pricing_tier_id : null,
        send_invite: !!f.email.trim() && f.send_invite,
      });
      onDone(r.id, r.invited);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The customer was not added.");
      setSaving(false);
    }
  }

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label="Add customer" onSubmit={save} style={{ width: "min(640px, 100%)" }} data-add-customer>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">Add customer</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>An account you open for somebody. A guest who already ordered under the email brings their orders with them.</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px" }}>
          {error && <div className="pc-note" data-tone="red" style={{ marginBottom: "12px" }} role="alert">{error}</div>}
          <div className="pc-seg" role="group" aria-label="Type" style={{ marginBottom: "14px" }}>
            <button type="button" aria-pressed={f.kind === "retail"} onClick={() => set("kind", "retail")}>Retail</button>
            <button type="button" aria-pressed={f.kind === "wholesale"} disabled={!wholesaleOk} onClick={() => set("kind", "wholesale")}
              title={wholesaleOk ? undefined : "Wholesale accounts are part of the Wholesale plan"}>Wholesale</button>
          </div>
          {!wholesaleOk && <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "-6px 0 12px" }}>Wholesale accounts come with the Wholesale plan. <Link href="/admin/billing" className="pc-link">See plans</Link></p>}
          <div className="pc-form2">
            <label className="pc-wide"><span className="pc-label">{f.kind === "wholesale" ? "Company name" : "Name"} *</span>
              <input className="pc-input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus required /></label>
            <label><span className="pc-label">First name</span><input className="pc-input" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></label>
            <label><span className="pc-label">Last name</span><input className="pc-input" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></label>
            <label><span className="pc-label">Email (their sign-in)</span><input className="pc-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label><span className="pc-label">Phone</span><input className="pc-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="pc-wide"><span className="pc-label">Address</span><input className="pc-input" value={f.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Street" /></label>
            <label><span className="pc-label">City</span><input className="pc-input" value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
            <label><span className="pc-label">State</span><input className="pc-input" value={f.state_province} onChange={(e) => set("state_province", e.target.value)} /></label>
            <label><span className="pc-label">ZIP</span><input className="pc-input" value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></label>
            <label><span className="pc-label">Country</span><input className="pc-input" value={f.country} onChange={(e) => set("country", e.target.value)} /></label>
            {f.kind === "wholesale" && tiersOk && (
              <label className="pc-wide"><span className="pc-label">Pricing tier</span>
                <select className="pc-input" value={f.pricing_tier_id} onChange={(e) => set("pricing_tier_id", e.target.value)}>
                  <option value="">None</option>
                  {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></label>
            )}
            <label className="pc-wide"><span className="pc-label">Notes (private to your team)</span>
              <textarea className="pc-input" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
          </div>
          {f.email.trim() && (
            <label className="pc-switch-row" style={{ marginTop: "14px", justifyContent: "flex-start" }}>
              <input type="checkbox" className="pc-check" checked={f.send_invite} onChange={(e) => set("send_invite", e.target.checked)} />
              <span>Email them a link to set their password and sign in</span>
            </label>
          )}
        </div>
        <div className="pc-panel-foot" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={saving}>{saving ? "Adding…" : "Add customer"}</button>
        </div>
      </form>
    </div>
  );
}
