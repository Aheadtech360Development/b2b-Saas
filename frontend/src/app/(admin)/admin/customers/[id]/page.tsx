"use client";

/**
 * One customer: an account (/admin/customers/<company id>) or a guest
 * (/admin/customers/guest?email=…), read from services/customer_directory.py.
 *
 * Tabs in the address (?tab=): Overview, Orders, Logins, Pricing and terms and
 * Notes for an account; Overview and Orders for a guest, who has no account to
 * keep logins, terms or notes on. "Create account" gives a guest one, and
 * their orders move onto it.
 *
 * The wholesale parts (pricing tier, shipping tier, net terms, discount
 * groups) are changed through /admin/companies, which only a plan with the
 * wholesale toolset reaches; on a plan without it they are a lock card.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ask, askText } from "@/lib/dialog";
import { useCustomersOverview, PlanLock } from "@/components/admin/customers/CustomersFrame";
import { AddCustomerModal } from "@/components/admin/customers/AddCustomerModal";
import { adminService } from "@/services/admin.service";
import {
  customersService, type CustomerLogin, type CustomerOrder, type CustomerOrdersPage, type CustomerProfile,
} from "@/services/customers.service";
import { KIND_LABEL, ORDER_PILL, ROLE_LABEL, STATUS_PILL, day, money, words } from "@/lib/customerWords";

type Tab = "overview" | "orders" | "logins" | "terms" | "notes";
type Flash = { text: string; bad?: boolean } | null;

export default function CustomerPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading the customer…</div></div>}>
      <CustomerView />
    </Suspense>
  );
}

function errText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function CustomerView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const isGuest = id === "guest";
  const email = params.get("email") ?? "";
  const tab = (params.get("tab") ?? "overview") as Tab;
  const { overview } = useCustomersOverview();
  const features = overview?.features ?? { wholesale_accounts: true, customer_tiers: true, net_terms: true };

  const [c, setC] = useState<CustomerProfile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const p = isGuest ? await customersService.guest(email) : await customersService.account(id);
      setC(p);
      setLoadError("");
    } catch (e) {
      setLoadError(errText(e, "This customer could not be loaded."));
    }
  }, [id, email, isGuest]);
  useEffect(() => { void load(); }, [load]);

  // Arrived from Add customer.
  useEffect(() => {
    const invited = params.get("invited");
    if (invited === null) return;
    setFlash({ text: invited === "1" ? "Added. They have been emailed a link to set their password." : "Added." });
    const p = new URLSearchParams(params.toString());
    p.delete("invited");
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const setTab = useCallback((t: Tab) => {
    const p = new URLSearchParams(params.toString());
    if (t === "overview") p.delete("tab"); else p.set("tab", t);
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  /** Run a change; the answer is the customer as it now is. */
  async function change(label: string, run: () => Promise<CustomerProfile>, done: string) {
    setBusy(label);
    try {
      const next = await run();
      setC(next);
      setFlash({ text: done });
    } catch (e) {
      setFlash({ text: errText(e, "That did not save."), bad: true });
    }
    setBusy("");
  }

  if (loadError) {
    return (
      <div className="pc-page">
        <Link href="/admin/customers" className="pc-back">← Customers</Link>
        <div className="pc-card pc-empty" style={{ marginTop: "16px" }}>{loadError} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
      </div>
    );
  }
  if (!c) return <div className="pc-page"><div className="pc-card pc-empty">Loading the customer…</div></div>;

  const account = c.kind !== "guest";
  const tabs: [Tab, string, number | null][] = account
    ? [["overview", "Overview", null], ["orders", "Orders", c.stats.orders], ["logins", "Logins", c.logins.length],
       ["terms", "Pricing and terms", null], ["notes", "Notes", null]]
    : [["overview", "Overview", null], ["orders", "Orders", c.stats.orders]];
  const shown = tabs.some(([t]) => t === tab) ? tab : "overview";
  const [statusLabel, statusTone] = STATUS_PILL[c.status] ?? [c.status, ""];

  return (
    <div className="pc-page" data-customer-page={c.kind} data-customer={c.id}>
      <Link href="/admin/customers" className="pc-back">← Customers</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Customer</div>
          <h1 className="pc-h1">{c.name}</h1>
          <p className="pc-sub-line" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {account ? `${KIND_LABEL[c.kind]} account` : "Guest, no account"}
            {account && c.status !== "active" && <span className="pc-pill" data-tone={statusTone || undefined}>{statusLabel}</span>}
            {c.joined && <span>· {account ? "joined" : "first order"} {day(c.joined)}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {account ? (<>
            <Link className="pc-btn" data-kind="primary"
              href={`/admin/orders/drafts?new=1&company=${c.id}&company_name=${encodeURIComponent(c.name)}`}>New order</Link>
            <button type="button" className="pc-btn" onClick={() => setEditing(true)}>Edit</button>
          </>) : (
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => setCreating(true)}>Create account</button>
          )}
        </div>
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      <nav className="pc-tabs" aria-label="Customer">
        {tabs.map(([t, label, n]) => (
          <button key={t} type="button" className="pc-tab" data-tab={t} data-on={shown === t ? "" : undefined}
            aria-current={shown === t ? "page" : undefined} onClick={() => setTab(t)}>
            {label}{n != null && <span className="pc-tab-count">{n}</span>}
          </button>
        ))}
      </nav>

      {shown === "overview" && (
        <Overview c={c} features={features} busy={busy} setTab={setTab} onInvite={() => setInviting(true)}
          onCreate={() => setCreating(true)} change={change} />
      )}
      {shown === "orders" && <OrdersTab c={c} />}
      {shown === "logins" && account && (
        <LoginsTab c={c} busy={busy} onInvite={() => setInviting(true)} change={change} />
      )}
      {shown === "terms" && account && (
        <TermsTab c={c} features={features} busy={busy} change={change} reload={load} setFlash={setFlash} />
      )}
      {shown === "notes" && account && <NotesTab c={c} busy={busy} change={change} />}

      {editing && account && (
        <EditModal c={c} onClose={() => setEditing(false)}
          onSaved={(next) => { setC(next); setEditing(false); setFlash({ text: "Saved." }); }} />
      )}
      {inviting && account && (
        <InviteModal c={c} onClose={() => setInviting(false)}
          onDone={(next) => {
            setC(next);
            setInviting(false);
            setFlash({ text: next.invited ? "Login added. They have been emailed a link to set their password." : "Login added. The invite email could not be sent; send it again from Logins." , bad: !next.invited });
          }} />
      )}
      {creating && !account && (
        <AddCustomerModal
          overview={overview}
          initial={{
            name: c.name, email: c.email ?? undefined, phone: c.contact?.phone ?? undefined,
            first_name: (c.contact?.name ?? "").split(" ")[0] || undefined,
            last_name: (c.contact?.name ?? "").split(" ").slice(1).join(" ") || undefined,
            address_line1: c.address?.line1, city: c.address?.city, state_province: c.address?.state,
            postal_code: c.address?.postal_code, country: c.address?.country,
          }}
          onClose={() => setCreating(false)}
          onDone={(newId, invited) => router.push(`/admin/customers/${newId}?invited=${invited ? 1 : 0}`)}
        />
      )}
    </div>
  );
}

type Change = (label: string, run: () => Promise<CustomerProfile>, done: string) => Promise<void>;
type Features = { wholesale_accounts: boolean; customer_tiers: boolean; net_terms: boolean };

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ c, features, busy, setTab, onInvite, onCreate, change }: {
  c: CustomerProfile; features: Features; busy: string; setTab: (t: Tab) => void;
  onInvite: () => void; onCreate: () => void; change: Change;
}) {
  const account = c.kind !== "guest";
  const wholesaleTools = features.customer_tiers || features.net_terms;
  return (
    <div className="pc-cols" style={{ marginTop: "18px" }}>
      <div style={{ minWidth: 0 }}>
        <div className="pc-stats2">
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{c.stats.orders}</div><div className="pc-stat4-l">Orders</div></div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(c.stats.spent)}</div><div className="pc-stat4-l">Total spent</div></div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{money(c.stats.average)}</div><div className="pc-stat4-l">Average order</div>
            {c.stats.last_order && <div className="pc-stat4-s">Last order {day(c.stats.last_order)}</div>}</div>
        </div>
        <div className="pc-card" data-recent-orders>
          <div className="pc-card-head">
            <h2 className="pc-h2">Recent orders</h2>
            {c.stats.orders > c.recent_orders.length && <button type="button" className="pc-link" onClick={() => setTab("orders")}>View all</button>}
          </div>
          <OrdersTable rows={c.recent_orders} empty={account ? "No orders yet." : "No orders."} />
        </div>
        <Details c={c} />
      </div>

      <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
        {account ? (
          <div className="pc-card pc-pad" data-logins-card>
            <h2 className="pc-h2" style={{ marginBottom: "6px" }}>Logins</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", margin: "0 0 10px" }}>
              {c.logins.length === 0 ? "Nobody signs in for this account yet."
                : `${c.logins.length} buyer ${c.logins.length === 1 ? "login" : "logins"}`}
            </p>
            {c.logins.slice(0, 3).map((l) => (
              <div key={l.user_id} className="pc-person">
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: "14px" }}>{l.name || l.email}</span>
                  <span className="pc-sub-line" style={{ fontSize: "12.5px" }}>{l.email}</span>
                </span>
                <LoginPill l={l} />
              </div>
            ))}
            {c.logins.length > 3 && <button type="button" className="pc-link" onClick={() => setTab("logins")}>All {c.logins.length} logins</button>}
            <div style={{ marginTop: "12px" }}><button type="button" className="pc-btn" onClick={onInvite}>Invite a login</button></div>
          </div>
        ) : (
          <div className="pc-card pc-pad" data-guest-card>
            <h2 className="pc-h2" style={{ marginBottom: "6px" }}>No account</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", margin: "0 0 12px", lineHeight: 1.5 }}>
              {c.account_waiting
                ? "They checked out as a guest. Their checkout emailed them a link to open an account, and it has not been used yet."
                : "They checked out as a guest and have no account here."}
              {" "}Creating one moves their orders onto it.
            </p>
            <button type="button" className="pc-btn" data-kind="primary" onClick={onCreate}>Create account</button>
          </div>
        )}

        {account && (
          <div className="pc-card pc-pad" data-terms-card>
            <h2 className="pc-h2" style={{ marginBottom: "10px" }}>{c.kind === "wholesale" ? "Wholesale terms" : "Terms"}</h2>
            {wholesaleTools ? (<>
              <div className="pc-kv"><span>Pricing tier</span><b>{c.terms?.pricing_tier?.name ?? "None"}</b></div>
              <div className="pc-kv" style={{ marginTop: "6px" }}><span>Net 30</span><b>{c.terms?.net30_enabled ? "On" : "Off"}</b></div>
              <div className="pc-kv" style={{ marginTop: "6px" }}><span>Tax exempt</span><b>{c.terms?.tax_exempt ? "Yes" : "No"}</b></div>
              <div style={{ marginTop: "12px" }}><button type="button" className="pc-btn" onClick={() => setTab("terms")}>Change terms</button></div>
            </>) : (
              <PlanLock title="Included from Wholesale" blurb="Pricing tiers, net terms and approval need the Wholesale plan." />
            )}
          </div>
        )}

        {account && (
          <div className="pc-card pc-pad" data-notes-card>
            <h2 className="pc-h2" style={{ marginBottom: "6px" }}>Notes</h2>
            {c.notes
              ? <p style={{ whiteSpace: "pre-wrap", fontSize: "14px", margin: "0 0 12px", color: "var(--pc-ink)", maxHeight: "9.5em", overflow: "hidden" }}>{c.notes}</p>
              : <p className="pc-sub-line" style={{ fontSize: "13.5px", margin: "0 0 12px" }}>No notes yet. Private to your team.</p>}
            <button type="button" className="pc-btn" onClick={() => setTab("notes")}>{c.notes ? "Edit notes" : "Add note"}</button>
          </div>
        )}

        {account && <TagsCard c={c} busy={busy} change={change} />}
        {account && <AccountCard c={c} busy={busy} change={change} />}

        {!account && c.contact && (
          <div className="pc-card pc-pad">
            <h2 className="pc-h2" style={{ marginBottom: "10px" }}>Contact</h2>
            <div className="pc-kv"><span>Email</span><b style={{ wordBreak: "break-all" }}>{c.email}</b></div>
            {c.contact.phone && <div className="pc-kv" style={{ marginTop: "6px" }}><span>Phone</span><b>{c.contact.phone}</b></div>}
            {c.address && <div className="pc-kv" style={{ marginTop: "6px" }}><span>Ships to</span>
              <b>{[c.address.line1, c.address.city, c.address.state, c.address.postal_code].filter(Boolean).join(", ")}</b></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginPill({ l }: { l: CustomerLogin }) {
  if (!l.active) return <span className="pc-pill" data-tone="red">Turned off</span>;
  if (l.invited) return <span className="pc-pill" data-tone="amber">Invited</span>;
  return <span className="pc-pill">{ROLE_LABEL[l.role] ?? l.role}</span>;
}

const DETAIL_LABELS: [string, string][] = [
  ["company_email", "Company email"], ["phone", "Phone"], ["website", "Website"], ["business_type", "Business type"],
  ["secondary_business", "Also does"], ["tax_id", "Tax ID"], ["tax_id_expiry", "Tax ID expires"],
  ["estimated_annual_volume", "Annual volume"], ["num_employees", "Employees"], ["num_sales_reps", "Sales reps"],
  ["how_heard", "Heard about you"], ["ppac_number", "PPAC"], ["ppai_number", "PPAI"], ["asi_number", "ASI"], ["fax", "Fax"],
];

function Details({ c }: { c: CustomerProfile }) {
  if (c.kind === "guest" || !c.details) return null;
  const d = c.details;
  const address = [d.address_line1, d.address_line2, [d.city, d.state_province, d.postal_code].filter(Boolean).join(" "), d.country]
    .filter(Boolean).join(", ");
  const rows: [string, string][] = [];
  if (c.contact?.name || c.contact?.email) rows.push(["Contact", [c.contact?.name, c.contact?.email, c.contact?.phone].filter(Boolean).join(" · ")]);
  if (address) rows.push(["Address", address]);
  for (const [k, label] of DETAIL_LABELS) if (d[k]) rows.push([label, k === "business_type" || k === "secondary_business" ? words(d[k]) : String(d[k])]);
  return (
    <div className="pc-card" style={{ marginTop: "16px" }} data-details>
      <div className="pc-card-head"><h2 className="pc-h2">Details</h2></div>
      <div className="pc-pad" style={{ display: "grid", gap: "8px" }}>
        {rows.length === 0 ? <span className="pc-sub-line" style={{ fontSize: "13.5px" }}>Nothing more on file. Add it with Edit.</span>
          : rows.map(([k, v]) => <div key={k} className="pc-kv"><span>{k}</span><b style={{ fontWeight: 500, wordBreak: "break-word" }}>{v}</b></div>)}
      </div>
    </div>
  );
}

function TagsCard({ c, busy, change }: { c: CustomerProfile; busy: string; change: Change }) {
  const [text, setText] = useState("");
  const tags = c.tags ?? [];
  const save = (next: string[], done: string) => change("tags", () => customersService.edit(c.id, { tags: next }), done);
  return (
    <div className="pc-card pc-pad" data-tags-card>
      <h2 className="pc-h2" style={{ marginBottom: "4px" }}>Tags</h2>
      <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: "0 0 10px" }}>A discount group applies to the customers that carry its tag.</p>
      <div className="pc-pills" style={{ marginBottom: "10px" }}>
        {tags.length === 0 && <span className="pc-sub-line" style={{ fontSize: "13px" }}>No tags.</span>}
        {tags.map((t) => (
          <span key={t} className="pc-pill" data-tone="blue">
            {t}
            <button type="button" aria-label={`Remove ${t}`} disabled={!!busy} onClick={() => void save(tags.filter((x) => x !== t), `Removed ${t}.`)}
              style={{ border: 0, background: "none", marginLeft: "4px", cursor: "pointer", color: "inherit", padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <form style={{ display: "flex", gap: "8px" }} onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || tags.includes(t)) { setText(""); return; }
        void save([...tags, t], `Tagged ${t}.`).then(() => setText(""));
      }}>
        <input className="pc-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a tag" aria-label="Add a tag" style={{ flex: 1 }} />
        <button type="submit" className="pc-btn" disabled={!!busy || !text.trim()}>Add</button>
      </form>
    </div>
  );
}

function AccountCard({ c, busy, change }: { c: CustomerProfile; busy: string; change: Change }) {
  const suspended = c.status === "suspended";
  async function suspend() {
    const reason = await askText("Suspend this account? Nobody can sign in for it or order until it is reactivated. The reason goes into its notes.", "", {
      title: "Suspend account", ok: "Suspend", placeholder: "Reason (optional)",
    });
    if (reason === null) return;
    await change("suspend", () => customersService.suspend(c.id, reason), "Suspended. Nobody can sign in for it until it is reactivated.");
  }
  return (
    <div className="pc-card pc-pad" data-account-card>
      <h2 className="pc-h2" style={{ marginBottom: "10px" }}>Account</h2>
      <div className="pc-kv"><span>Status</span><b>{STATUS_PILL[c.status]?.[0] ?? c.status}</b></div>
      <div className="pc-switch-row" style={{ marginTop: "12px" }}>
        <span>Tax exempt<span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px", fontWeight: 400 }}>No sales tax at checkout.</span></span>
        <button type="button" className="pc-switch" role="switch" aria-checked={!!c.terms?.tax_exempt} data-on={c.terms?.tax_exempt ? "" : undefined}
          aria-label="Tax exempt" disabled={!!busy}
          onClick={() => void change("tax", () => customersService.edit(c.id, { tax_exempt: !c.terms?.tax_exempt }),
            c.terms?.tax_exempt ? "Tax exempt is off." : "Tax exempt: no sales tax at checkout.")} />
      </div>
      <div style={{ marginTop: "14px" }}>
        {suspended
          ? <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void change("reactivate", () => customersService.reactivate(c.id), "Reactivated. They can sign in and order again.")}>Reactivate</button>
          : <button type="button" className="pc-btn" data-kind="danger" disabled={!!busy} onClick={() => void suspend()}>Suspend account</button>}
      </div>
    </div>
  );
}

function OrdersTable({ rows, empty }: { rows: CustomerOrder[]; empty: string }) {
  const router = useRouter();
  if (rows.length === 0) return <div className="pc-empty">{empty}</div>;
  return (
    <div className="pc-scroll-x">
      <table className="pc-table">
        <thead><tr><th>Order</th><th>Date</th><th className="pc-num">Total</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((o) => {
            const [label, tone] = ORDER_PILL[o.status] ?? [o.status, ""];
            return (
              <tr key={o.id} data-href onClick={() => router.push(`/admin/orders/${o.id}`)}>
                <td><Link href={`/admin/orders/${o.id}`} className="pc-row-title" onClick={(e) => e.stopPropagation()}>{o.order_number}</Link></td>
                <td>{day(o.created_at)}</td>
                <td className="pc-num">{money(o.total)}</td>
                <td><span className="pc-pills"><span className="pc-pill" data-tone={tone || undefined}>{label}</span>
                  {o.payment_status && o.payment_status !== "paid" && <span className="pc-pill" data-tone="amber">{o.payment_status === "unpaid" ? "Unpaid" : o.payment_status.replace(/_/g, " ")}</span>}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────

function OrdersTab({ c }: { c: CustomerProfile }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerOrdersPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const key = c.kind === "guest" ? { email: c.email ?? "" } : { id: c.id };
    customersService.orders(key, page).then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(errText(e, "The orders could not be loaded.")); });
    return () => { live = false; };
  }, [c.id, c.kind, c.email, page]);
  return (
    <div className="pc-card" style={{ marginTop: "18px" }} data-orders-tab aria-busy={!data}>
      {error ? <div className="pc-empty">{error}</div>
        : !data ? <div className="pc-empty">Loading orders…</div>
        : <OrdersTable rows={data.items} empty="No orders yet." />}
      {data && data.total > data.items.length && (
        <div className="pc-table-foot">
          <span>Page {data.page} of {data.pages} · {data.total} orders</span>
          <span style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="pc-btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Logins ────────────────────────────────────────────────────────────────────

function LoginsTab({ c, busy, onInvite, change }: { c: CustomerProfile; busy: string; onInvite: () => void; change: Change }) {
  async function toggle(l: CustomerLogin) {
    if (l.active && !await ask(`Turn off ${l.name || l.email}'s login? They cannot sign in for ${c.name} until it is turned on again.`, { title: "Turn off login", ok: "Turn off", danger: true })) return;
    await change(`login-${l.user_id}`, () => customersService.changeLogin(c.id, l.user_id, { active: !l.active }),
      l.active ? `${l.email} can no longer sign in.` : `${l.email} can sign in again.`);
  }
  return (
    <div className="pc-card" style={{ marginTop: "18px" }} data-logins-tab>
      <div className="pc-card-head">
        <div>
          <h2 className="pc-h2">Who signs in for {c.name}</h2>
          <p className="pc-sub-line" style={{ fontSize: "13px", margin: "2px 0 0" }}>An owner manages the account's people; buyers order; viewers look; finance pays invoices.</p>
        </div>
        <button type="button" className="pc-btn" data-kind="primary" onClick={onInvite}>Invite a login</button>
      </div>
      {c.logins.length === 0 ? <div className="pc-empty">Nobody signs in for this account yet.</div> : (
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "720px" }}>
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {c.logins.map((l) => (
                <tr key={l.user_id} data-login={l.email}>
                  <td><span style={{ display: "block", fontWeight: 600 }}>{l.name || "—"}</span><span className="pc-sub-line" style={{ fontSize: "12.5px" }}>{l.email}</span></td>
                  <td>
                    <select className="pc-input" style={{ height: "34px", width: "auto" }} value={l.role} disabled={!!busy} aria-label={`Role for ${l.email}`}
                      onChange={(e) => void change(`role-${l.user_id}`, () => customersService.changeLogin(c.id, l.user_id, { role: e.target.value }), `${l.email} is now ${ROLE_LABEL[e.target.value] ?? e.target.value}.`)}>
                      {Object.entries(ROLE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </td>
                  <td><LoginPill l={l} /></td>
                  <td>{l.last_login ? day(l.last_login) : l.invited ? "Not yet" : "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {l.invited && l.active && (
                      <button type="button" className="pc-btn" disabled={!!busy} style={{ marginRight: "8px" }}
                        onClick={() => void change(`resend-${l.user_id}`, () => customersService.changeLogin(c.id, l.user_id, { resend: true }), `Invite sent again to ${l.email}.`)}>Send invite again</button>
                    )}
                    <button type="button" className="pc-btn" data-kind={l.active ? "danger" : undefined} disabled={!!busy} onClick={() => void toggle(l)}>
                      {l.active ? "Turn off" : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InviteModal({ c, onClose, onDone }: { c: CustomerProfile; onClose: () => void; onDone: (p: CustomerProfile) => void }) {
  const [f, setF] = useState({ email: "", first_name: "", last_name: "", role: "buyer" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try { onDone(await customersService.addLogin(c.id, f)); }
    catch (err) { setError(errText(err, "The login was not added.")); setSaving(false); }
  }
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label="Invite a login" onSubmit={save} data-invite>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">Invite a login</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>They get an email with a link to set their password and sign in for {c.name}.</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px" }}>
          {error && <div className="pc-note" data-tone="red" style={{ marginBottom: "12px" }} role="alert">{error}</div>}
          <div className="pc-form2">
            <label className="pc-wide"><span className="pc-label">Email *</span>
              <input className="pc-input" type="email" required autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label><span className="pc-label">First name</span><input className="pc-input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
            <label><span className="pc-label">Last name</span><input className="pc-input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></label>
            <label className="pc-wide"><span className="pc-label">Role</span>
              <select className="pc-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {Object.entries(ROLE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select></label>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={saving}>{saving ? "Sending…" : "Send invite"}</button>
        </div>
      </form>
    </div>
  );
}

// ── Pricing and terms ─────────────────────────────────────────────────────────

interface Named { id: string; name: string }
interface DiscountGroup { id: string; title: string; customer_tag: string | null; status: string; applies_to?: string }

function TermsTab({ c, features, busy, change, reload, setFlash }: {
  c: CustomerProfile; features: Features; busy: string; change: Change; reload: () => Promise<void>; setFlash: (f: Flash) => void;
}) {
  const [pricing, setPricing] = useState<Named[]>([]);
  const [shipping, setShipping] = useState<Named[]>([]);
  const [groups, setGroups] = useState<DiscountGroup[]>([]);
  const [saving, setSaving] = useState("");
  const wholesaleTools = features.customer_tiers || features.net_terms;

  useEffect(() => {
    if (!features.customer_tiers) return;
    adminService.listPricingTiers().then((t) => setPricing((Array.isArray(t) ? t : []) as Named[])).catch(() => {});
    adminService.listShippingTiers().then((t) => setShipping((Array.isArray(t) ? t : []) as Named[])).catch(() => {});
    apiClient.get<DiscountGroup[]>("/api/v1/admin/discount-groups").then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => {});
  }, [features.customer_tiers]);

  const matched = useMemo(() => groups.filter((g) => g.customer_tag && (c.tags ?? []).includes(g.customer_tag)), [groups, c.tags]);

  /** The wholesale terms are kept by /admin/companies. */
  async function wholesale(label: string, run: () => Promise<unknown>, done: string) {
    setSaving(label);
    try { await run(); await reload(); setFlash({ text: done }); }
    catch (e) { setFlash({ text: errText(e, "That did not save."), bad: true }); }
    setSaving("");
  }

  return (
    <div className="pc-cols" style={{ marginTop: "18px" }} data-terms-tab>
      <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
        {!wholesaleTools ? (
          <PlanLock title="Included from Wholesale" blurb="Pricing tiers, net terms and approval need the Wholesale plan." />
        ) : (<>
          {features.customer_tiers && (
            <div className="pc-card pc-pad">
              <h2 className="pc-h2" style={{ marginBottom: "12px" }}>Pricing</h2>
              <div className="pc-form2">
                <label><span className="pc-label">Pricing tier</span>
                  <select className="pc-input" value={c.terms?.pricing_tier?.id ?? ""} disabled={!!saving}
                    onChange={(e) => void wholesale("tier", () => adminService.updateCompany(c.id, { pricing_tier_id: e.target.value || null }), "Pricing tier saved.")}>
                    <option value="">None (list prices)</option>
                    {pricing.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></label>
                <label><span className="pc-label">Shipping tier</span>
                  <select className="pc-input" value={c.terms?.shipping_tier?.id ?? ""} disabled={!!saving}
                    onChange={(e) => void wholesale("ship", () => adminService.updateCompany(c.id, { shipping_tier_id: e.target.value || null }), "Shipping tier saved.")}>
                    <option value="">Store default</option>
                    {shipping.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></label>
              </div>
              <div style={{ marginTop: "16px" }}>
                <span className="pc-label">Discount groups</span>
                {matched.length === 0
                  ? <p className="pc-sub-line" style={{ fontSize: "13px", margin: "4px 0 0" }}>None. A discount group applies when the customer carries its tag (Overview, Tags).</p>
                  : <div className="pc-pills" style={{ marginTop: "6px" }}>{matched.map((g) => <span key={g.id} className="pc-pill" data-tone={g.status === "enabled" ? "blue" : undefined}>{g.title} · @{g.customer_tag}</span>)}</div>}
                <p style={{ margin: "8px 0 0" }}><Link href="/admin/customers/tiers" className="pc-link">Manage pricing tiers and discount groups</Link></p>
              </div>
            </div>
          )}
          {features.net_terms && (
            <div className="pc-card pc-pad">
              <div className="pc-switch-row">
                <span>Net 30
                  <span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px", fontWeight: 400, marginTop: "2px" }}>
                    {c.status === "active" ? "They can order now and pay the invoice within 30 days." : "Only an active account can have net terms."}
                  </span>
                </span>
                <button type="button" className="pc-switch" role="switch" aria-label="Net 30" aria-checked={!!c.terms?.net30_enabled}
                  data-on={c.terms?.net30_enabled ? "" : undefined} disabled={!!saving || c.status !== "active"}
                  onClick={() => void wholesale("net30", () => apiClient.patch(`/api/v1/admin/companies/${c.id}/net30`, { net30_enabled: !c.terms?.net30_enabled }),
                    c.terms?.net30_enabled ? "Net 30 is off." : "Net 30 is on: they can pay within 30 days.")} />
              </div>
            </div>
          )}
        </>)}
      </div>
      <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
        <div className="pc-card pc-pad">
          <div className="pc-switch-row">
            <span>Tax exempt<span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px", fontWeight: 400, marginTop: "2px" }}>No sales tax at checkout. Keep their certificate on file.</span></span>
            <button type="button" className="pc-switch" role="switch" aria-label="Tax exempt" aria-checked={!!c.terms?.tax_exempt}
              data-on={c.terms?.tax_exempt ? "" : undefined} disabled={!!busy}
              onClick={() => void change("tax", () => customersService.edit(c.id, { tax_exempt: !c.terms?.tax_exempt }), c.terms?.tax_exempt ? "Tax exempt is off." : "Tax exempt: no sales tax at checkout.")} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function NotesTab({ c, busy, change }: { c: CustomerProfile; busy: string; change: Change }) {
  const [text, setText] = useState(c.notes ?? "");
  useEffect(() => { setText(c.notes ?? ""); }, [c.notes]);
  const dirty = text.trim() !== (c.notes ?? "").trim();
  return (
    <div className="pc-card pc-pad" style={{ marginTop: "18px", maxWidth: "820px" }} data-notes-tab>
      <h2 className="pc-h2" style={{ marginBottom: "4px" }}>Notes</h2>
      <p className="pc-sub-line" style={{ fontSize: "13px", margin: "0 0 12px" }}>Private to your team. The customer never sees them.</p>
      <textarea className="pc-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="What the team should know about this customer" aria-label="Notes" />
      <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
        <button type="button" className="pc-btn" data-kind="primary" disabled={!dirty || !!busy}
          onClick={() => void change("notes", () => customersService.edit(c.id, { notes: text }), "Notes saved.")}>{busy === "notes" ? "Saving…" : "Save notes"}</button>
        {dirty && <button type="button" className="pc-btn" onClick={() => setText(c.notes ?? "")}>Discard</button>}
      </div>
    </div>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

const EDIT_FIELDS: [string, string, boolean?][] = [
  ["name", "Name", true], ["trading_name", "Trading as"], ["company_email", "Company email"], ["phone", "Phone"],
  ["website", "Website"], ["business_type", "Business type"], ["tax_id", "Tax ID"],
  ["address_line1", "Address", true], ["address_line2", "Address line 2", true],
  ["city", "City"], ["state_province", "State"], ["postal_code", "ZIP"], ["country", "Country"],
];

function EditModal({ c, onClose, onSaved }: { c: CustomerProfile; onClose: () => void; onSaved: (p: CustomerProfile) => void }) {
  const start = useMemo(() => Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, k === "name" ? c.name : (c.details?.[k] ?? "")])), [c]);
  const [f, setF] = useState<Record<string, string>>(start as Record<string, string>);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => (v ?? "") !== ((start as Record<string, string>)[k] ?? "")));
    if (Object.keys(changed).length === 0) { onClose(); return; }
    setSaving(true); setError("");
    try { onSaved(await customersService.edit(c.id, changed)); }
    catch (err) { setError(errText(err, "Not saved.")); setSaving(false); }
  }
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label="Edit customer" onSubmit={save} style={{ width: "min(680px, 100%)" }} data-edit-customer>
        <div className="pc-panel-head">
          <h2 className="pc-h2">Edit {c.name}</h2>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px" }}>
          {error && <div className="pc-note" data-tone="red" style={{ marginBottom: "12px" }} role="alert">{error}</div>}
          <div className="pc-form2">
            {EDIT_FIELDS.map(([k, label, wide]) => (
              <label key={k} className={wide ? "pc-wide" : undefined}><span className="pc-label">{label}</span>
                <input className="pc-input" value={f[k] ?? ""} required={k === "name"} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
