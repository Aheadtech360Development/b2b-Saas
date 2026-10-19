"use client";

/**
 * The order list: confirm, print and ship from one place.
 *
 * Everything that narrows the list lives in the address (the tab, the search,
 * payment, method, dates), so a filtered list can be linked to, saved as a
 * view, and exported as it stands. What each row says about itself (paid,
 * artwork, fulfilment, what is next) is worked out on the server in one place
 * (services/order_progress), the same place the order's own page reads.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";
import { ask, askText, tell } from "@/lib/dialog";
import { OrdersFrame, useOrdersOverview, type OrdersTab } from "@/components/admin/orders/OrdersFrame";
import { BuyLabelsDialog, type LabelTarget } from "@/components/admin/orders/BuyLabelsDialog";
import { ConnectCarrierDialog } from "@/components/admin/shipping/ConnectCarrierDialog";
import { useBranding } from "@/components/providers/BrandingProvider";
import { methodWords, packingSlipHtml, pickListHtml, printHtml, toPrintOrder } from "@/lib/orderPrint";

interface Pill { key: string; label: string; tone: string }
interface Progress {
  payment: Pill; artwork: Pill; fulfilment: Pill;
  next: { key: string; label: string; hint: string };
  packed: boolean; pickup: boolean;
}
interface SupplierSummary { supplier: string; status: string; error: string | null }
interface Row {
  id: string;
  order_number: string;
  company_name: string | null;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string;
  item_count: number;
  created_at: string;
  is_guest_order?: boolean;
  guest_email?: string | null;
  guest_name?: string | null;
  supplier?: SupplierSummary | null;
  attribution?: { label: string; campaign?: string | null } | null;
  shipping_method?: string | null;
  // The rate the buyer chose at checkout, when it was a live one.
  carrier?: string | null;
  courier_service?: string | null;
  weight_lbs?: number | null;
  progress?: Progress | null;
}
interface SavedView { id: string; name: string; params: Record<string, string> }

const PAGE_SIZE = 50;
/** What a saved view remembers: the list's own address parameters. */
const VIEW_KEYS = ["queue", "q", "payment", "method", "from", "to"] as const;
/** The queues that have a tab of their own. */
const QUEUE_TABS: Record<string, OrdersTab> = { new: "new", to_ship: "to_ship", ready_for_pickup: "ready_for_pickup" };
/** The queues Home opens that have no tab, in words. What is in each is decided
 *  on the server (services/order_queues), where Home counts them too. */
const QUEUE_WORDS: Record<string, string> = {
  late: "paid orders placed more than three days ago and not shipped",
  pickups: "Will Call orders to hand over",
  unpaid: "orders not paid in full",
  production: "orders in production",
  ready: "orders ready to ship or collect",
  shipped: "orders shipped and not delivered yet",
  sent: "orders shipped or delivered",
};
const PAYMENTS: [string, string][] = [["", "All"], ["paid", "Paid"], ["unpaid", "Unpaid"], ["refunded", "Refunded"]];
const METHODS: [string, string][] = [["", "All"], ["ship", "Ship"], ["pickup", "Pickup"]];
const STATUS_WORDS: Record<string, [string, string]> = {
  pending: ["Pending", "amber"], confirmed: ["Confirmed", "blue"], processing: ["Processing", "blue"],
  ready_for_pickup: ["Ready for pickup", "blue"], shipped: ["Shipped", "green"], delivered: ["Delivered", "green"],
  cancelled: ["Cancelled", ""], refunded: ["Refunded", ""],
};
/** A paid order not shipped this many days after it was placed is late (the
 *  server's line, services/order_queues.LATE_AFTER_DAYS). */
const LATE_AFTER_DAYS = 3;
const SUPPLIER_WORDS: Record<string, string> = {
  not_sent: "not sent", sending: "sending", test: "test only", placed: "ordered", shipped: "shipped", failed: "failed",
};

const money = (n: unknown) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString();
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const customerOf = (r: Row) => (r.is_guest_order ? r.guest_name || r.guest_email : r.company_name) || r.company_name || r.guest_name || r.guest_email || "Guest";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weight = (lbs: number | null | undefined) => (lbs ? `${lbs.toFixed(1)} lb` : "Not set");
/** How it goes out: the buyer's chosen rate when there is one, else the method. */
function shipBy(r: Row): string {
  const service = (r.courier_service ?? "").trim();
  const carrier = (r.carrier ?? "").trim();
  if (service) return carrier && !service.toLowerCase().startsWith(carrier.toLowerCase()) ? `${carrier.toUpperCase()} ${service}` : service;
  const words = methodWords(r.shipping_method).replace(/^Ship, /, "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
/** Where a paid order stands against the day it should have gone out. */
function shipState(r: Row): Pill {
  const over = (Date.now() - new Date(r.created_at).getTime()) / 86_400_000 - LATE_AFTER_DAYS;
  if (over > 0) return { key: "late", label: `${plural(Math.max(1, Math.floor(over)), "day")} late`, tone: "red" };
  if (r.status === "pending") return { key: "confirm", label: "Confirm first", tone: "amber" };
  if (r.progress?.packed) return { key: "packed", label: "Packed", tone: "blue" };
  return { key: "on_time", label: "On time", tone: "green" };
}

export default function AdminOrdersPage() {
  // The address is read with useSearchParams, which wants a boundary above it.
  return <Suspense fallback={null}><OrdersList /></Suspense>;
}

function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const address = sp.toString();
  const { overview, refresh: refreshOverview } = useOrdersOverview();
  const branding = useBranding();
  const shop = branding?.store_name && branding.store_name !== "Store" ? branding.store_name : "";

  const queue = sp.get("queue") ?? "";
  const status = sp.get("status") ?? "";
  const payment = sp.get("payment") ?? "";
  const method = sp.get("method") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const source = sp.get("utm_source") ?? "";
  const campaign = sp.get("utm_campaign") ?? "";
  const companyId = sp.get("company_id") ?? sp.get("company") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [qText, setQText] = useState(sp.get("q") ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pop, setPop] = useState<"payment" | "method" | "dates" | null>(null);
  const [dates, setDates] = useState({ from, to });
  const [views, setViews] = useState<SavedView[]>([]);
  const [working, setWorking] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [labelsFor, setLabelsFor] = useState<LabelTarget[] | null>(null);
  const [exporting, setExporting] = useState(false);
  // Which address the rows on screen answer, once they have arrived.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const asked = useRef(0);

  /** Change the address. Anything that narrows the list goes back to page one. */
  const setParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    if (!("page" in changes)) next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [sp, router, pathname]);

  /** The server's names for what the address holds. */
  const serverParams = useMemo(() => {
    const p: Record<string, string | undefined> = {
      // "Every order that is not a draft", unless the address asks for one status.
      queue: queue || (status ? undefined : "all"),
      status: status || undefined,
      q: sp.get("q") ?? undefined,
      payment: payment || undefined,
      method: method || undefined,
      date_from: from || undefined,
      date_to: to || undefined,
      company_id: companyId || undefined,
      utm_source: source || undefined,
      utm_campaign: campaign || undefined,
    };
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(serverParams)) if (value) query.set(key, value);
      query.set("page", String(page));
      query.set("page_size", String(PAGE_SIZE));
      const data = await apiClient.get<{ items: Row[]; total: number }>(`/api/v1/admin/orders?${query}`);
      // An answer to an earlier question must not land on top of a later one.
      if (mine !== asked.current) return;
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setFailed(false);
      setShownFor(address);
    } catch {
      if (mine !== asked.current) return;
      setRows([]); setTotal(0); setFailed(true);
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [serverParams, page]);

  useEffect(() => { load(); }, [load]);
  // A different list: nothing from the last one stays selected or open.
  useEffect(() => {
    setPicked(new Set()); setOpenId(null);
    setQText(sp.get("q") ?? ""); setDates({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    apiClient.get<{ views: SavedView[] }>("/api/v1/admin/orders/views").then((r) => setViews(r.views ?? [])).catch(() => {});
  }, []);

  // Typing searches once the typing stops.
  useEffect(() => {
    if (qText.trim() === (sp.get("q") ?? "")) return;
    const timer = window.setTimeout(() => setParams({ q: qText.trim() || null }), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setPop(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [pop]);

  const tab: OrdersTab = QUEUE_TABS[queue] ?? "all";
  // The To ship tab is the Ship queue: its own head, columns and batch steps.
  const shipQ = tab === "to_ship";
  const otherQueue = queue && !QUEUE_TABS[queue] && queue !== "all" ? queue : "";
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chosen = rows.filter((r) => picked.has(r.id));
  const open = rows.find((r) => r.id === openId) ?? null;
  const carriers = overview?.carriers ?? [];
  const narrowed = !!(sp.get("q") || payment || method || from || to || source || campaign || companyId || status || otherQueue);
  const only = [
    otherQueue ? QUEUE_WORDS[otherQueue] ?? otherQueue.replace(/_/g, " ") : "",
    source || campaign ? `orders from ${[source, campaign].filter(Boolean).join(" · ")}` : "",
    companyId ? "this customer's orders" : "",
    status ? `${(STATUS_WORDS[status]?.[0] ?? status.replace(/_/g, " ")).toLowerCase()} orders` : "",
  ].filter(Boolean).join(", ");

  function togglePick(id: string) {
    setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));

  async function afterChange(text: string, bad = false) {
    setFlash({ text, bad });
    await load();
    refreshOverview();
  }

  /** Do one thing to several orders, one after another, and say what happened. */
  async function each(doing: string, done: string, targets: Row[], act: (r: Row) => Promise<unknown>) {
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i]!;
      setWorking(`${doing} ${i + 1} of ${targets.length}…`);
      try { await act(r); ok += 1; }
      catch (e) { failures.push(`${r.order_number}: ${e instanceof Error ? e.message : "failed"}`); }
    }
    setWorking("");
    setPicked(new Set());
    await afterChange(
      failures.length ? `${ok} ${done}, ${failures.length} not. ${failures[0]}` : `${plural(ok, "order")} ${done}.`,
      failures.length > 0,
    );
  }

  async function confirmPicked() {
    const targets = chosen.filter((r) => r.status === "pending");
    if (!targets.length) { await tell("None of the selected orders is waiting to be confirmed.", { title: "Nothing to confirm" }); return; }
    const skipped = chosen.length - targets.length;
    const yes = await ask(
      `Confirm ${plural(targets.length, "order")}? Each customer is emailed that their order is confirmed.`
      + (skipped ? ` ${plural(skipped, "order")} already past that step will be left as ${skipped === 1 ? "it is" : "they are"}.` : ""),
      { title: "Confirm orders", ok: "Confirm" },
    );
    if (!yes) return;
    await each("Confirming", "confirmed", targets, (r) => adminService.updateOrder(r.id, { status: "confirmed" }));
  }

  // Ready to go out: accepted, not a pickup, and no print job on it still open.
  // Sending several orders at once never sends one whose artwork is not approved.
  const artOpen = (r: Row) => ["in_review", "revision"].includes(r.progress?.artwork.key ?? "");
  const shippable = (r: Row) => ["confirmed", "processing"].includes(r.status) && !r.progress?.pickup && !artOpen(r);

  async function shipPicked() {
    const targets = chosen.filter(shippable);
    if (!targets.length) {
      await tell("None of the selected orders can be marked shipped. An order has to be confirmed, not shipped yet, not a pickup, and its artwork approved.", { title: "Nothing to mark shipped" });
      return;
    }
    const skipped = chosen.length - targets.length;
    const yes = await ask(
      `Mark ${plural(targets.length, "order")} as shipped without a tracking number? Each customer is emailed that their order has shipped.`
      + (skipped ? ` ${plural(skipped, "order")} will be left as ${skipped === 1 ? "it is" : "they are"}.` : ""),
      { title: "Mark shipped", ok: "Mark shipped" },
    );
    if (!yes) return;
    await each("Marking shipped", "marked shipped", targets, (r) => apiClient.patch(`/api/v1/admin/orders/${r.id}/status`, { status: "shipped" }));
  }

  /** Labels for the orders that can go out; the dialog fetches each one's rates. */
  async function buyLabels(targets: Row[]) {
    const ready = targets.filter(shippable);
    if (!ready.length) {
      await tell("None of these orders can have a label yet. An order has to be confirmed, not shipped yet, not a pickup, and its artwork approved.", { title: "No labels to buy" });
      return;
    }
    setLabelsFor(ready.map((r) => ({ id: r.id, order_number: r.order_number, customer: customerOf(r) })));
  }

  async function printEach(targets: Row[], what: string, make: (orders: ReturnType<typeof toPrintOrder>[]) => string) {
    if (!targets.length) return;
    setWorking(`Getting the ${what.toLowerCase()} ready…`);
    try {
      const orders = [];
      for (const r of targets) orders.push(toPrintOrder(await adminService.getOrder(r.id) as Parameters<typeof toPrintOrder>[0]));
      printHtml(what, make(orders));
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : `The ${what.toLowerCase()} could not be made.`, bad: true });
    }
    setWorking("");
  }
  const printPickList = (targets: Row[]) => printEach(targets, "Pick list", pickListHtml);
  // One slip per order, each on its own page.
  const printSlips = (targets: Row[]) => printEach(targets, "Packing slips", (orders) => orders.map((o) => packingSlipHtml(o, shop)).join(""));

  async function saveView() {
    const params: Record<string, string> = {};
    for (const key of VIEW_KEYS) { const v = sp.get(key); if (v) params[key] = v; }
    const name = (await askText("It keeps the tab, the search and the filters as they are now, for everyone in your shop.", "", {
      title: "Save this view", ok: "Save view", placeholder: "For example: Unpaid pickups",
    }))?.trim();
    if (!name) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
    const next = [...views.filter((v) => v.name.toLowerCase() !== name.toLowerCase()), { id, name: name.slice(0, 60), params }].slice(-20);
    try {
      const saved = await apiClient.put<{ views: SavedView[] }>("/api/v1/admin/orders/views", { views: next });
      setViews(saved.views ?? next);
      setFlash({ text: `Saved the view "${name}".` });
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : "The view could not be saved.", bad: true });
    }
  }

  async function removeView(view: SavedView) {
    if (!await ask(`Remove the saved view "${view.name}"?`, { title: "Remove this view", ok: "Remove", danger: true })) return;
    const next = views.filter((v) => v.id !== view.id);
    try {
      const saved = await apiClient.put<{ views: SavedView[] }>("/api/v1/admin/orders/views", { views: next });
      setViews(saved.views ?? next);
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : "The view could not be removed.", bad: true });
    }
  }

  function applyView(view: SavedView) {
    const qs = new URLSearchParams(view.params).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function exportList() {
    setExporting(true);
    try { await adminService.exportOrdersCsv(serverParams); }
    catch { setFlash({ text: "The export could not be made.", bad: true }); }
    setExporting(false);
  }

  const paymentLabel = PAYMENTS.find(([v]) => v === payment)?.[1] ?? "All";
  const methodLabel = METHODS.find(([v]) => v === method)?.[1] ?? "All";
  const datesLabel = from || to ? `${from ? shortDay(from) : "Start"} to ${to ? shortDay(to) : "today"}` : "Date range";
  const pill = (p: Pill) => <span className="pc-pill" data-tone={p.tone || undefined} style={{ textTransform: "none" }}>{p.label}</span>;

  return (
    <OrdersFrame
      active={tab}
      overview={overview}
      {...(shipQ ? {
        title: "Ship queue",
        lede: "Paid orders ready to go out. Buy labels in one batch.",
        // With nothing ticked, the head's buttons act on every order shown.
        actions: <button type="button" className="pc-btn" disabled={!!working || rows.length === 0} onClick={() => printPickList(chosen.length ? chosen : rows)}>Print pick list</button>,
        primary: <button type="button" className="pc-btn" data-kind="primary" disabled={!!working || rows.length === 0} onClick={() => buyLabels(chosen.length ? chosen : rows)}>Buy labels</button>,
      } : {
        actions: <button type="button" className="pc-btn" onClick={exportList} disabled={exporting}>{exporting ? "Exporting…" : "Export"}</button>,
      })}
    >
      {shipQ && overview && carriers.length === 0 && (
        <div className="pc-note" data-carrier-banner style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span>No carrier is connected. Connect UPS, FedEx or USPS to buy labels here. You can still mark orders shipped by hand.</span>
          <button type="button" className="pc-btn" style={{ height: "36px" }} onClick={() => setConnecting(true)}>Connect a carrier</button>
        </div>
      )}

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      {only && (
        <div className="pc-note" data-tone="blue" data-only style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>Showing only {only}</span>
          <button type="button" className="pc-inline" onClick={() => setParams({ queue: otherQueue ? null : queue || null, utm_source: null, utm_campaign: null, company_id: null, company: null, status: null })}>Show all orders</button>
        </div>
      )}

      <div className="pc-filters no-print">
        <label className="pc-field">
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Order number, customer or PO" aria-label="Search orders" />
        </label>

        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "payment"} onClick={() => setPop(pop === "payment" ? null : "payment")}>
            Payment: {paymentLabel}
          </button>
          {pop === "payment" && (
            <div className="pc-pop" role="menu">
              {PAYMENTS.map(([value, label]) => (
                <button key={value} type="button" role="menuitemradio" aria-checked={payment === value} className="pc-pop-item" data-on={payment === value ? "" : undefined}
                  onClick={() => { setParams({ payment: value || null }); setPop(null); }}>{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Nothing in the Ship queue is a pickup, so there is no method to choose. */}
        {!shipQ && (
          <div className="pc-pop-wrap">
            <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "method"} onClick={() => setPop(pop === "method" ? null : "method")}>
              Method: {methodLabel}
            </button>
            {pop === "method" && (
              <div className="pc-pop" role="menu">
                {METHODS.map(([value, label]) => (
                  <button key={value} type="button" role="menuitemradio" aria-checked={method === value} className="pc-pop-item" data-on={method === value ? "" : undefined}
                    onClick={() => { setParams({ method: value || null }); setPop(null); }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="dialog" aria-expanded={pop === "dates"} onClick={() => setPop(pop === "dates" ? null : "dates")}>
            {datesLabel}
          </button>
          {pop === "dates" && (
            <div className="pc-pop" role="dialog" aria-label="Date range">
              <form className="pc-pop-form" onSubmit={(e) => { e.preventDefault(); setParams({ from: dates.from || null, to: dates.to || null }); setPop(null); }}>
                <div>
                  <label className="pc-label" htmlFor="orders-from">Placed from</label>
                  <input id="orders-from" type="date" className="pc-input" value={dates.from} max={dates.to || undefined} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} />
                </div>
                <div>
                  <label className="pc-label" htmlFor="orders-to">To</label>
                  <input id="orders-to" type="date" className="pc-input" value={dates.to} min={dates.from || undefined} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} />
                </div>
                <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                  {(from || to) && <button type="button" className="pc-link" onClick={() => { setParams({ from: null, to: null }); setPop(null); }}>Any date</button>}
                  <button type="submit" className="pc-btn" data-kind="primary" style={{ height: "38px" }}>Apply</button>
                </div>
              </form>
            </div>
          )}
        </div>

        <button type="button" className="pc-btn" onClick={saveView}>Save view</button>
        {narrowed && (
          <button type="button" className="pc-link" onClick={() => router.replace(QUEUE_TABS[queue] ? `${pathname}?queue=${queue}` : pathname, { scroll: false })}>Clear filters</button>
        )}
      </div>

      {views.length > 0 && (
        <div className="pc-chips no-print" data-views>
          Saved views
          {views.map((v) => (
            <span key={v.id} className="pc-chip">
              <button type="button" onClick={() => applyView(v)}>{v.name}</button>
              <button type="button" data-x aria-label={`Remove the view ${v.name}`} onClick={() => removeView(v)}>×</button>
            </span>
          ))}
        </div>
      )}

      {(chosen.length > 0 || working) && (
        <div className="pc-bulk no-print" role="toolbar" aria-label="Selected orders">
          <span className="pc-bulk-n">{working || `${chosen.length} selected`}</span>
          {shipQ ? (
            <>
              <button type="button" disabled={!!working} onClick={() => buyLabels(chosen)}>Buy labels for {chosen.length}</button>
              <button type="button" disabled={!!working} onClick={shipPicked}>Mark shipped</button>
              <button type="button" disabled={!!working} onClick={() => printSlips(chosen)}>Print packing slips</button>
            </>
          ) : (
            <>
              <button type="button" disabled={!!working} onClick={confirmPicked}>Confirm</button>
              <button type="button" disabled={!!working} onClick={() => printPickList(chosen)}>Print pick list</button>
              <button type="button" disabled={!!working} onClick={() => buyLabels(chosen)}>Buy labels</button>
              <button type="button" disabled={!!working} onClick={shipPicked}>Mark shipped</button>
            </>
          )}
          <button type="button" className="pc-bulk-clear" disabled={!!working} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      <div className="pc-list" data-panel={open ? "" : undefined}>
        <div className="pc-card" data-shown={shownFor ?? undefined} aria-busy={loading}>
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "760px" }}>
              <thead>
                <tr>
                  <th className="pc-td-check">
                    <input type="checkbox" className="pc-check" aria-label="Select every order on this page" checked={allPicked} disabled={rows.length === 0}
                      ref={(el) => { if (el) el.indeterminate = !allPicked && chosen.length > 0; }}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
                  </th>
                  {shipQ
                    ? <><th>Order</th><th>Customer</th><th>Date</th><th className="pc-num">Weight</th><th>Method</th><th>State</th></>
                    : <><th>Order</th><th>Customer</th><th>Date</th><th>Payment</th><th>Artwork</th><th>Fulfilment</th><th className="pc-num">Total</th></>}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && [0, 1, 2, 3].map((i) => (
                  <tr key={i}><td colSpan={shipQ ? 7 : 8}><div className="at-skel" style={{ height: "18px", width: `${70 - i * 9}%`, borderRadius: "6px" }} /></td></tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={shipQ ? 7 : 8} className="pc-empty">
                    {failed ? "The orders could not be loaded. Reload to try again."
                      : narrowed ? "No orders match this search and these filters."
                      : tab === "all" ? "No orders yet. The first one will show here."
                      : shipQ ? "Nothing to ship right now. Paid orders show here once their print jobs are ready."
                      : "Nothing in this queue right now."}
                  </td></tr>
                )}
                {rows.map((r) => {
                  const p = r.progress;
                  return (
                    <tr key={r.id} data-href data-order={r.order_number} tabIndex={0}
                      data-selected={picked.has(r.id) ? "" : undefined} data-open={openId === r.id ? "" : undefined}
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(openId === r.id ? null : r.id); }}>
                      <td className="pc-td-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="pc-check" aria-label={`Select order ${r.order_number}`} checked={picked.has(r.id)} onChange={() => togglePick(r.id)} />
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.order_number}</td>
                      <td className="pc-td-clip" title={customerOf(r)}>{customerOf(r)}</td>
                      <td style={{ color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{day(r.created_at)}</td>
                      {shipQ ? (
                        <>
                          <td className="pc-num" style={{ whiteSpace: "nowrap", color: r.weight_lbs ? undefined : "var(--pc-muted)" }}>{weight(r.weight_lbs)}</td>
                          <td className="pc-td-clip" title={shipBy(r)}>{shipBy(r)}</td>
                          <td data-ship-state={shipState(r).key}>{pill(shipState(r))}</td>
                        </>
                      ) : (
                        <>
                          <td>{p && pill(p.payment)}</td>
                          <td>{p && pill(p.artwork)}</td>
                          <td>{p && pill(p.fulfilment)}</td>
                          <td className="pc-num" style={{ fontWeight: 600 }}>{money(r.total)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pc-table-foot">
            <span data-total>{plural(total, "order")}</span>
            {pages > 1 ? (
              <span className="pc-row-actions no-print">
                <button type="button" className="pc-link" disabled={page <= 1} onClick={() => setParams({ page: page > 2 ? String(page - 1) : null })} style={{ opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button type="button" className="pc-link" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })} style={{ opacity: page >= pages ? 0.4 : 1 }}>Next</button>
              </span>
            ) : <span>{shipQ ? "Pickup orders live in their own tab and never show a label step." : "Click a row to open it in the side panel"}</span>}
          </div>
        </div>

        {open && (
          <aside className="pc-panel" aria-label={`Order ${open.order_number}`} data-panel-order={open.order_number}>
            <div className="pc-panel-head">
              <div style={{ minWidth: 0 }}>
                <h2 className="pc-h2" style={{ fontSize: "22px" }}>Order {open.order_number}</h2>
                <div className="pc-sub-line">{customerOf(open)}, {day(open.created_at)}</div>
              </div>
              <button type="button" className="pc-x" aria-label="Close the panel" onClick={() => setOpenId(null)}><X size={19} strokeWidth={2.2} /></button>
            </div>
            <div className="pc-panel-body">
              <div className="pc-pills">
                {open.progress && pill(open.progress.payment)}
                {open.progress && pill(open.progress.fulfilment)}
                {/* The status too, when the fulfilment pill is not already saying it. */}
                {["confirmed", "processing"].includes(open.status)
                  && <span className="pc-pill" data-tone={STATUS_WORDS[open.status]![1] || undefined} style={{ textTransform: "none" }}>{STATUS_WORDS[open.status]![0]}</span>}
              </div>

              {open.progress && (
                <div>
                  <div className="pc-small-head">Next step</div>
                  <div style={{ fontSize: "15.5px", fontWeight: 600 }}>{open.progress.next.label}</div>
                  {open.progress.next.hint && <div className="pc-sub-line">{open.progress.next.hint}</div>}
                </div>
              )}

              {open.progress?.next.key === "ship" && overview && carriers.length === 0 && (
                <div className="pc-note">
                  No carrier is connected yet, so rates can&apos;t load. <button type="button" className="pc-inline" onClick={() => setConnecting(true)}>Connect a carrier</button>
                </div>
              )}
              {open.progress?.next.key === "artwork" && (
                <div className="pc-note" data-tone="blue">Artwork is approved on the Production screen. <Link href="/admin/production">Open Production</Link></div>
              )}
              {open.progress?.next.key === "print" && (
                <div className="pc-note" data-tone="blue">The sheet is being printed. Mark it ready to ship on the Production screen. <Link href="/admin/production">Open Production</Link></div>
              )}
              {open.supplier && (
                <div className="pc-kv"><span>{open.supplier.supplier} purchase order</span><b>{SUPPLIER_WORDS[open.supplier.status] ?? open.supplier.status}</b></div>
              )}
              {open.attribution && <div className="pc-kv"><span>Came from</span><b>{open.attribution.label}</b></div>}
              {open.po_number && <div className="pc-kv"><span>PO number</span><b>{open.po_number}</b></div>}
              <div className="pc-kv"><span>Items</span><b>{open.item_count}</b></div>
              {shipQ && <div className="pc-kv"><span>Weight</span><b>{weight(open.weight_lbs)}</b></div>}
              {shipQ && <div className="pc-kv"><span>Goes by</span><b>{shipBy(open)}</b></div>}

              <hr className="pc-rule" />
              <div className="pc-kv"><span>Order total</span><b style={{ fontSize: "16px" }}>{money(open.total)}</b></div>

              <Link href={`/admin/orders/${open.id}`} className="pc-btn" data-kind="primary" data-block="" style={{ height: "46px" }}>Open order</Link>
              <button type="button" className="pc-btn" data-block="" disabled={!!working} onClick={() => printPickList([open])} style={{ height: "46px" }}>Print pick list</button>
              {shipQ && <button type="button" className="pc-btn" data-block="" disabled={!!working} onClick={() => printSlips([open])} style={{ height: "46px" }}>Print packing slip</button>}
            </div>
          </aside>
        )}
      </div>

      {labelsFor && (
        <BuyLabelsDialog
          targets={labelsFor}
          carriers={carriers}
          notify
          onClose={() => setLabelsFor(null)}
          onBought={() => { setPicked(new Set()); load(); refreshOverview(); }}
        />
      )}
      {connecting && (
        <ConnectCarrierDialog onClose={() => setConnecting(false)}
          onConnected={(_key, now) => {
            setConnecting(false);
            refreshOverview();
            setFlash({ text: `${now.filter((c) => c.connection.connected).map((c) => c.name).join(", ")} connected. Rates and labels now come from your own account.` });
          }} />
      )}
    </OrdersFrame>
  );
}
