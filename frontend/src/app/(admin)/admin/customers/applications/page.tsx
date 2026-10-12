"use client";

/**
 * Applications — wholesale sign-ups to approve or reject, one of the Customers
 * tabs. Approving makes the account (services/wholesale_service.approve) on the
 * pricing tier, discount group and tax setting chosen here.
 *
 * On a plan without wholesale accounts the screen says which plan has them and
 * shows, greyed out, what an application looks like; nothing is asked of the
 * API, which would refuse.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { askText } from "@/lib/dialog";
import { CustomersFrame, PlanLock, useCustomersOverview } from "@/components/admin/customers/CustomersFrame";
import { adminService } from "@/services/admin.service";
import { day, words } from "@/lib/customerWords";

interface Application {
  id: string;
  company_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  business_type: string | null;
  tax_id: string | null;
  website: string | null;
  expected_monthly_volume: string | null;
  company_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  how_heard: string | null;
  num_employees: string | null;
  num_sales_reps: string | null;
  secondary_business: string | null;
  estimated_annual_volume: string | null;
  ppac_number: string | null;
  ppai_number: string | null;
  asi_number: string | null;
  fax: string | null;
  status: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  company_id?: string | null;
  created_at: string;
}
interface Named { id: string; name: string }
interface DiscountGroup { id: string; title: string }

const FILTERS: [string, string][] = [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"], ["", "All"]];
const STATUS_PILL: Record<string, [string, string]> = { pending: ["Waiting", "amber"], approved: ["Approved", "green"], rejected: ["Rejected", "red"] };

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading applications…</div></div>}>
      <Applications />
    </Suspense>
  );
}

function Applications() {
  const { overview, refresh } = useCustomersOverview();
  const allowed = overview?.features.wholesale_accounts;
  return (
    <CustomersFrame active="applications" overview={overview} title="Applications" sub="Approve or reject wholesale sign-ups.">
      {overview == null ? <div className="pc-card pc-empty">Loading…</div>
        : allowed ? <ApplicationList onChanged={refresh} tiersOk={overview.features.customer_tiers} />
        : <Locked />}
    </CustomersFrame>
  );
}

function Locked() {
  return (
    <div style={{ display: "grid", gap: "16px" }} data-applications-locked>
      <PlanLock title="Included from the Wholesale plan"
        blurb="Wholesale accounts, sign-up and approval. Upgrade to turn this on." />
      <div className="pc-card pc-pad" aria-hidden style={{ opacity: .75 }}>
        <div className="pc-eyebrow" style={{ marginBottom: "4px" }}>Preview of what you get</div>
        <h2 className="pc-h2" style={{ color: "var(--pc-muted)", marginBottom: "14px" }}>A company applied for a wholesale account</h2>
        <div className="pc-form2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <label><span className="pc-label">Business type</span><input className="pc-input" disabled placeholder="Screen printer" /></label>
          <label><span className="pc-label">Tax ID</span><input className="pc-input" disabled placeholder="12-3456789" /></label>
          <label><span className="pc-label">Pricing tier</span><select className="pc-input" disabled><option>Choose a tier</option></select></label>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <button type="button" className="pc-btn" data-kind="primary" disabled>Approve</button>
          <button type="button" className="pc-btn" disabled>Reject</button>
        </div>
      </div>
    </div>
  );
}

function ApplicationList({ onChanged, tiersOk }: { onChanged: () => void; tiersOk: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const status = params.get("status") ?? "pending";
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [tiers, setTiers] = useState<Named[]>([]);
  const [groups, setGroups] = useState<DiscountGroup[]>([]);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean; href?: string } | null>(null);
  const [open, setOpen] = useState<Application | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await adminService.listApplications(status || undefined) as Application[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The applications could not be loaded.");
    }
  }, [status]);
  useEffect(() => { setApps(null); void load(); }, [load]);
  useEffect(() => {
    if (tiersOk) {
      adminService.listPricingTiers().then((t) => setTiers((Array.isArray(t) ? t : []) as Named[])).catch(() => {});
      apiClient.get<DiscountGroup[]>("/api/v1/admin/discount-groups").then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => {});
    }
  }, [tiersOk]);

  const setStatus = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === "pending") p.delete("status"); else p.set("status", v || "all");
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };
  const shownStatus = status === "all" ? "" : status;

  async function done(text: string, href?: string) {
    setFlash({ text, href });
    onChanged();
    await load();
  }

  return (
    <div data-applications>
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text} {flash.href && <Link href={flash.href} className="pc-link">Open the account</Link>}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}
      <div className="pc-seg" role="group" aria-label="Show" style={{ marginBottom: "16px" }}>
        {FILTERS.map(([v, label]) => (
          <button key={v || "all"} type="button" aria-pressed={shownStatus === v} onClick={() => setStatus(v)}>{label}</button>
        ))}
      </div>
      {error ? <div className="pc-card pc-empty">{error} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
        : apps == null ? <div className="pc-card pc-empty">Loading applications…</div>
        : apps.length === 0 ? (
          <div className="pc-card pc-empty">
            {shownStatus === "pending" ? "No applications waiting. New wholesale sign-ups appear here for you to approve." : "No applications here."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {apps.map((a) => (
              <ApplicationCard key={a.id} a={a} tiers={tiers} groups={groups} tiersOk={tiersOk} onOpen={() => setOpen(a)}
                onDone={done} onError={(text) => setFlash({ text, bad: true })} />
            ))}
          </div>
        )}
      {open && <DetailModal a={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ApplicationCard({ a, tiers, groups, tiersOk, onOpen, onDone, onError }: {
  a: Application; tiers: Named[]; groups: DiscountGroup[]; tiersOk: boolean; onOpen: () => void;
  onDone: (text: string, href?: string) => Promise<void>; onError: (text: string) => void;
}) {
  const [tier, setTier] = useState("");
  const [group, setGroup] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState("");
  const pending = a.status === "pending";
  const [label, tone] = STATUS_PILL[a.status] ?? [a.status, ""];

  async function approve() {
    setBusy("approve");
    try {
      const r = await adminService.approveApplication(a.id, {
        pricing_tier_id: tier || undefined, discount_group_id: group || undefined,
        tax_exempt: taxExempt, ...(notes.trim() ? { admin_notes: notes.trim() } : {}),
      }) as { company_id?: string };
      await onDone(`${a.company_name} is approved. Their account is open.`, r?.company_id ? `/admin/customers/${r.company_id}` : undefined);
    } catch (e) {
      onError(e instanceof Error ? e.message : "The application was not approved.");
    }
    setBusy("");
  }
  async function reject() {
    const reason = await askText(`Reject ${a.company_name}'s application? Say why: it is kept with the application.`, "", {
      title: "Reject application", ok: "Reject", danger: true, placeholder: "The reason",
    });
    if (reason === null) return;
    if (!reason.trim()) { onError("Give a reason to reject it."); return; }
    setBusy("reject");
    try {
      await adminService.rejectApplication(a.id, reason);
      await onDone(`${a.company_name}'s application is rejected.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "The application was not rejected.");
    }
    setBusy("");
  }

  return (
    <div className="pc-card pc-pad" data-application={a.id}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="pc-h2">{a.company_name} applied for a wholesale account</h2>
          <p className="pc-sub-line" style={{ fontSize: "13.5px", margin: "3px 0 0" }}>
            {[`${a.first_name} ${a.last_name}`.trim(), a.email, a.phone].filter(Boolean).join(" · ")} · {day(a.created_at)}
          </p>
        </div>
        <span className="pc-pills">
          <span className="pc-pill" data-tone={tone || undefined}>{label}</span>
          {a.company_id && <Link href={`/admin/customers/${a.company_id}`} className="pc-link" style={{ fontSize: "13.5px" }}>Account</Link>}
        </span>
      </div>
      <div className="pc-form2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "14px" }}>
        <div><span className="pc-label">Business type</span><div>{words(a.business_type) || "—"}</div></div>
        <div><span className="pc-label">Tax ID</span><div>{a.tax_id || "—"}</div></div>
        {pending && tiersOk ? (
          <label><span className="pc-label">Pricing tier</span>
            <select className="pc-input" value={tier} onChange={(e) => setTier(e.target.value)} disabled={!!busy}>
              <option value="">Choose a tier</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
        ) : (
          <div><span className="pc-label">Website</span><div style={{ wordBreak: "break-all" }}>{a.website || "—"}</div></div>
        )}
      </div>
      {a.status === "rejected" && a.rejection_reason && <div className="pc-note" data-tone="red" style={{ marginTop: "12px" }}>Rejected: {a.rejection_reason}</div>}
      {pending && more && (
        <div className="pc-form2" style={{ marginTop: "12px" }}>
          {tiersOk && (
            <label><span className="pc-label">Discount group</span>
              <select className="pc-input" value={group} onChange={(e) => setGroup(e.target.value)} disabled={!!busy}>
                <option value="">None</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select></label>
          )}
          <label className="pc-switch-row" style={{ alignItems: "center", justifyContent: "flex-start", gap: "10px" }}>
            <input type="checkbox" className="pc-check" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} />
            <span>Tax exempt</span>
          </label>
          <label className="pc-wide"><span className="pc-label">Notes for your team</span>
            <textarea className="pc-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      )}
      <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
        {pending && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => void approve()}>{busy === "approve" ? "Approving…" : "Approve"}</button>}
        {pending && <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void reject()}>{busy === "reject" ? "Rejecting…" : "Reject"}</button>}
        {pending && <button type="button" className="pc-btn" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Fewer options" : "More options"}</button>}
        <button type="button" className="pc-btn" onClick={onOpen}>Everything they sent</button>
      </div>
    </div>
  );
}

const DETAIL: [keyof Application, string][] = [
  ["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["phone", "Phone"], ["fax", "Fax"],
  ["company_email", "Company email"], ["business_type", "Business type"], ["secondary_business", "Also does"],
  ["tax_id", "Tax ID"], ["website", "Website"], ["num_employees", "Employees"], ["num_sales_reps", "Sales reps"],
  ["how_heard", "Heard about you"], ["expected_monthly_volume", "Monthly volume"], ["estimated_annual_volume", "Annual volume"],
  ["ppac_number", "PPAC"], ["ppai_number", "PPAI"], ["asi_number", "ASI"], ["admin_notes", "Notes"],
];

function DetailModal({ a, onClose }: { a: Application; onClose: () => void }) {
  const address = [a.address_line1, a.address_line2, a.city, a.state_province, a.postal_code, a.country].filter(Boolean).join(", ");
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label={`${a.company_name}'s application`} style={{ width: "min(680px, 100%)" }}>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">{a.company_name}</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>Applied {day(a.created_at)}</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pc-pad" style={{ display: "grid", gap: "8px" }}>
          {address && <div className="pc-kv"><span>Address</span><b style={{ fontWeight: 500 }}>{address}</b></div>}
          {DETAIL.filter(([k]) => a[k]).map(([k, label]) => (
            <div key={k} className="pc-kv"><span>{label}</span><b style={{ fontWeight: 500, wordBreak: "break-word" }}>{String(a[k])}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}
