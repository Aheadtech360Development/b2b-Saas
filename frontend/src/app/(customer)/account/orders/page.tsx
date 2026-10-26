"use client";

/**
 * Orders: everything the buyer has bought, and beside it what they saved for
 * later, their returns and reprints, and receipts. The tab is in the address
 * (?tab=), so the older pages for saved carts, templates and returns open here.
 * Saved carts, templates and returns belong to a company account (the API
 * refuses them otherwise), so a retail buyer sees orders and receipts.
 */
import Link from "next/link";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { accountService } from "@/services/account.service";
import { apiClient } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";
import { day, money } from "@/lib/customerWords";
import {
  Banner, Chip, Empty, Loading, OrderChip, PageHead, PaymentChip, Tabs, num, saveCsv, saveOrderPdf, words,
} from "@/components/portal/ui";
import { reorderToCart, type OrderPage, type OrderRow } from "@/components/portal/data";

type Tab = "all" | "saved" | "returns" | "receipts";

const STATUSES = ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled", "refunded"];
const PAGE = 50;

function useOrders(q: string, status: string) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), page_size: String(PAGE) });
      if (q) qs.set("q", q);
      if (status) qs.set("status", status);
      const data = await apiClient.get<OrderPage>(`/api/v1/orders?${qs}`);
      setRows((prev) => (p === 1 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setPage(p);
      setPages(data.pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => { load(1); }, [load]);
  return { rows, total, page, pages, loading, error, load };
}

function AllOrders({ q }: { q: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { rows, total, page, pages, loading, error, load } = useOrders(q, status);

  useEffect(() => setSearch(q), [q]);

  const shown = useMemo(() => rows.filter((o) => {
    const d = (o.created_at || "").slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }), [rows, from, to]);

  async function reorder(id: string) {
    setBusy(id);
    try {
      await reorderToCart(id);
      router.push("/cart");
    } catch {
      tell("That order could not be added to your cart. Please try again.");
      setBusy(null);
    }
  }

  function exportCsv() {
    saveCsv("orders.csv", ["Order", "PO", "Status", "Payment", "Items", "Date", "Total"],
      shown.map((o) => [o.order_number, o.po_number ?? "", words(o.status), words(o.payment_status), o.item_count,
        (o.created_at || "").slice(0, 10), num(o.total).toFixed(2)]));
  }

  return (
    <>
      <form className="cp-filters" onSubmit={(e) => {
        e.preventDefault();
        router.replace(`/account/orders${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`);
      }}>
        <label className="cp-sr" htmlFor="o-q">Order or PO number</label>
        <input id="o-q" className="cp-input cp-grow" type="search" placeholder="Order number or PO number"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="cp-sr" htmlFor="o-status">Status</label>
        <select id="o-status" className="cp-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status: All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{words(s)}</option>)}
        </select>
        <label className="cp-sr" htmlFor="o-from">From</label>
        <input id="o-from" className="cp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <label className="cp-sr" htmlFor="o-to">To</label>
        <input id="o-to" className="cp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <button type="button" className="cp-btn" onClick={exportCsv} disabled={!shown.length}>Export</button>
      </form>

      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad" onRetry={() => load(1)}>{error}</Banner></div>}

      <div className="cp-card" style={{ overflow: "hidden" }}>
        {loading && rows.length === 0 ? (
          <Loading what="Loading your orders" />
        ) : shown.length === 0 ? (
          <Empty title={q || status || from || to ? "No orders match" : "No orders yet"}>
            {q || status || from || to ? "Try another number, status or date." : (
              <div style={{ marginTop: 12 }}><Link href="/products" className="cp-btn cp-btn-p">Start shopping</Link></div>
            )}
          </Empty>
        ) : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead>
                <tr><th>Order</th><th>PO</th><th>Status</th><th className="cp-num">Items</th><th>Date</th><th className="cp-num">Total</th><th><span className="cp-sr">Actions</span></th></tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/account/orders/${o.id}`} className="cp-row-link">{o.order_number}</Link></td>
                    <td className="cp-muted">{o.po_number || "—"}</td>
                    <td><OrderChip status={o.status} /></td>
                    <td className="cp-num">{o.item_count}</td>
                    <td>{day(o.created_at)}</td>
                    <td className="cp-num">{money(num(o.total))}</td>
                    <td className="cp-end">
                      <button type="button" className="cp-btn cp-btn-sm" disabled={busy === o.id} onClick={() => reorder(o.id)}>
                        {busy === o.id ? "Adding…" : "Reorder"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="cp-actions" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <span className="cp-note">{total ? `${shown.length} of ${total} order${total === 1 ? "" : "s"}` : ""}</span>
        {page < pages && (
          <button type="button" className="cp-btn" disabled={loading} onClick={() => load(page + 1)}>
            {loading ? "Loading…" : "Show more"}
          </button>
        )}
      </div>
    </>
  );
}

interface SavedCart {
  id: string;
  abandoned_at: string;
  total: number;
  item_count: number;
  is_recovered: boolean;
  items: { variant_id: string; product_name: string; sku: string; color: string; size: string; quantity: number; unit_price: number; line_total: number }[];
}

interface Template {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
}

function SavedForLater() {
  const router = useRouter();
  const [carts, setCarts] = useState<SavedCart[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiClient.get<SavedCart[]>("/api/v1/account/abandoned-carts").then(setCarts)
      .catch(() => { setCarts([]); setError("Your saved carts could not be loaded."); });
    (accountService.getTemplates() as Promise<Template[]>).then(setTemplates).catch(() => setTemplates([]));
  }, []);
  useEffect(load, [load]);

  async function recover(id: string) {
    setBusy(id);
    try {
      await apiClient.post(`/api/v1/account/abandoned-carts/${id}/recover`, {});
      router.push("/cart");
    } catch {
      tell("That cart could not be brought back. Please try again.");
      setBusy(null);
    }
  }

  async function removeCart(id: string) {
    if (!await ask("Delete this saved cart? Its items leave your cart too.", { ok: "Delete", danger: true })) return;
    try {
      await apiClient.delete(`/api/v1/account/abandoned-carts/${id}`);
      setCarts((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch {
      tell("That cart could not be deleted. Please try again.");
    }
  }

  async function loadTemplate(id: string) {
    setBusy(id);
    try {
      await accountService.loadTemplate(id);
      router.push("/cart");
    } catch {
      tell("That template could not be added to your cart. Please try again.");
      setBusy(null);
    }
  }

  async function removeTemplate(id: string) {
    if (!await ask("Delete this template?", { ok: "Delete", danger: true })) return;
    try {
      await accountService.deleteTemplate(id);
      setTemplates((prev) => (prev ?? []).filter((t) => t.id !== id));
    } catch {
      tell("That template could not be deleted. Please try again.");
    }
  }

  if (carts === null || templates === null) return <Loading />;

  return (
    <div className="cp-stack">
      {error && <Banner tone="bad" onRetry={load}>{error}</Banner>}
      <section className="cp-card" style={{ overflow: "hidden" }} aria-labelledby="saved-carts">
        <div style={{ padding: "16px 20px" }}>
          <h2 id="saved-carts" className="cp-h3">Carts you left</h2>
          <p className="cp-note" style={{ margin: "4px 0 0" }}>Items still in your cart from an earlier visit. Bring them back to check out.</p>
        </div>
        {carts.length === 0 ? <Empty title="Nothing saved">A cart you leave without checking out shows here.</Empty> : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Saved</th><th className="cp-num">Items</th><th className="cp-num">Total</th><th><span className="cp-sr">Actions</span></th></tr></thead>
              <tbody>
                {carts.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td>{day(c.abandoned_at)}</td>
                      <td className="cp-num">{c.item_count}</td>
                      <td className="cp-num">{money(c.total)}</td>
                      <td className="cp-end">
                        <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="cp-btn cp-btn-sm cp-btn-ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                            {open === c.id ? "Hide items" : "View items"}
                          </button>
                          <button type="button" className="cp-btn cp-btn-sm cp-btn-p" disabled={busy === c.id} onClick={() => recover(c.id)}>
                            {busy === c.id ? "Opening…" : "Back to cart"}
                          </button>
                          <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => removeCart(c.id)}>Delete</button>
                        </span>
                      </td>
                    </tr>
                    {open === c.id && (
                      <tr>
                        <td colSpan={4} style={{ background: "var(--cp-panel)" }}>
                          <ul style={{ margin: 0, padding: "4px 0 4px 18px", display: "grid", gap: 4, fontSize: 13 }}>
                            {c.items.map((it, i) => (
                              <li key={`${it.variant_id}-${i}`}>
                                {it.product_name} {[it.color, it.size].filter(Boolean).join(" / ")} <span className="cp-muted">({it.sku})</span>: {it.quantity} x {money(it.unit_price)}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cp-card" style={{ overflow: "hidden" }} aria-labelledby="templates">
        <div style={{ padding: "16px 20px" }}>
          <h2 id="templates" className="cp-h3">Order templates</h2>
          <p className="cp-note" style={{ margin: "4px 0 0" }}>Lists you saved from your cart to order again in one step.</p>
        </div>
        {templates.length === 0 ? <Empty title="No templates">Save your cart as a template from the cart page.</Empty> : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Name</th><th className="cp-num">Items</th><th>Saved</th><th><span className="cp-sr">Actions</span></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="cp-strong">{t.name}</td>
                    <td className="cp-num">{t.item_count}</td>
                    <td>{day(t.created_at)}</td>
                    <td className="cp-end">
                      <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="cp-btn cp-btn-sm cp-btn-p" disabled={busy === t.id} onClick={() => loadTemplate(t.id)}>
                          {busy === t.id ? "Adding…" : "Add to cart"}
                        </button>
                        <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => removeTemplate(t.id)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

interface Rma {
  id: string;
  order_id: string;
  rma_number: string;
  status: string;
  reason: string;
  notes: string | null;
  admin_notes: string | null;
  items: { id: string; quantity: number }[];
  created_at: string;
}

const RMA_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "mute"> = {
  pending: "warn", approved: "info", rejected: "bad", completed: "ok",
};
const RMA_WORDS: Record<string, string> = {
  pending: "Waiting for the shop", approved: "Approved", rejected: "Not accepted", completed: "Done",
};

function Returns() {
  const [rows, setRows] = useState<Rma[] | null>(null);
  const [orders, setOrders] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    (accountService.getRmas() as Promise<Rma[]>).then(setRows)
      .catch(() => { setRows([]); setError("Your returns could not be loaded."); });
    apiClient.get<OrderPage>("/api/v1/orders?page=1&page_size=100")
      .then((d) => setOrders(new Map(d.items.map((o) => [o.id, o.order_number]))))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  if (rows === null) return <Loading />;
  return (
    <div className="cp-stack">
      {error && <Banner tone="bad" onRetry={load}>{error}</Banner>}
      <div className="cp-card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <Empty title="No returns or reprints">
            Something wrong with an order? Ask for a reprint or a refund.
            <div style={{ marginTop: 12 }}><Link href="/account/returns/new" className="cp-btn cp-btn-p">Request a reprint or return</Link></div>
          </Empty>
        ) : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Request</th><th>Order</th><th>Date</th><th>Status</th><th>Reason</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cp-mono">{r.rma_number}</td>
                    <td><Link href={`/account/orders/${r.order_id}`} className="cp-row-link">{orders.get(r.order_id) ?? "View order"}</Link></td>
                    <td>{day(r.created_at)}</td>
                    <td><Chip tone={RMA_TONE[r.status] ?? "mute"}>{RMA_WORDS[r.status] ?? words(r.status)}</Chip></td>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>{r.reason}</div>
                      {r.admin_notes && <div className="cp-note">Shop: {r.admin_notes}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="cp-note">The shop answers by email. You can follow each request here and on its order.</p>
    </div>
  );
}

function Receipts() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiClient.get<OrderPage>("/api/v1/orders?page=1&page_size=100")
      .then((d) => setRows(d.items.filter((o) => ["paid", "refunded", "partially_refunded"].includes(o.payment_status))))
      .catch(() => { setRows([]); setError("Your receipts could not be loaded."); });
  }, []);
  useEffect(load, [load]);

  async function save(o: OrderRow) {
    setBusy(o.id);
    if (!await saveOrderPdf(o.id, "invoice", o.order_number)) tell("That receipt could not be downloaded. Please try again.");
    setBusy(null);
  }

  if (rows === null) return <Loading />;
  return (
    <div className="cp-stack">
      {error && <Banner tone="bad" onRetry={load}>{error}</Banner>}
      <div className="cp-card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? <Empty title="No receipts yet">A receipt is ready here once an order is paid.</Empty> : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Order</th><th>Date</th><th>Payment</th><th className="cp-num">Total</th><th><span className="cp-sr">Download</span></th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/account/orders/${o.id}`} className="cp-row-link">{o.order_number}</Link></td>
                    <td>{day(o.created_at)}</td>
                    <td><PaymentChip status={o.payment_status} /></td>
                    <td className="cp-num">{money(num(o.total))}</td>
                    <td className="cp-end">
                      <button type="button" className="cp-btn cp-btn-sm" disabled={busy === o.id} onClick={() => save(o)}>
                        {busy === o.id ? "Preparing…" : "Download PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersPage() {
  const params = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const company = !!user?.company_id;
  const asked = (params.get("tab") ?? "all") as Tab;
  const tab: Tab = !company && (asked === "saved" || asked === "returns") ? "all" : asked;
  const q = (params.get("q") ?? "").trim();

  const tabs = [
    { key: "all", label: "All orders", href: "/account/orders", on: tab === "all" },
    ...(company ? [
      { key: "saved", label: "Saved for later", href: "/account/orders?tab=saved", on: tab === "saved" },
      { key: "returns", label: "Returns and reprints", href: "/account/orders?tab=returns", on: tab === "returns" },
    ] : []),
    { key: "receipts", label: "Receipts", href: "/account/orders?tab=receipts", on: tab === "receipts" },
  ];

  return (
    <>
      <PageHead eyebrow="Orders" title="Orders" sub="Everything you have bought, in one list."
        actions={company && tab === "returns"
          ? <Link href="/account/returns/new" className="cp-btn cp-btn-p">Request a reprint or return</Link>
          : undefined} />
      <Tabs label="Orders" tabs={tabs} />
      {tab === "saved" ? <SavedForLater /> : tab === "returns" ? <Returns /> : tab === "receipts" ? <Receipts /> : <AllOrders q={q} />}
    </>
  );
}

export default function AccountOrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersPage />
    </Suspense>
  );
}
