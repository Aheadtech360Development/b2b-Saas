"use client";

/**
 * Customers — everyone who buys from the shop: accounts (retail and wholesale)
 * and guests, in one list (services/customer_directory.py on the server).
 *
 * The tabs and the Type filter are the same thing (?type=); search, status,
 * sort and the page are in the address too, so a refresh or a shared link
 * shows the same rows. A row opens the customer's page.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { CustomersFrame, useCustomersOverview, type CustomersTab } from "@/components/admin/customers/CustomersFrame";
import {
  customerHref, customersService, type CustomerKind, type CustomerList,
} from "@/services/customers.service";
import { KIND_LABEL, KIND_TONE, STATUS_PILL, day, money } from "@/lib/customerWords";
import { AddCustomerModal } from "@/components/admin/customers/AddCustomerModal";

const PAGE_SIZE = 50;

const STATUSES: [string, string][] = [["", "All"], ["active", "Active"], ["pending", "Pending"], ["suspended", "Suspended"], ["guest", "No account"]];
const SORTS: [string, string][] = [["newest", "Newest"], ["oldest", "Oldest"], ["spent", "Most spent"], ["orders", "Most orders"], ["recent", "Last order"], ["name", "Name"]];

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading customers…</div></div>}>
      <CustomersList />
    </Suspense>
  );
}

function CustomersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const type = (params.get("type") ?? "") as CustomerKind | "";
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "newest";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const here = params.toString();

  const { overview, refresh: refreshOverview } = useCustomersOverview();
  const [data, setData] = useState<CustomerList | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [qText, setQText] = useState(q);
  const [pop, setPop] = useState<"type" | "status" | "sort" | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const seq = useRef(0);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    if (!("page" in next)) p.delete("page");
    const s = p.toString();
    router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  // The search box writes the address a moment after typing stops.
  useEffect(() => { setQText(q); }, [q]);
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [qText, q, setParams]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await customersService.list({ q, type, status, sort, page, page_size: PAGE_SIZE });
      if (mine !== seq.current) return;
      setData(d);
      setLoadError("");
    } catch (e) {
      if (mine !== seq.current) return;
      setLoadError(e instanceof Error ? e.message : "The customers could not be loaded.");
    }
    setShownFor(here);
  }, [q, type, status, sort, page, here]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setPop(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pop]);

  async function exportCsv() {
    setExporting(true);
    try { await customersService.exportCsv({ q, type, status, sort }); }
    catch { setFlash({ text: "The export did not download. Try again.", bad: true }); }
    setExporting(false);
  }

  const rows = data?.items ?? [];
  const loaded = shownFor === here;
  const first = (page - 1) * PAGE_SIZE + 1;
  const tab: CustomersTab = type || "all";
  const filtered = !!(q || status);

  return (
    <CustomersFrame
      active={tab}
      overview={overview}
      actions={<>
        <button type="button" className="pc-btn" onClick={exportCsv} disabled={exporting}>{exporting ? "Exporting…" : "Export"}</button>
        <button type="button" className="pc-btn" data-kind="primary" onClick={() => setAdding(true)}>+ Add customer</button>
      </>}
    >
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: "1 1 320px", maxWidth: "none" }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by name, company or email" aria-label="Search customers" />
        </label>
        <Menu id="type" label={`Type: ${type ? KIND_LABEL[type] : "All"}`} pop={pop} setPop={setPop}
          items={[["", "All"], ["retail", "Retail"], ["wholesale", "Wholesale"], ["guest", "Guest"]]} value={type}
          counts={data?.counts as unknown as Record<string, number> | undefined}
          onPick={(v) => setParams({ type: v || null })} />
        <Menu id="status" label={`Status: ${STATUSES.find(([v]) => v === status)?.[1] ?? "All"}`} pop={pop} setPop={setPop}
          items={STATUSES} value={status} onPick={(v) => setParams({ status: v || null })} />
        <Menu id="sort" label={`Sort: ${SORTS.find(([v]) => v === sort)?.[1] ?? "Newest"}`} pop={pop} setPop={setPop}
          items={SORTS} value={sort} onPick={(v) => setParams({ sort: v === "newest" ? null : v })} />
      </div>

      <div className="pc-card" data-shown={shownFor ?? undefined} aria-busy={!loaded} data-customer-list>
        {loadError ? (
          <div className="pc-empty">{loadError} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
        ) : !data ? (
          <div className="pc-empty">Loading customers…</div>
        ) : rows.length === 0 ? (
          <div className="pc-empty">
            {filtered ? "No customer matches these filters." : type === "guest" ? "Nobody has checked out as a guest yet."
              : type ? `No ${KIND_LABEL[type].toLowerCase()} customers yet.` : "No customers yet. They appear here with their first order or sign-up."}
          </div>
        ) : (
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "860px" }}>
              <thead>
                <tr>
                  <th>Customer</th><th>Type</th><th className="pc-num">Logins</th><th className="pc-num">Orders</th>
                  <th className="pc-num">Spent</th><th>Joined</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [sLabel, sTone] = STATUS_PILL[r.status] ?? [r.status, ""];
                  const href = customerHref(r);
                  const sub = r.kind === "guest" ? r.email : [r.contact !== r.name ? r.contact : null, r.email].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id} data-href data-customer={r.id} onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} className="pc-row-title" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                        {sub && <span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px", marginTop: "1px" }}>{sub}</span>}
                      </td>
                      <td><span className="pc-pill" data-tone={KIND_TONE[r.kind] || undefined}>{KIND_LABEL[r.kind]}</span></td>
                      <td className="pc-num">{r.logins}</td>
                      <td className="pc-num">{r.orders}</td>
                      <td className="pc-num">{money(r.spent)}</td>
                      <td>{day(r.joined)}</td>
                      <td><span className="pc-pill" data-tone={sTone || undefined}>{sLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="pc-table-foot" data-total={data.total}>
            <span>Showing {first}–{Math.min(first + rows.length - 1, data.total)} of {data.total}</span>
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
              <button type="button" className="pc-btn" disabled={first + rows.length - 1 >= data.total} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
            </span>
          </div>
        )}
      </div>
      {data && (
        <p className="pc-sub-line" style={{ fontSize: "13px", marginTop: "10px" }}>
          Totals come from your {data.counts.orders.toLocaleString()} {data.counts.orders === 1 ? "order" : "orders"}. Spent leaves out cancelled and refunded orders.
        </p>
      )}

      {adding && (
        <AddCustomerModal
          overview={overview}
          onClose={() => setAdding(false)}
          onDone={(id, invited) => {
            setAdding(false);
            refreshOverview();
            router.push(`/admin/customers/${id}${invited ? "?invited=1" : ""}`);
          }}
        />
      )}
    </CustomersFrame>
  );
}

function Menu({ id, label, items, value, onPick, pop, setPop, counts }: {
  id: "type" | "status" | "sort";
  label: string;
  items: [string, string][];
  value: string;
  onPick: (v: string) => void;
  pop: string | null;
  setPop: (v: "type" | "status" | "sort" | null) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="pc-pop-wrap">
      <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === id} data-menu={id}
        onClick={() => setPop(pop === id ? null : id)}>{label}</button>
      {pop === id && (
        <div className="pc-pop" role="menu">
          {items.map(([v, l]) => (
            <button key={v || "all"} type="button" role="menuitemradio" aria-checked={value === v} className="pc-pop-item"
              data-on={value === v ? "" : undefined} onClick={() => { onPick(v); setPop(null); }}>
              <span>{l}</span>
              {counts && <span style={{ color: "var(--pc-muted)" }}>{counts[v || "all"] ?? 0}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
