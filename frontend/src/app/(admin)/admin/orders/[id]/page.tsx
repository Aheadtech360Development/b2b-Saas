"use client";

/**
 * One order: where it stands, what is in it, how it leaves, and the money.
 *
 * The steps across the top, the main button and the pills come from the server
 * (services/order_progress), the same answer the order list shows, so the two
 * screens cannot disagree about what is next. Every action here calls the
 * route that already did that job; what is new is "packed" and the team's
 * notes, both kept as entries in the order's own history.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Lock, X } from "lucide-react";
import { ask, askText, tell } from "@/lib/dialog";
import { adminService } from "@/services/admin.service";
import { apiClient } from "@/lib/api-client";
import { canWrite } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { OrderGangSheets } from "@/components/admin/OrderGangSheets";
import { GangSheetLineFiles, type GangSheetProduction } from "@/components/admin/GangSheetLineFiles";
import { OrderRefunds, type DisputeRow, type RefundRow } from "@/components/admin/OrderRefunds";
import { ConversionSummary, type Conversion } from "@/components/admin/ConversionSummary";
import { OrderShipments } from "@/components/admin/OrderShipments";
import { discountAmount, discountLabel } from "@/lib/orderMoney";
import { methodWords, packingSlipHtml, pickListHtml, printHtml, toPrintOrder } from "@/lib/orderPrint";
import type { LineConfiguration, OrderDiscountLine } from "@/types/order.types";

interface Pill { key: string; label: string; tone: string }
interface Step { key: string; label: string; state: "done" | "current" | "todo" | "stopped" }
interface Progress {
  payment: Pill; artwork: Pill; fulfilment: Pill;
  next: { key: string; label: string; hint: string };
  packed: boolean; pickup: boolean; steps: Step[];
}

interface OrderItem {
  id: string;
  sku: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  configuration?: LineConfiguration | null;
  gang_sheet?: GangSheetProduction | null;
}

interface ShippingAddress {
  full_name?: string; address_line1?: string; address_line2?: string;
  city?: string; state?: string; zip_code?: string; postal_code?: string; country?: string;
}

interface SupplierSummary {
  supplier: string; items: number; lines: number;
  status: "not_sent" | "sending" | "test" | "placed" | "shipped" | "failed";
  test: boolean; po_number: string | null; supplier_order_numbers: string | null;
  tracking_number: string | null; carrier: string | null; error: string | null; sent_at: string | null;
}

interface OrderAttribution {
  label: string; utm_source?: string; utm_term?: string; utm_content?: string; campaign?: string | null;
  referrer?: string | null; landing_page?: string | null; visits?: number | null; device?: string | null;
  first_seen?: string | null; paid_click?: string | null;
}

interface OrderEvent {
  id: string; type: string; label: string; message: string; actor_type: string;
  actor_name: string | null; meta: Record<string, unknown>; occurred_at: string;
}

interface AdminOrder {
  id: string;
  order_number: string;
  supplier?: SupplierSummary | null;
  progress?: Progress | null;
  carriers?: string[];
  company_name: string | null;
  company_id: string | null;
  status: string;
  payment_status: string;
  po_number: string | null;
  order_notes: string | null;
  tracking_number: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
  carrier?: string | null;
  shipping_rate_id?: string | null;
  courier: string | null;
  courier_service: string | null;
  shipped_at: string | null;
  subtotal: string;
  shipping_cost: string;
  tax_amount?: string;
  tax_label?: string | null;
  discounts?: OrderDiscountLine[];
  total: string;
  items: OrderItem[];
  created_at: string;
  shipping_address?: ShippingAddress | null;
  shipping_method?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  is_guest_order?: boolean;
  pricing_tier?: string | null;
  payment_method?: string | null;
  ach_bank_name?: string | null;
  ach_account_holder?: string | null;
  ach_account_last4?: string | null;
  ach_account_type?: string | null;
  ach_verified?: boolean | null;
  payment_terms?: string | null;
  invoice_sent_at?: string | null;
  amount_paid?: string | null;
  balance_due?: string | null;
  events?: OrderEvent[];
  attribution?: OrderAttribution | null;
  conversion?: Conversion | null;
  calculated_weight_lbs?: number;
  items_edited?: boolean;
  convenience_fee?: string | null;
  amount_refunded?: string | number | null;
  refundable_remaining?: string | number | null;
  refunds?: RefundRow[];
  disputes?: DisputeRow[];
}

interface Rate { rate_id: string; carrier: string; service: string; cost: number; currency: string; days: number | null }
interface LabelResult { success?: boolean; tracking_number?: string; error?: string; carrier?: string; service?: string }
interface PickupPlace { name?: string; street1?: string; city?: string; state?: string; zip?: string; hours?: string }
interface CustomerStats { total_orders: number; total_spent: number; last_order_date: string | null }
interface FoundVariant { variant_id: string; sku: string; product_name: string; color: string | null; size: string | null; price: number }

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing", ready_for_pickup: "Ready for pickup",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
const STATUS_TONE: Record<string, string> = {
  pending: "amber", confirmed: "blue", processing: "blue", ready_for_pickup: "blue", shipped: "green", delivered: "green",
};
/** A print job's state as it reads beside its line. */
const JOB_WORDS: Record<string, [string, string]> = {
  submitted: ["Submitted", "amber"], in_review: ["Awaiting approval", "amber"], revision_requested: ["Revision asked", "red"],
  approved: ["Approved", "green"], production: ["Printing", "blue"], completed: ["Printed", "green"], rejected: ["Rejected", "red"],
};
const PAY_METHOD: Record<string, string> = { ach: "ACH / bank transfer", cod: "Cash on delivery", net_30: "Net 30", card: "Card" };
const SUPPLIER_WORDS: Record<string, [string, string]> = {
  not_sent: ["Not sent", "amber"], sending: ["Sending", "blue"], test: ["Test only", "amber"],
  placed: ["Ordered", "blue"], shipped: ["Shipped", "green"], failed: ["Failed", "red"],
};
const BAD_EVENTS = new Set(["cancelled", "payment_failed", "refund_issued", "return_rejected", "supplier_po_failed", "dispute_opened", "dispute_lost", "meta_capi_failed"]);

const money = (n: unknown) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : "");
const moment = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const errorText = (e: unknown, fallback: string) => {
  const err = e as { detail?: unknown; message?: string };
  return (typeof err?.detail === "string" && err.detail) || err?.message || fallback;
};

/** The statuses the order may be moved to by hand, as the old order page allowed. */
function statusChoices(current: string, pickup: boolean): string[] {
  if (current === "delivered") return ["refunded"];
  if (current === "cancelled") return ["refunded"];
  return ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered"]
    .filter((s) => s !== current && !(s === "shipped" && pickup) && !(s === "ready_for_pickup" && !pickup));
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const branding = useBranding();
  const mayRefund = canWrite(user?.role, "billing", user?.scopes, user?.read_only);

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [menu, setMenu] = useState<"print" | "more" | null>(null);
  const [pickupPlace, setPickupPlace] = useState<PickupPlace | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [refundSignal, setRefundSignal] = useState(0);

  // Fulfil
  const [weight, setWeight] = useState("");
  const [tracking, setTracking] = useState("");
  const [notify, setNotify] = useState(true);
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [rateId, setRateId] = useState("");
  const [ratesError, setRatesError] = useState("");

  // Notes
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [orderNoteOpen, setOrderNoteOpen] = useState(false);
  const [orderNoteText, setOrderNoteText] = useState("");

  // Items
  const [editing, setEditing] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [found, setFound] = useState<FoundVariant[]>([]);
  const [variant, setVariant] = useState<FoundVariant | null>(null);
  const [addQty, setAddQty] = useState(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const o = await adminService.getOrder(id) as AdminOrder;
    setOrder(o);
    return o;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    adminService.getOrder(id)
      .then((d) => {
        if (cancelled) return;
        const o = d as AdminOrder;
        setOrder(o);
        setWeight(String(o.calculated_weight_lbs ?? 1));
        setTracking(o.tracking_number ?? "");
        setOrderNoteText(o.order_notes ?? "");
        if (o.company_id) {
          apiClient.get<CustomerStats>(`/api/v1/admin/companies/${o.company_id}/stats`)
            .then((s) => { if (!cancelled && s) setStats(s); }).catch(() => {});
        }
      })
      .catch((e) => { if (!cancelled) setLoadError(errorText(e, "The order could not be loaded.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Where a Will Call order is collected: the shop's pickup location, or its
  // ship-from address when it has not set one (the rule the checkout follows).
  useEffect(() => {
    apiClient.get<Record<string, string>>("/api/v1/admin/settings")
      .then((s) => {
        const read = (raw?: string) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
        const own = read(s?.pickup_location);
        const from = read(s?.ship_from);
        const place = own?.street1 ? own : from;
        setPickupPlace(place ? { ...place, hours: own?.hours } : null);
      })
      .catch(() => setPickupPlace(null));
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);

  /** Run one action: say it is running, do it, read the order again, say how it went. */
  async function run(name: string, done: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusy(name);
    setMenu(null);
    try {
      await action();
      await reload();
      setFlash({ text: done });
      return true;
    } catch (e) {
      setFlash({ text: errorText(e, "That did not work. Nothing was changed."), bad: true });
      return false;
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="pc-page"><div className="pc-card pc-empty">Loading the order…</div></div>;
  }
  if (loadError || !order) {
    return (
      <div className="pc-page">
        <Link href="/admin/orders" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Orders</Link>
        <div className="pc-card pc-empty">{loadError || "This order could not be found."}</div>
      </div>
    );
  }

  const o = order;
  const progress = o.progress ?? null;
  const pickup = progress?.pickup ?? !!o.shipping_method?.toLowerCase().includes("will_call");
  const accepted = ["confirmed", "processing"].includes(o.status);
  const open = ["pending", "confirmed", "processing"].includes(o.status);
  const paid = o.payment_status === "paid";
  const carriers = o.carriers ?? [];
  const customer = o.company_name || o.customer_name || o.guest_name || o.guest_email || "Guest";
  const addr = o.shipping_address ?? null;
  const zip = addr?.zip_code ?? addr?.postal_code ?? "";
  const mapQuery = [addr?.address_line1, addr?.city, addr?.state].filter(Boolean).join(", ");
  const left = o.refundable_remaining != null ? Number(o.refundable_remaining) : null;
  const canRefund = mayRefund && paid && left != null && left > 0;
  const events = (o.events ?? []).slice().sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const notes = events.filter((e) => e.type === "note");
  const hasLiveRate = !!o.shipping_rate_id;
  const hasLabel = !!(o.tracking_number && o.label_url);
  const waitingJob = o.items.find((i) => i.gang_sheet && ["in_review", "submitted"].includes(i.gang_sheet.status))?.gang_sheet ?? null;
  // A print job the shop has not approved, or one sent back to the customer.
  // Sending the order out before that is almost always a slip, so it is asked about first.
  const artOpen = ["in_review", "revision"].includes(progress?.artwork.key ?? "");
  const artHref = waitingJob ? `/admin/production/${waitingJob.id}` : "/admin/production";
  // A job approved or on the press: printing it is the next step, on Production.
  const printingJob = o.items.find((i) => i.gang_sheet && ["approved", "production"].includes(i.gang_sheet.status))?.gang_sheet ?? null;
  const printHref = printingJob ? `/admin/production/${printingJob.id}` : "/admin/production";
  const artWarning = artOpen ? "The artwork on this order is not approved yet. " : "";

  // ── Actions ────────────────────────────────────────────────────────────────

  const confirmOrder = () => run("confirm", "Order confirmed. The customer has been told.",
    () => adminService.updateOrder(o.id, { status: "confirmed" }));

  async function changeStatus(status: string) {
    const out = ["shipped", "ready_for_pickup", "delivered"].includes(status);
    const yes = await ask(
      `${out ? artWarning : ""}Change this order to ${STATUS_LABEL[status] ?? status}? The customer is emailed about the change.`,
      { title: "Change the status", ok: `Mark ${(STATUS_LABEL[status] ?? status).toLowerCase()}`, danger: out && artOpen },
    );
    if (!yes) return;
    await run("status", `The order is now ${(STATUS_LABEL[status] ?? status).toLowerCase()}.`, () => adminService.updateOrder(o.id, { status }));
  }

  async function markShipped() {
    const yes = await ask(
      artWarning + (tracking.trim()
        ? `Mark this order shipped with tracking number ${tracking.trim()}?${notify ? " The customer is emailed." : " The customer is not emailed."}`
        : `Mark this order shipped without a tracking number?${notify ? " The customer is emailed that it has shipped." : " The customer is not emailed."}`),
      { title: "Mark shipped", ok: artOpen ? "Mark shipped anyway" : "Mark shipped", danger: artOpen },
    );
    if (!yes) return;
    await run("ship", "Marked as shipped.", () => apiClient.patch(`/api/v1/admin/orders/${o.id}/status`, {
      status: "shipped", tracking_number: tracking.trim() || undefined, notify,
    }));
  }

  async function markReady() {
    if (artOpen && !await ask(
      `${artWarning}Mark it ready for pickup anyway?${notify ? " The customer is emailed to come and collect it." : ""}`,
      { title: "Artwork not approved", ok: "Mark ready anyway", danger: true },
    )) return;
    await run("ready", `Marked ready for pickup.${notify ? " The customer has been emailed." : ""}`,
      () => apiClient.patch(`/api/v1/admin/orders/${o.id}/status`, { status: "ready_for_pickup", notify }));
  }
  const markDelivered = (word: string) => run("deliver", `Marked as ${word}.`,
    () => apiClient.patch(`/api/v1/admin/orders/${o.id}/status`, { status: "delivered", notify }));
  const markPacked = () => run("pack", "Marked as packed.", () => apiClient.post(`/api/v1/admin/orders/${o.id}/packed`, {}));

  async function markPaid() {
    if (!await ask(`Mark this order as paid? ${money(o.balance_due ?? o.total)} is recorded as received.`, { title: "Mark as paid", ok: "Mark as paid" })) return;
    await run("paid", "Marked as paid.", () => apiClient.post(`/api/v1/admin/orders/${o.id}/mark-paid`, {}));
  }

  const sendInvoice = () => run("invoice", "The invoice has been emailed to the customer.",
    () => apiClient.post(`/api/v1/admin/orders/${o.id}/send-invoice`, {}));
  const verifyAch = () => run("ach", "The bank payment is verified and the order is paid.",
    () => apiClient.post(`/api/v1/admin/orders/${o.id}/verify-ach`, {}));

  async function cancelOrder() {
    const reason = (await askText("The customer is emailed that the order was cancelled. Say why, for your own records.", "", {
      title: "Cancel this order", ok: "Cancel the order", cancel: "Keep it", danger: true, placeholder: "Reason",
    }))?.trim();
    if (!reason) return;
    await run("cancel", "The order was cancelled.", () => adminService.cancelOrder(o.id, reason));
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    setBusy("note");
    try {
      const r = await apiClient.post<{ events: OrderEvent[] }>(`/api/v1/admin/orders/${o.id}/notes`, { text });
      setOrder((prev) => (prev ? { ...prev, events: r.events } : prev));
      setNoteText(""); setNoteOpen(false);
    } catch (e) {
      setFlash({ text: errorText(e, "The note could not be saved."), bad: true });
    }
    setBusy("");
  }

  async function saveOrderNote() {
    const ok = await run("ordernote", "The note on the order was saved.", () => apiClient.patch(`/api/v1/admin/orders/${o.id}`, { notes: orderNoteText }));
    if (ok) setOrderNoteOpen(false);
  }

  async function getRates() {
    setBusy("rates"); setRatesError(""); setRates(null); setRateId("");
    try {
      const r = await apiClient.post<{ rates: Rate[]; error?: string }>(`/api/v1/admin/orders/${o.id}/fetch-rates`, {
        weight_lbs: Number(weight) > 0 ? Number(weight) : undefined,
      });
      const list = (r.rates ?? []).slice().sort((a, b) => a.cost - b.cost);
      setRates(list);
      if (list.length) setRateId(list[0]!.rate_id);
      else setRatesError(r.error || "No carrier offered a rate for this address and weight.");
    } catch (e) {
      setRatesError(errorText(e, "The rates could not be read."));
    }
    setBusy("");
  }

  async function buyLabel() {
    // The buyer picked a carrier's own rate at checkout: that is the rate bought.
    if (hasLiveRate) {
      const yes = await ask(
        `${artWarning}Buy the ${o.carrier ?? "carrier"} label the customer chose at checkout (${money(o.shipping_cost)} charged to them)? The order is marked shipped${notify ? " and the customer is emailed" : ""}.`,
        { title: "Buy the label", ok: artOpen ? "Buy label anyway" : "Buy label", danger: artOpen },
      );
      if (!yes) return;
      setBusy("label");
      try {
        const r = await apiClient.post<LabelResult>(`/api/v1/admin/orders/${o.id}/labels`, {
          carrier: (o.carrier ?? "usps").toLowerCase(), weight_lbs: Number(weight) > 0 ? Number(weight) : undefined, notify,
        });
        await afterLabel(r);
      } catch (e) { setFlash({ text: errorText(e, "The label was not bought."), bad: true }); }
      setBusy("");
      return;
    }
    if (!rates) { await getRates(); return; }
    const rate = rates.find((r) => r.rate_id === rateId);
    if (!rate) return;
    if (artOpen && !await ask(
      `${artWarning}Buy the ${rate.carrier} ${rate.service} label for ${money(rate.cost)} anyway? The order is marked shipped${notify ? " and the customer is emailed" : ""}.`,
      { title: "Artwork not approved", ok: "Buy label anyway", danger: true },
    )) return;
    setBusy("label");
    try {
      const r = await apiClient.post<LabelResult>(`/api/v1/admin/orders/${o.id}/generate-label-manual`, {
        rate_id: rate.rate_id, carrier: rate.carrier, service: rate.service, weight_lbs: Number(weight) > 0 ? Number(weight) : 1, notify,
      });
      await afterLabel(r);
    } catch (e) { setFlash({ text: errorText(e, "The label was not bought."), bad: true }); }
    setBusy("");
  }

  async function afterLabel(r: LabelResult) {
    if (r.success) {
      const fresh = await reload();
      setTracking(fresh.tracking_number ?? "");
      setRates(null);
      setFlash({ text: `Label bought${r.carrier ? `: ${r.carrier.toUpperCase()} ${r.service ?? ""}` : ""}. The order is marked shipped.` });
    } else {
      setFlash({ text: r.error || "The label was not bought.", bad: true });
    }
  }

  function openLabel() {
    const url = o.label_url ?? "";
    if (!url) return;
    // A label kept on the order is served by the admin API, which needs the
    // admin's sign-in: a plain link cannot carry it.
    if (!url.startsWith("/api/")) { window.open(url, "_blank", "noopener"); return; }
    const win = window.open("", "_blank");
    apiClient.blob(url)
      .then((b) => {
        const obj = URL.createObjectURL(b);
        if (win) win.location.href = obj; else window.location.href = obj;
        setTimeout(() => URL.revokeObjectURL(obj), 60_000);
      })
      .catch((e) => { win?.close(); tell(errorText(e, "The label could not be opened.")); });
  }

  function searchItems(value: string) {
    setItemSearch(value);
    setVariant(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) { setFound([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<{ name: string; variants: { id: string; sku: string; color: string | null; size: string | null; retail_price: number }[] }[] | { items?: unknown[] }>(
          `/api/v1/admin/products?q=${encodeURIComponent(value)}&page_size=20`,
        );
        const products = (Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? []) as { name: string; variants?: { id: string; sku: string; color: string | null; size: string | null; retail_price: number }[] }[];
        const list: FoundVariant[] = [];
        for (const p of products) for (const v of p.variants ?? []) {
          list.push({ variant_id: v.id, sku: v.sku, product_name: p.name, color: v.color, size: v.size, price: Number(v.retail_price || 0) });
        }
        setFound(list.slice(0, 30));
      } catch { setFound([]); }
    }, 350);
  }

  async function addItem() {
    if (!variant || addQty < 1) return;
    const ok = await run("additem", `Added ${addQty} x ${variant.product_name}.`, () => apiClient.post(`/api/v1/admin/orders/${o.id}/items`, {
      variant_id: variant.variant_id, quantity: addQty, unit_price: variant.price,
    }));
    if (ok) { setVariant(null); setItemSearch(""); setFound([]); setAddQty(1); }
  }

  async function removeItem(item: OrderItem) {
    if (!await ask(`Remove ${item.product_name} from this order? The order's total goes down by ${money(item.line_total)}.`, { title: "Remove this line", ok: "Remove", danger: true })) return;
    await run("removeitem", "The line was removed.", () => apiClient.delete(`/api/v1/admin/orders/${o.id}/items/${item.id}`));
  }

  function printPick() { setMenu(null); printHtml(`Pick list ${o.order_number}`, pickListHtml([toPrintOrder(o)])); }
  function printSlip() {
    setMenu(null);
    const shop = branding?.store_name && branding.store_name !== "Store" ? branding.store_name : "";
    printHtml(`Packing slip ${o.order_number}`, packingSlipHtml(toPrintOrder(o), shop));
  }

  // ── The main button: the order's next step ─────────────────────────────────
  const next = progress?.next.key ?? "none";
  const main: { label: string; act?: () => void; href?: string } | null =
    next === "confirm" ? { label: "Confirm order", act: confirmOrder }
    : next === "artwork" ? { label: "Review artwork", href: artHref }
    : next === "print" ? { label: "Open the print job", href: printHref }
    : next === "ready" ? { label: "Mark ready for pickup", act: markReady }
    : next === "ship" ? { label: "Mark shipped", act: markShipped }
    : next === "collected" ? { label: "Mark collected", act: () => markDelivered("collected") }
    : next === "deliver" ? { label: "Mark delivered", act: () => markDelivered("delivered") }
    : next === "collect" ? { label: "Mark as paid", act: markPaid }
    : null;

  const choices = statusChoices(o.status, pickup);
  const pill = (p: Pill) => <span className="pc-pill" data-tone={p.tone || undefined} style={{ textTransform: "none" }}>{p.label}</span>;

  return (
    <div className="pc-page" style={{ maxWidth: "1240px" }} data-order-page={o.order_number}>
      <Link href="/admin/orders" className="pc-back no-print"><ArrowLeft size={16} strokeWidth={2.2} /> Orders</Link>

      <div className="pc-head" style={{ alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <div className="pc-title-row">
            <h1 className="pc-h1" style={{ margin: 0 }}>Order {o.order_number}</h1>
            {progress && pill(progress.payment)}
            <span className="pc-pill" data-tone={STATUS_TONE[o.status]} style={{ textTransform: "none" }}>{pickup && o.status === "delivered" ? "Collected" : STATUS_LABEL[o.status] ?? o.status}</span>
            {o.items_edited && <span className="pc-pill" style={{ textTransform: "none" }}>Items changed</span>}
          </div>
          <p className="pc-lede" style={{ marginTop: "8px" }}>{customer}, placed {day(o.created_at)}{o.po_number ? ` · PO ${o.po_number}` : ""}</p>
        </div>

        <div className="pc-row-actions no-print">
          <div className="pc-pop-wrap">
            <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={menu === "print"} onClick={() => setMenu(menu === "print" ? null : "print")}>
              Print <ChevronDown size={16} strokeWidth={2.2} />
            </button>
            {menu === "print" && (
              <div className="pc-pop" data-side="right" role="menu">
                <button type="button" role="menuitem" className="pc-pop-item" onClick={printPick}>Pick list</button>
                <button type="button" role="menuitem" className="pc-pop-item" onClick={printSlip}>Packing slip</button>
                <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); window.setTimeout(() => window.print(), 50); }}>This page</button>
                {o.label_url && <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); openLabel(); }}>Shipping label</button>}
              </div>
            )}
          </div>

          {canRefund && (
            <button type="button" className="pc-btn" onClick={() => setRefundSignal((n) => n + 1)}>Refund</button>
          )}

          <div className="pc-pop-wrap">
            <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")}>
              More <ChevronDown size={16} strokeWidth={2.2} />
            </button>
            {menu === "more" && (
              <div className="pc-pop" data-side="right" role="menu" style={{ minWidth: "230px" }}>
                {!paid && o.status !== "cancelled" && <button type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); markPaid(); }}>Mark as paid</button>}
                {o.status !== "cancelled" && (
                  <button type="button" role="menuitem" className="pc-pop-item" onClick={sendInvoice}>{o.invoice_sent_at ? "Send the invoice again" : "Email the invoice"}</button>
                )}
                {accepted && !pickup && !progress?.packed && <button type="button" role="menuitem" className="pc-pop-item" onClick={markPacked}>Mark packed</button>}
                {choices.length > 0 && <div className="pc-pop-sep" />}
                {choices.map((s) => (
                  <button key={s} type="button" role="menuitem" className="pc-pop-item" onClick={() => { setMenu(null); changeStatus(s); }}>
                    Move to {(STATUS_LABEL[s] ?? s).toLowerCase()}
                  </button>
                ))}
                {open && (
                  <>
                    <div className="pc-pop-sep" />
                    <button type="button" role="menuitem" className="pc-pop-item" data-danger="" onClick={() => { setMenu(null); cancelOrder(); }}>Cancel the order…</button>
                  </>
                )}
              </div>
            )}
          </div>

          {main && (main.href
            ? <Link href={main.href} className="pc-btn" data-kind="primary" data-main>{main.label}</Link>
            : <button type="button" className="pc-btn" data-kind="primary" data-main disabled={!!busy} onClick={main.act}>{busy && busy !== "note" ? "Working…" : main.label}</button>)}
        </div>
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      {/* ── Where it stands ─────────────────────────────────────────────── */}
      {progress && (
        <div className="pc-card pc-steps" data-steps>
          {progress.steps.map((s) => (
            <div key={s.key} className="pc-step-col" data-state={s.state} data-step={s.key}>
              <span className="pc-step-ring" aria-hidden>
                {s.state === "done" && <Check size={15} strokeWidth={3} />}
                {s.state === "stopped" && <X size={14} strokeWidth={3} />}
              </span>
              {s.label}
            </div>
          ))}
        </div>
      )}

      <div className="pc-cols">
        <div className="pc-stack">
          {/* ── Items and artwork ───────────────────────────────────────── */}
          <section className="pc-card" aria-labelledby="items-title">
            <div className="pc-card-head">
              <h2 className="pc-h2" id="items-title">Items and artwork</h2>
              {open && (
                <button type="button" className="pc-btn no-print" onClick={() => { setEditing((v) => !v); setVariant(null); setItemSearch(""); setFound([]); }}>
                  {editing ? "Done editing" : "Edit items"}
                </button>
              )}
            </div>

            {editing && (
              <div className="pc-pad no-print" style={{ borderBottom: "1px solid var(--pc-line)", background: "#F8FAFC" }} data-add-item>
                <label className="pc-label" htmlFor="add-item">Add a product</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px", position: "relative" }}>
                    <input id="add-item" className="pc-input" value={itemSearch} onChange={(e) => searchItems(e.target.value)} placeholder="Search by product name or SKU" autoComplete="off" />
                    {found.length > 0 && !variant && (
                      <div className="pc-pop" style={{ right: 0, maxHeight: "240px", overflowY: "auto" }}>
                        {found.map((v) => (
                          <button key={v.variant_id} type="button" className="pc-pop-item"
                            onClick={() => { setVariant(v); setItemSearch(`${v.product_name}${[v.color, v.size].filter(Boolean).length ? ` (${[v.color, v.size].filter(Boolean).join(" / ")})` : ""}`); setFound([]); }}>
                            <span>{v.product_name} <span style={{ color: "var(--pc-muted)" }}>{[v.color, v.size].filter(Boolean).join(" / ")} · {v.sku}</span></span>
                            <span>{money(v.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="number" min={1} className="pc-input" style={{ width: "92px" }} aria-label="Quantity" value={addQty} onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))} />
                  <button type="button" className="pc-btn" data-kind="primary" disabled={!variant || !!busy} onClick={addItem}>{busy === "additem" ? "Adding…" : "Add"}</button>
                </div>
                <p className="pc-sub-line" style={{ marginTop: "8px" }}>Adding or removing a line changes the order&apos;s total. Send the invoice again afterwards if the customer still has to pay.</p>
                {o.items.some((i) => i.gang_sheet) && (
                  <p className="pc-sub-line" style={{ marginTop: "4px" }}>A line with a print job can&apos;t be removed here. Reject the job in Production, or cancel the order.</p>
                )}
              </div>
            )}

            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "560px" }}>
                <thead>
                  <tr><th>Product</th><th>Options</th><th>Artwork</th><th className="pc-num">Qty</th><th className="pc-num">Total</th>{editing && <th aria-label="Remove" />}</tr>
                </thead>
                <tbody>
                  {o.items.length === 0 && <tr><td colSpan={editing ? 6 : 5} className="pc-empty">This order has no lines.</td></tr>}
                  {o.items.map((item) => {
                    const sheet = item.gang_sheet ?? null;
                    const file = item.configuration?.artwork ?? null;
                    const options = [item.color, item.size].filter(Boolean).join(" / ")
                      || (item.configuration?.breakdown ?? []).map((b) => `${b.option}: ${b.value}`).join(" · ")
                      || (sheet ? `${sheet.width_in} x ${sheet.height_in} in` : "");
                    const job = sheet ? JOB_WORDS[sheet.status] ?? [sheet.status.replace(/_/g, " "), ""] : null;
                    return [
                      <tr key={item.id} data-line={item.sku}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                          <div className="pc-sub-line" style={{ fontSize: "12.5px" }}>{item.sku} · {money(item.unit_price)} each</div>
                        </td>
                        <td style={{ color: "var(--pc-ink-2)" }}>{options || <span style={{ color: "var(--pc-faint)" }}>None</span>}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {sheet?.preview_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sheet.preview_url} alt="" className="pc-thumb" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            )}
                            {job ? <span className="pc-pill" data-tone={job[1] || undefined} style={{ textTransform: "none" }}>{job[0]}</span>
                              : file ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="pc-pill" data-tone="blue" style={{ textTransform: "none", textDecoration: "none" }} title={file.file_name}>File attached</a>
                              : <span className="pc-pill" style={{ textTransform: "none" }}>No file needed</span>}
                          </div>
                        </td>
                        <td className="pc-num">{item.quantity}</td>
                        <td className="pc-num" style={{ fontWeight: 600 }}>{money(item.line_total)}</td>
                        {editing && (
                          <td className="pc-num">
                            {/* A line with a print job stays: taking the line off would leave its job in Production with no line to belong to. */}
                            {sheet ? <span role="img" aria-label="Has a print job" title="Has a print job, so it can't be removed here" data-line-kept style={{ display: "inline-flex", padding: "6px", color: "var(--pc-faint)" }}><Lock size={15} strokeWidth={2.2} /></span>
                              : <button type="button" className="pc-x" style={{ color: "var(--pc-red)" }} aria-label={`Remove ${item.product_name}`} disabled={!!busy} onClick={() => removeItem(item)}><X size={17} strokeWidth={2.2} /></button>}
                          </td>
                        )}
                      </tr>,
                      sheet ? (
                        <tr key={`${item.id}-files`}>
                          <td colSpan={editing ? 6 : 5} style={{ paddingTop: 0, background: "#FBFCFE" }}><GangSheetLineFiles sheet={sheet} /></td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* The print jobs on this order, with their layouts, files and review buttons.
              Folded away unless reviewing artwork is the next thing to do. */}
          {o.items.some((i) => i.gang_sheet) && (
            <details className="pc-card pc-details" open={next === "artwork"} data-jobs>
              <summary>
                <h2 className="pc-h2">Print jobs and artwork files</h2>
                <span className="pc-link pc-details-more" aria-hidden />
              </summary>
              <div style={{ padding: "0 20px 4px" }}><OrderGangSheets orderId={o.id} /></div>
            </details>
          )}

          {/* ── Fulfil ──────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="fulfil-title" data-fulfil>
            <h2 className="pc-h2" id="fulfil-title">Fulfil</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 16px" }}>
              Method: {methodWords(o.shipping_method)}
              {!pickup && (hasLiveRate && o.carrier ? `, ${o.carrier} ${o.courier_service ?? ""}`.trimEnd() : ", flat rate")}
              {!pickup && ` · ${money(o.shipping_cost)} charged`}
            </p>

            {artOpen && ["pending", "confirmed", "processing"].includes(o.status) && (
              <div className="pc-note" data-tone="red" style={{ marginBottom: "16px" }} data-art-open>
                {progress?.artwork.key === "revision"
                  ? "The customer was asked to send the artwork again, and it has not come back."
                  : "A print job on this order is not approved yet."}
                {" "}<Link href={artHref}>Review the artwork</Link> before this order goes out.
              </div>
            )}

            {["cancelled", "refunded"].includes(o.status) ? (
              <div className="pc-note" data-tone="red">This order was {o.status}. There is nothing to send.</div>
            ) : pickup ? (
              <div style={{ display: "grid", gap: "16px" }}>
                <div>
                  <div className="pc-small-head">Collected from</div>
                  {pickupPlace?.street1 ? (
                    <div style={{ fontSize: "14.5px", lineHeight: 1.55 }}>
                      {pickupPlace.name && <div style={{ fontWeight: 600 }}>{pickupPlace.name}</div>}
                      <div>{pickupPlace.street1}</div>
                      <div>{[pickupPlace.city, [pickupPlace.state, pickupPlace.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                      {pickupPlace.hours && <div className="pc-sub-line">{pickupPlace.hours}</div>}
                    </div>
                  ) : (
                    <div className="pc-note">No pickup location is set, so the customer is not told where to come. <Link href="/admin/standard-shipping">Set the pickup location</Link></div>
                  )}
                </div>
                <div className="pc-note" data-tone="blue">The customer collects this order. No shipping label is needed.</div>
                {o.status !== "delivered" && (
                  <label className="pc-check-row">
                    <input type="checkbox" className="pc-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    Email the customer when this changes
                  </label>
                )}
                <div className="pc-row-actions no-print">
                  {["pending", "confirmed", "processing"].includes(o.status) && (
                    <button type="button" className="pc-btn" data-kind={accepted ? "primary" : undefined} disabled={!!busy} onClick={markReady}>Mark ready for pickup</button>
                  )}
                  {o.status === "ready_for_pickup" && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => markDelivered("collected")}>Mark collected</button>}
                  {o.status === "delivered" && <span className="pc-pill" data-tone="green" style={{ textTransform: "none" }}>Collected</span>}
                </div>
              </div>
            ) : ["shipped", "delivered"].includes(o.status) ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div className="pc-note" data-tone="green">
                  {o.status === "delivered" ? "Delivered" : "Shipped"}
                  {o.courier ? ` with ${String(o.courier).toUpperCase()}${o.courier_service ? ` ${o.courier_service}` : ""}` : ""}
                  {o.shipped_at ? ` on ${day(o.shipped_at)}` : ""}
                  {o.tracking_number ? `. Tracking ${o.tracking_number}` : ". No tracking number was added"}
                </div>
                <div className="pc-row-actions no-print">
                  {o.label_url && <button type="button" className="pc-btn" onClick={openLabel}>Open the label</button>}
                  {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noopener noreferrer" className="pc-btn">Track the parcel</a>}
                  {o.status === "shipped" && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => markDelivered("delivered")}>Mark delivered</button>}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {carriers.length === 0 && (
                  <div className="pc-note" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }} data-no-carrier>
                    <span style={{ flex: "1 1 260px" }}>No carrier is connected, so live rates can&apos;t load. Connect UPS, FedEx or USPS to buy labels here.</span>
                    <Link href="/admin/standard-shipping" className="pc-btn" style={{ textDecoration: "none", color: "var(--pc-ink)", fontWeight: 600 }}>Connect a carrier</Link>
                  </div>
                )}
                <div className="pc-grid-2">
                  <div>
                    <label className="pc-label" htmlFor="weight">Package weight (lb)</label>
                    <input id="weight" type="number" min="0.1" step="0.1" className="pc-input" value={weight} placeholder="0.0"
                      onChange={(e) => { setWeight(e.target.value); setRates(null); }} />
                  </div>
                  <div>
                    <label className="pc-label" htmlFor="tracking">Tracking number</label>
                    <input id="tracking" className="pc-input" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Added automatically when you buy a label" />
                  </div>
                </div>
                <label className="pc-check-row">
                  <input type="checkbox" className="pc-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  Email the customer when this ships
                </label>

                {rates && rates.length > 0 && (
                  <div data-rates>
                    <div className="pc-small-head">Choose a rate</div>
                    <div className="pc-rates">
                      {rates.map((r) => (
                        <button key={r.rate_id} type="button" className="pc-rate" data-on={rateId === r.rate_id ? "" : undefined} aria-pressed={rateId === r.rate_id} onClick={() => setRateId(r.rate_id)}>
                          <span>{r.carrier} {r.service}{r.days != null ? <span style={{ color: "var(--pc-muted)" }}> · {r.days} business {r.days === 1 ? "day" : "days"}</span> : null}</span>
                          <b>{money(r.cost)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {ratesError && <div className="pc-note" data-tone="red">{ratesError}</div>}

                <div className="pc-row-actions no-print">
                  <button type="button" className="pc-btn" data-kind={carriers.length ? "primary" : undefined} disabled={carriers.length === 0 || !!busy} onClick={buyLabel}
                    title={carriers.length === 0 ? "Connect a carrier first" : undefined} data-buy-label>
                    {busy === "rates" ? "Getting rates…" : busy === "label" ? "Buying…"
                      : hasLiveRate ? "Buy label"
                      : rates && rates.length > 0 ? `Buy label · ${money(rates.find((r) => r.rate_id === rateId)?.cost ?? 0)}`
                      : "Buy label"}
                  </button>
                  <button type="button" className="pc-btn" disabled={!!busy} onClick={markShipped}>Mark shipped without a label</button>
                  {accepted && !progress?.packed && <button type="button" className="pc-link" disabled={!!busy} onClick={markPacked}>Mark packed</button>}
                  {progress?.packed && <span className="pc-pill" data-tone="blue" style={{ textTransform: "none" }}>Packed</span>}
                </div>
              </div>
            )}
          </section>

          {/* Refunds and chargebacks. Draws itself only when there is something to show or to refund. */}
          <OrderRefunds
            orderId={o.id}
            total={Number(o.total) || 0}
            amountRefunded={Number(o.amount_refunded ?? 0) || 0}
            remaining={left}
            refundable={left != null && paid}
            refunds={o.refunds ?? []}
            disputes={o.disputes ?? []}
            openSignal={refundSignal}
            onChanged={async () => { await reload(); }}
          />

          {/* ── Parcels: where each is, set by hand when the courier says nothing ── */}
          <OrderShipments orderId={o.id} onChanged={() => { void reload(); }} />

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="notes-title" data-notes>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <h2 className="pc-h2" id="notes-title">Notes</h2>
              {!noteOpen && <button type="button" className="pc-btn no-print" onClick={() => setNoteOpen(true)}>Add note</button>}
            </div>

            {noteOpen && (
              <div style={{ marginTop: "14px" }} className="no-print">
                <textarea className="pc-input" autoFocus value={noteText} maxLength={2000} onChange={(e) => setNoteText(e.target.value)} placeholder="Something your team should know about this order" aria-label="Note" />
                <div className="pc-row-actions" style={{ marginTop: "10px" }}>
                  <button type="button" className="pc-btn" data-kind="primary" disabled={!noteText.trim() || busy === "note"} onClick={addNote}>{busy === "note" ? "Saving…" : "Save note"}</button>
                  <button type="button" className="pc-btn" onClick={() => { setNoteOpen(false); setNoteText(""); }}>Cancel</button>
                </div>
              </div>
            )}

            {notes.length === 0 && !noteOpen && <p className="pc-sub-line" style={{ margin: "12px 0 0", fontSize: "14.5px" }}>No notes yet. Notes are private to your team.</p>}
            {notes.length > 0 && (
              <div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
                {notes.map((n) => (
                  <div key={n.id} data-note>
                    <div style={{ fontSize: "14.5px", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.message}</div>
                    <div className="pc-event-when">{n.actor_name || (n.actor_type === "system" ? "Added automatically" : "Staff")} · {moment(n.occurred_at)}</div>
                  </div>
                ))}
                <p className="pc-sub-line" style={{ margin: 0 }}>Notes are private to your team.</p>
              </div>
            )}

            {(o.order_notes || orderNoteOpen) && (
              <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--pc-line)" }} data-order-note>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                  <div className="pc-small-head">Written on the order</div>
                  {!orderNoteOpen && <button type="button" className="pc-link no-print" onClick={() => { setOrderNoteText(o.order_notes ?? ""); setOrderNoteOpen(true); }}>Edit</button>}
                </div>
                {orderNoteOpen ? (
                  <div className="no-print">
                    <textarea className="pc-input" value={orderNoteText} onChange={(e) => setOrderNoteText(e.target.value)} aria-label="Note written on the order" />
                    <div className="pc-row-actions" style={{ marginTop: "10px" }}>
                      <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={saveOrderNote}>Save</button>
                      <button type="button" className="pc-btn" onClick={() => setOrderNoteOpen(false)}>Cancel</button>
                    </div>
                  </div>
                ) : <div style={{ fontSize: "14.5px", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{o.order_notes}</div>}
              </div>
            )}
          </section>
        </div>

        <div className="pc-stack">
          {/* ── Customer ────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="customer-title" data-customer>
            <h2 className="pc-h2" id="customer-title">Customer</h2>
            <div style={{ marginTop: "12px", fontSize: "15.5px", fontWeight: 600 }}>{customer}</div>
            <div className="pc-sub-line" style={{ overflowWrap: "anywhere" }}>
              {[o.customer_name && o.customer_name !== customer ? o.customer_name : "", o.customer_email ?? o.guest_email ?? "", o.customer_phone ?? ""].filter(Boolean).join(" · ") || "No contact details on this order"}
            </div>
            {stats && (
              <div className="pc-sub-line" style={{ marginTop: "6px" }}>
                {stats.total_orders} {stats.total_orders === 1 ? "order" : "orders"} with you · {money(stats.total_spent)} in all
              </div>
            )}
            {o.pricing_tier && <div style={{ marginTop: "10px" }}><span className="pc-pill" data-tone="blue" style={{ textTransform: "none" }}>{o.pricing_tier}</span></div>}
            <div className="pc-row-actions no-print" style={{ marginTop: "12px", gap: "18px" }}>
              {o.company_id && <Link href={`/admin/customers/${o.company_id}`} className="pc-link">View profile</Link>}
              {o.company_id && <Link href={`/admin/orders?company_id=${o.company_id}`} className="pc-link">All their orders</Link>}
            </div>

            <hr className="pc-rule" style={{ margin: "16px 0" }} />
            <div className="pc-small-head">{pickup ? "Collects in person" : "Ship to"}</div>
            {addr && (addr.address_line1 || addr.city) ? (
              <div style={{ fontSize: "14.5px", lineHeight: 1.55, color: "var(--pc-ink-2)" }}>
                {addr.full_name && <div style={{ color: "var(--pc-ink)", fontWeight: 500 }}>{addr.full_name}</div>}
                {addr.address_line1 && <div>{addr.address_line1}</div>}
                {addr.address_line2 && <div>{addr.address_line2}</div>}
                <div>{[addr.city, [addr.state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                <div>{addr.country ?? "United States"}</div>
                {mapQuery && !pickup && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer" className="pc-link no-print" style={{ display: "inline-block", marginTop: "6px", fontSize: "13.5px" }}>Open in Maps</a>
                )}
              </div>
            ) : <div className="pc-sub-line">No address on this order.</div>}
          </section>

          {/* ── Where the order came from: every visit before it ───────── */}
          {o.conversion && (
            <ConversionSummary
              conversion={o.conversion}
              extra={o.attribution?.utm_source ? (
                <Link className="pc-link no-print" style={{ display: "block", marginTop: "10px" }}
                  href={`/admin/orders?utm_source=${encodeURIComponent(o.attribution.utm_source)}${o.attribution.campaign ? `&utm_campaign=${encodeURIComponent(o.attribution.campaign)}` : ""}`}>
                  All orders from this {o.attribution.campaign ? "campaign" : "source"}
                </Link>
              ) : null}
            />
          )}

          {/* ── Money ───────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="money-title" data-money>
            <h2 className="pc-h2" id="money-title" style={{ marginBottom: "14px" }}>Money</h2>
            <div className="pc-money">
              <div><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
              {(o.discounts ?? []).map((d, i) => (
                <div key={i} style={{ color: "var(--pc-green)" }}><span>{discountLabel(d)}</span><span>{discountAmount(d)}</span></div>
              ))}
              <div><span>Shipping</span><span>{money(o.shipping_cost)}</span></div>
              <div><span>{o.tax_label || "Tax"}</span><span>{money(o.tax_amount ?? 0)}</span></div>
              {Number(o.convenience_fee ?? 0) > 0 && <div><span>Convenience fee (3%)</span><span>{money(o.convenience_fee)}</span></div>}
              <div className="pc-money-total"><span>Total</span><span>{money(o.total)}</span></div>
            </div>

            <div className="pc-money" style={{ marginTop: "14px", fontSize: "13.5px", color: "var(--pc-muted)" }}>
              <div><span>Paid by</span><span>{PAY_METHOD[o.payment_method ?? "card"] ?? o.payment_method ?? "Card"}</span></div>
              {!paid && Number(o.amount_paid ?? 0) > 0 && <div><span>Paid so far</span><span>{money(o.amount_paid)} · {money(o.balance_due ?? 0)} left</span></div>}
              {o.invoice_sent_at && <div><span>Invoice sent</span><span>{day(o.invoice_sent_at)}</span></div>}
              {(left != null || Number(o.amount_refunded ?? 0) > 0) && (
                <div data-refund-line><span>Refunded {money(o.amount_refunded ?? 0)}</span><span>{left != null ? `Left to refund ${money(left)}` : ""}</span></div>
              )}
            </div>

            {!paid && o.status !== "cancelled" && (
              <>
                {o.payment_method === "cod" && <div className="pc-note" style={{ marginTop: "14px" }}>Cash on delivery: collect {money(o.total)} when it is handed over, then mark it paid.</div>}
                {/* Checkout took the buyer's bank details, not money. */}
                {o.payment_method === "ach" && <div className="pc-note" style={{ marginTop: "14px" }}>Bank transfer (ACH): mark it paid once {money(o.total)} is in your account.</div>}
                <div className="pc-row-actions no-print" style={{ marginTop: "14px" }}>
                  <button type="button" className="pc-btn" disabled={!!busy} onClick={markPaid}>Mark as paid</button>
                  <button type="button" className="pc-btn" disabled={!!busy} onClick={sendInvoice}>{busy === "invoice" ? "Sending…" : o.invoice_sent_at ? "Send invoice again" : "Email the invoice"}</button>
                </div>
              </>
            )}

            {o.payment_method === "ach" && (
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--pc-line)" }} data-ach>
                <div className="pc-small-head">Bank payment</div>
                <div className="pc-money" style={{ fontSize: "13.5px" }}>
                  {o.ach_bank_name && <div><span>Bank</span><span>{o.ach_bank_name}</span></div>}
                  {o.ach_account_holder && <div><span>Holder</span><span>{o.ach_account_holder}</span></div>}
                  {o.ach_account_last4 && <div><span>Account</span><span>ending {o.ach_account_last4}{o.ach_account_type ? ` (${o.ach_account_type})` : ""}</span></div>}
                </div>
                <div className="pc-row-actions" style={{ marginTop: "10px" }}>
                  <span className="pc-pill" data-tone={o.ach_verified ? "green" : "amber"} style={{ textTransform: "none" }}>{o.ach_verified ? "Verified" : "Waiting to be verified"}</span>
                  {!o.ach_verified && <button type="button" className="pc-btn no-print" disabled={!!busy} onClick={verifyAch}>Mark as verified</button>}
                </div>
              </div>
            )}
          </section>

          {/* ── Timeline ────────────────────────────────────────────────── */}
          <section className="pc-card pc-pad" aria-labelledby="timeline-title" data-timeline>
            <h2 className="pc-h2" id="timeline-title" style={{ marginBottom: "16px" }}>Timeline</h2>
            {events.length === 0 ? <p className="pc-sub-line" style={{ margin: 0 }}>Nothing has been recorded for this order yet.</p> : (
              <div className="pc-timeline">
                {events.map((e) => (
                  <div key={e.id} className="pc-event" data-kind={e.type === "note" ? "note" : BAD_EVENTS.has(e.type) ? "bad" : undefined} data-event={e.type}>
                    <span className="pc-event-dot" aria-hidden />
                    <div>
                      <div className="pc-event-title">{e.type === "note" ? `Note: ${e.message}` : e.message || e.label}</div>
                      <div className="pc-event-when">{moment(e.occurred_at)}{e.actor_name ? ` · ${e.actor_name}` : e.actor_type === "customer" ? " · Customer" : e.actor_type === "system" ? "" : ` · ${e.actor_type}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── The purchase order behind the sale ──────────────────────── */}
          {o.supplier && (
            <section className="pc-card pc-pad" aria-labelledby="supplier-title" data-supplier>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                <h2 className="pc-h2" id="supplier-title">Supplier</h2>
                <span className="pc-pill" data-tone={SUPPLIER_WORDS[o.supplier.status]?.[1] || undefined} style={{ textTransform: "none" }}>{SUPPLIER_WORDS[o.supplier.status]?.[0] ?? o.supplier.status}</span>
              </div>
              <p className="pc-sub-line" style={{ margin: "8px 0 12px" }}>
                {o.supplier.items} {o.supplier.items === 1 ? "item" : "items"} on this order {o.supplier.items === 1 ? "is" : "are"} filled by {o.supplier.supplier}. The purchase order below is yours to them.
              </p>
              <div className="pc-money" style={{ fontSize: "13.5px" }}>
                {o.supplier.supplier_order_numbers && <div><span>Their order</span><span>{o.supplier.supplier_order_numbers}</span></div>}
                {o.supplier.po_number && <div><span>Your PO</span><span>{o.supplier.po_number}</span></div>}
                {o.supplier.tracking_number && <div><span>Tracking</span><span>{o.supplier.carrier ? `${o.supplier.carrier} ` : ""}{o.supplier.tracking_number}</span></div>}
                {o.supplier.sent_at && <div><span>Sent</span><span>{moment(o.supplier.sent_at)}</span></div>}
              </div>
              {o.supplier.error && <div className="pc-note" data-tone="red" style={{ marginTop: "10px" }}>{o.supplier.error}</div>}
              {o.supplier.test && o.supplier.status === "test" && <div className="pc-note" style={{ marginTop: "10px" }}>Sent as a test. The supplier cancelled it and nothing ships.</div>}
              <Link href="/admin/suppliers" className="pc-link no-print" style={{ display: "inline-block", marginTop: "12px" }}>Manage in Suppliers</Link>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
