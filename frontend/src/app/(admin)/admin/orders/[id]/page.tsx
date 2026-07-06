"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { apiClient } from "@/lib/api-client";

interface OrderItem {
  id: string;
  sku: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}

interface ShippingAddress {
  full_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  postal_code?: string;
  country?: string;
}

interface AdminOrder {
  id: string;
  order_number: string;
  company_name: string;
  company_id: string;
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
  qb_invoice_id: string | null;
  subtotal: string;
  shipping_cost: string;
  tax_amount?: string;
  total: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  shipping_address?: ShippingAddress;
  shipping_method?: string | null;
  // Customer fields (may not be present)
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  pricing_tier?: string;
  payment_method?: string;
  // ACH fields
  ach_bank_name?: string | null;
  ach_account_holder?: string | null;
  ach_account_last4?: string | null;
  ach_account_type?: string | null;
  ach_verified?: boolean | null;
  // Invoice & payment tracking
  payment_terms?: string | null;
  invoice_sent_at?: string | null;
  marked_paid_at?: string | null;
  marked_paid_by?: string | null;
  amount_paid?: string | null;
  balance_due?: string | null;
  is_fully_paid?: boolean;
  // Timeline
  timeline?: Array<{ status: string; message: string; created_by: string; created_at: string }>;
  // Pre-calculated shipment weight from backend (used to pre-fill rate fetch)
  calculated_weight_lbs?: number;
  // Admin edits
  items_edited?: boolean;
  convenience_fee?: string | null;
}

interface CustomerStats {
  total_orders: number;
  total_spent: number;
  created_at: string;
}

interface CompanyRegistration {
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
}

interface AdminRate {
  rate_id: string;
  carrier: string;
  service: string;
  cost: number;
  currency: string;
  days: number | null;
}

const CARRIER_LOGOS: Record<string, string> = {
  USPS: "https://shippo-static.s3.amazonaws.com/providers/75/USPS.png",
  UPS: "https://shippo-static.s3.amazonaws.com/providers/75/UPS.png",
  FedEx: "https://shippo-static.s3.amazonaws.com/providers/75/FedEx.png",
  DHL: "https://shippo-static.s3.amazonaws.com/providers/75/DHL_Express.png",
};

const STATUSES = ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled", "refunded"];

function getAvailableStatuses(currentStatus: string): string[] {
  if (currentStatus === "delivered") return ["delivered", "refunded"];
  if (currentStatus === "cancelled") return ["cancelled", "refunded"];
  return STATUSES.filter(s => s !== "refunded");
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "#D97706",
    confirmed: "#1A5CFF",
    processing: "#6366F1",
    ready_for_pickup: "#0891B2",
    shipped: "#8B5CF6",
    delivered: "#059669",
    cancelled: "#E8242A",
    refunded: "#6B7280",
  };
  return map[status] ?? "#7A7880";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  ready_for_pickup: "Ready for Pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const COURIERS = [
  { id: "fedex", name: "FedEx",  icon: "FX",  services: ["Ground", "2-Day", "Overnight", "Express Saver"] },
  { id: "ups",   name: "UPS",    icon: "UPS", services: ["Ground", "2-Day Air", "Next Day Air", "3-Day Select"] },
  { id: "usps",  name: "USPS",   icon: "US",  services: ["Priority Mail", "Priority Express", "First Class", "Parcel Select"] },
  { id: "dhl",   name: "DHL",    icon: "DHL", services: ["Express", "Economy Select", "Expedited"] },
  { id: "other", name: "Other",  icon: "→",   services: ["Standard", "Express"] },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:           { bg: "rgba(217,119,6,.1)",   color: "#D97706" },
  confirmed:         { bg: "rgba(26,92,255,.1)",   color: "#1A5CFF" },
  processing:        { bg: "rgba(99,102,241,.1)",  color: "#6366F1" },
  ready_for_pickup:  { bg: "rgba(8,145,178,.1)",   color: "#0891B2" },
  shipped:           { bg: "rgba(139,92,246,.1)",  color: "#8B5CF6" },
  delivered:         { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  cancelled:         { bg: "rgba(232,36,42,.1)",   color: "#E8242A" },
  refunded:          { bg: "rgba(107,114,128,.1)", color: "#6B7280" },
  authorized:        { bg: "rgba(245,158,11,.1)",  color: "#D97706" },
  paid:              { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  unpaid:            { bg: "rgba(107,114,128,.1)", color: "#6B7280" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "rgba(0,0,0,.06)", color: "#555" };
  const label = STATUS_LABEL[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
      {label}
    </span>
  );
}

function generateTrackingNumber(courier: string): string {
  const prefix: Record<string, string> = { fedex: "7489", ups: "1Z", usps: "9400", dhl: "JD", other: "TRK" };
  const p = prefix[courier] ?? "TRK";
  const random = Math.random().toString(36).substring(2, 12).toUpperCase();
  const ts = Date.now().toString().slice(-6);
  return `${p}${ts}${random}`;
}

const LabelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: ".08em",
  color: "#7A7880", marginBottom: "6px", display: "block",
};

const CardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA",
  borderRadius: "10px", padding: "20px", marginBottom: "16px",
};

const SectionHead: React.CSSProperties = {
  fontFamily: "var(--font-bebas)", fontSize: "16px",
  letterSpacing: ".06em", color: "#2A2830",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [companyReg, setCompanyReg] = useState<CompanyRegistration | null>(null);
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Courier state (legacy manual shipping)
  const [selectedCourier, setSelectedCourier] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isShipping, setIsShipping] = useState(false);

  // Shippo label generation state
  const [selectedCarrier, setSelectedCarrier] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelResult, setLabelResult] = useState<{
    success?: boolean;
    tracking_number?: string;
    tracking_url?: string;
    label_url?: string;
    carrier?: string;
    service?: string;
    rate?: number;
    error?: string;
  } | null>(null);

  const [manualWeight, setManualWeight] = useState<number>(1.0);
  const [manualLabelLoading, setManualLabelLoading] = useState(false);
  const [adminRates, setAdminRates] = useState<AdminRate[]>([]);
  const [adminRatesLoading, setAdminRatesLoading] = useState(false);
  const [adminSelectedRateId, setAdminSelectedRateId] = useState<string | null>(null);
  const adminRatesRef = useRef<AdminRate[]>([]);

  const [isVerifyingAch, setIsVerifyingAch] = useState(false);
  const [isResendingInvoice, setIsResendingInvoice] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Notes state
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Order items edit mode
  const [editingItems, setEditingItems] = useState(false);

  // Add item state
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<{ variant_id: string; sku: string; product_name: string; color: string | null; size: string | null; price: number }[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<{ variant_id: string; sku: string; product_name: string; color: string | null; size: string | null; price: number } | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addItemMsg, setAddItemMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrderLoading(true);
    setOrderError(null);
    adminService.getOrder(id)
      .then(async (d) => {
        const o = d as AdminOrder;
        setOrder(o);
        setStatus(o.status);
        setManualWeight(o.calculated_weight_lbs ?? 1.0);
        setTracking(o.tracking_number ?? "");
        setNoteText(o.order_notes ?? "");
        if (o.courier) setSelectedCourier(o.courier);
        if (o.courier_service) setSelectedService(o.courier_service);
        if (o.tracking_number) setTrackingNumber(o.tracking_number);
        const _cMap: Record<string, string> = { USPS: "usps", UPS: "ups", FedEx: "fedex" };
        if (o.tracking_number && o.label_url) {
          setLabelResult({
            success: true,
            tracking_number: o.tracking_number,
            tracking_url: o.tracking_url ?? undefined,
            label_url: o.label_url,
            carrier: o.courier ?? "",
            service: o.courier_service ?? "",
          });
          const raw = o.courier ?? "";
          setSelectedCarrier(_cMap[raw] ?? raw.toLowerCase());
        } else if (o.carrier) {
          // Pre-select the carrier the customer chose at checkout
          setSelectedCarrier(_cMap[o.carrier] ?? o.carrier.toLowerCase());
        }

        // Fetch customer stats and company registration info (best-effort)
        if (o.company_id) {
          try {
            const stats = await apiClient.get<CustomerStats>(`/api/v1/admin/customers/${o.company_id}/stats`);
            if (stats) setCustomerStats(stats);
          } catch { /* stats are optional */ }
          try {
            const co = await apiClient.get<CompanyRegistration>(`/api/v1/admin/customers/${o.company_id}`);
            if (co) setCompanyReg(co);
          } catch { /* company info optional */ }
        }
      })
      .catch((err) => {
        setOrderError(err?.message || "Failed to load order.");
      })
      .finally(() => {
        setOrderLoading(false);
      });
  }, [id]);

  // Auto-fetch Shippo rates when a Standard Ground order loads (no manual click needed)
  useEffect(() => {
    if (!order?.id) return;
    const isWillCall = !!(
      order.shipping_method?.toLowerCase().includes("will_call") ||
      order.shipping_method?.toLowerCase().includes("pickup")
    );
    const hasLiveRate = !!order.shipping_rate_id;
    const hasExistingLabel = !!(order.tracking_number && order.label_url);
    if (hasLiveRate || isWillCall || hasExistingLabel) return;  // only Standard Ground without a label

    // Standard Ground: reset state and auto-fetch rates immediately on load
    const weight = order.calculated_weight_lbs ?? 1.0;
    adminRatesRef.current = [];
    setAdminRates([]);
    setAdminSelectedRateId(null);
    setAdminRatesLoading(true);
    apiClient.post<{ rates: AdminRate[]; error?: string }>(
      `/api/v1/admin/orders/${order.id}/fetch-rates`,
      { weight_lbs: weight }
    ).then(result => {
      const rates = result.rates ?? [];
      adminRatesRef.current = rates;
      setAdminRates(rates);
      if (rates.length > 0) setAdminSelectedRateId(rates[0]!.rate_id);
    }).catch(() => {
      adminRatesRef.current = [];
    }).finally(() => {
      setAdminRatesLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  // Safeguard: restore rates from ref if React wipes state unexpectedly
  useEffect(() => {
    if (!adminRatesLoading && adminRates.length === 0 && adminRatesRef.current.length > 0) {
      setAdminRates(adminRatesRef.current);
    }
  });

  function handleCourierSelect(courierId: string) {
    setSelectedCourier(courierId);
    setSelectedService("");
    setTrackingNumber(generateTrackingNumber(courierId));
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true); setMsg(null);
    try {
      await adminService.updateOrder(order?.id ?? id, { status });
      setMsg({ text: "Order updated successfully.", ok: true });
      setOrder(prev => prev ? { ...prev, status, tracking_number: tracking || null } : prev);
    } catch {
      setMsg({ text: "Failed to update order.", ok: false });
    } finally { setIsSaving(false); }
  }

  async function handleSyncQB() {
    setIsSyncing(true); setMsg(null);
    try {
      await adminService.syncOrderToQb(order?.id ?? id);
      setMsg({ text: "QuickBooks sync queued.", ok: true });
    } catch {
      setMsg({ text: "QB sync failed.", ok: false });
    } finally { setIsSyncing(false); }
  }

  async function handleMarkShipped() {
    if (!selectedCourier || !selectedService) return;
    setIsShipping(true); setMsg(null);
    try {
      await apiClient.patch(`/api/v1/admin/orders/${order?.id ?? id}/status`, {
        status: "shipped",
        tracking_number: trackingNumber || undefined,
        courier: selectedCourier,
        courier_service: selectedService,
      });
      const courierLabel = COURIERS.find(c => c.id === selectedCourier)?.name ?? selectedCourier;
      setMsg({ text: `Order marked as shipped via ${courierLabel} ${selectedService}.`, ok: true });
      setOrder(prev => prev ? {
        ...prev, status: "shipped",
        tracking_number: trackingNumber || null,
        courier: selectedCourier, courier_service: selectedService,
        shipped_at: new Date().toISOString(),
      } : prev);
      setStatus("shipped");
      setTracking(trackingNumber);
    } catch {
      setMsg({ text: "Failed to mark as shipped.", ok: false });
    } finally { setIsShipping(false); }
  }

  async function handleGenerateLabel() {
    if (!selectedCarrier) return;
    setLabelLoading(true); setMsg(null); setLabelResult(null);
    try {
      const result = await apiClient.post<{
        success?: boolean; tracking_number?: string; tracking_url?: string;
        label_url?: string; carrier?: string; service?: string; rate?: number; error?: string;
      }>(`/api/v1/admin/orders/${order?.id ?? id}/labels`, { carrier: selectedCarrier });
      setLabelResult(result);
      if (result.success) {
        setMsg({ text: `Label generated — ${result.carrier?.toUpperCase()} ${result.service}`, ok: true });
        setOrder(prev => prev ? {
          ...prev,
          status: "shipped",
          tracking_number: result.tracking_number ?? prev.tracking_number,
          tracking_url: result.tracking_url ?? prev.tracking_url,
          label_url: result.label_url ?? prev.label_url,
          courier: result.carrier ?? prev.courier,
          courier_service: result.service ?? prev.courier_service,
          shipped_at: prev.shipped_at ?? new Date().toISOString(),
        } : prev);
        setStatus("shipped");
        if (result.tracking_number) setTracking(result.tracking_number);
      } else {
        setMsg({ text: result.error ?? "Label generation failed.", ok: false });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to generate label.";
      setLabelResult({ success: false, error: errMsg });
      setMsg({ text: errMsg, ok: false });
    } finally {
      setLabelLoading(false);
    }
  }

  async function handleFetchAdminRates() {
    setAdminRatesLoading(true);
    adminRatesRef.current = [];
    setAdminRates([]);
    setAdminSelectedRateId(null);
    try {
      const result = await apiClient.post<{ rates: AdminRate[]; error?: string }>(
        `/api/v1/admin/orders/${order?.id ?? id}/fetch-rates`,
        { weight_lbs: manualWeight }
      );
      const rates = result.rates ?? [];
      adminRatesRef.current = rates;
      setAdminRates(rates);
      if (rates.length > 0) setAdminSelectedRateId(rates[0]!.rate_id);
    } catch {
      adminRatesRef.current = [];
      setAdminRates([]);
    } finally {
      setAdminRatesLoading(false);
    }
  }

  async function handleGenerateManualLabel() {
    const selectedRate = adminRates.find(r => r.rate_id === adminSelectedRateId);
    if (!selectedRate) return;
    setManualLabelLoading(true); setMsg(null); setLabelResult(null);
    try {
      const result = await apiClient.post<{
        success?: boolean; tracking_number?: string; tracking_url?: string;
        label_url?: string; carrier?: string; service?: string; rate?: number; error?: string;
      }>(`/api/v1/admin/orders/${order?.id ?? id}/generate-label-manual`, {
        rate_id: selectedRate.rate_id,
        carrier: selectedRate.carrier,
        service: selectedRate.service,
      });
      setLabelResult(result);
      if (result.success) {
        setMsg({ text: `Label generated — ${result.carrier?.toUpperCase()} ${result.service}`, ok: true });
        setOrder(prev => prev ? {
          ...prev,
          status: "shipped",
          tracking_number: result.tracking_number ?? prev.tracking_number,
          tracking_url: result.tracking_url ?? prev.tracking_url,
          label_url: result.label_url ?? prev.label_url,
          courier: result.carrier ?? prev.courier,
          courier_service: result.service ?? prev.courier_service,
          shipped_at: prev.shipped_at ?? new Date().toISOString(),
        } : prev);
        setStatus("shipped");
        if (result.tracking_number) setTracking(result.tracking_number);
      } else {
        setMsg({ text: result.error ?? "Label generation failed.", ok: false });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to generate label.";
      setLabelResult({ success: false, error: errMsg });
      setMsg({ text: errMsg, ok: false });
    } finally {
      setManualLabelLoading(false);
    }
  }

  async function handleCapturePayment() {
    setIsCapturing(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/capture`, {});
      setMsg({ text: "Payment captured successfully.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid" } : prev);
    } catch {
      setMsg({ text: "Failed to capture payment.", ok: false });
    } finally { setIsCapturing(false); }
  }

  async function handleVerifyAch() {
    setIsVerifyingAch(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/verify-ach`, {});
      setMsg({ text: "ACH payment verified. Order payment status updated to Paid.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid", ach_verified: true } : prev);
    } catch {
      setMsg({ text: "Failed to verify ACH payment.", ok: false });
    } finally { setIsVerifyingAch(false); }
  }

  async function handleResendInvoice() {
    setIsResendingInvoice(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/send-invoice`, {});
      setMsg({ text: "Invoice emailed to customer.", ok: true });
      setOrder(prev => prev ? { ...prev, invoice_sent_at: new Date().toISOString() } : prev);
    } catch {
      setMsg({ text: "Failed to send invoice email.", ok: false });
    } finally { setIsResendingInvoice(false); }
  }

  async function handleMarkAsPaid() {
    if (!confirm("Mark this order as paid?")) return;
    setIsMarkingPaid(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/mark-paid`, {});
      setMsg({ text: "Order marked as paid.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid", marked_paid_at: new Date().toISOString() } : prev);
    } catch {
      setMsg({ text: "Failed to mark as paid.", ok: false });
    } finally { setIsMarkingPaid(false); }
  }

  async function handleSaveNote() {
    try {
      await apiClient.patch(`/api/v1/admin/orders/${order?.id ?? id}`, { notes: noteText });
      setEditingNote(false);
      setOrder(prev => prev ? { ...prev, order_notes: noteText } : prev);
      setMsg({ text: "Note saved.", ok: true });
    } catch {
      setMsg({ text: "Failed to save note.", ok: false });
    }
  }

  function handleItemSearchChange(val: string) {
    setItemSearch(val);
    setSelectedVariant(null);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!val.trim()) { setItemResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<{ id: string; name: string; variants: { id: string; sku: string; color: string | null; size: string | null; retail_price: number }[] }[]>(
          `/api/v1/admin/products?q=${encodeURIComponent(val)}&page_size=20`
        );
        const results: typeof itemResults = [];
        for (const p of (Array.isArray(data) ? data : []) as typeof data) {
          for (const v of p.variants ?? []) {
            results.push({ variant_id: v.id, sku: v.sku, product_name: p.name, color: v.color, size: v.size, price: Number(v.retail_price || 0) });
          }
        }
        setItemResults(results.slice(0, 30));
      } catch { /* ignore */ }
    }, 350);
  }

  async function handleAddItem() {
    if (!selectedVariant || addQty < 1) return;
    setAddingItem(true); setAddItemMsg(null);
    try {
      const result = await apiClient.post<{ subtotal: number; total: number }>(
        `/api/v1/admin/orders/${order?.id ?? id}/items`,
        { variant_id: selectedVariant.variant_id, quantity: addQty, unit_price: selectedVariant.price }
      );
      setOrder(prev => prev ? {
        ...prev,
        subtotal: String(result.subtotal),
        total: String(result.total),
        items_edited: true,
        items: [...prev.items, {
          id: crypto.randomUUID(),
          sku: selectedVariant.sku,
          product_name: selectedVariant.product_name,
          color: selectedVariant.color,
          size: selectedVariant.size,
          quantity: addQty,
          unit_price: String(selectedVariant.price),
          line_total: String(selectedVariant.price * addQty),
        }],
      } : prev);
      setAddItemMsg({ text: `Added ${addQty}x ${selectedVariant.product_name}`, ok: true });
      setSelectedVariant(null); setItemSearch(""); setItemResults([]); setAddQty(1);
    } catch (err: unknown) {
      setAddItemMsg({ text: err instanceof Error ? err.message : "Failed to add item", ok: false });
    } finally {
      setAddingItem(false);
    }
  }

  async function handleRemoveItem(itemId: string, lineTotal: string) {
    try {
      await apiClient.delete(`/api/v1/admin/orders/${order?.id ?? id}/items/${itemId}`);
      setOrder(prev => prev ? {
        ...prev,
        items: prev.items.filter(i => i.id !== itemId),
        subtotal: String(Math.max(0, Number(prev.subtotal) - Number(lineTotal))),
        total: String(Math.max(0, Number(prev.total) - Number(lineTotal))),
        items_edited: true,
      } : prev);
    } catch {
      setMsg({ text: "Failed to remove item.", ok: false });
    }
  }

  if (orderLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "320px" }}>
        <div style={{ fontSize: "13px", color: "#aaa" }}>Loading order…</div>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "320px", gap: "12px" }}>
        <div style={{ fontSize: "14px", color: "#E8242A", fontWeight: 600 }}>{orderError || "Order not found."}</div>
        <button onClick={() => router.back()} style={{ fontSize: "13px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>← Back to Orders</button>
      </div>
    );
  }

  const courierObj = COURIERS.find(c => c.id === selectedCourier);
  const courierDisplayName = COURIERS.find(c => c.id === order.courier)?.name ?? order.courier;
  const _carrierMap: Record<string, string> = { USPS: "usps", UPS: "ups", FedEx: "fedex" };
  const customerCarrier = order.carrier
    ? (_carrierMap[order.carrier] ?? order.carrier.toLowerCase())
    : null;

  const isWillCallPickup = !!(
    order.shipping_method?.toLowerCase().includes("will_call") ||
    order.shipping_method?.toLowerCase().includes("pickup")
  );
  const hasLiveRate = !!order.shipping_rate_id;
  const isStandardGround = !hasLiveRate && !isWillCallPickup;

  const addr = order.shipping_address;
  const zip = addr?.zip_code ?? addr?.postal_code ?? "";

  const backendTimeline = order.timeline ?? [];
  const timelineEvents: { text: string; sub: string; time: string; color: string }[] = [
    // Seed the "Order placed" entry from order creation time
    {
      text: "Order placed",
      sub: `${order.company_name || order.customer_name || "Customer"} · ${order.payment_status}`,
      time: order.created_at,
      color: "#1A5CFF",
    },
    // Append all backend-recorded status changes in chronological order
    ...backendTimeline.map(entry => ({
      text: entry.message,
      sub: entry.created_by === "admin" ? "Admin" : entry.created_by,
      time: entry.created_at,
      color: getStatusColor(entry.status),
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).reverse();

  const avatarInitial = order.customer_name?.[0]?.toUpperCase() ?? order.company_name?.[0]?.toUpperCase() ?? "C";
  const mapQuery = [addr?.address_line1, addr?.city, addr?.state].filter(Boolean).join(", ");

  return (
    <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "1200px" }}>
      {/* Back */}
      <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#1A5CFF", cursor: "pointer", fontSize: "13px", fontWeight: 700, padding: 0, marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
        ← Back to Orders
      </button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".04em", lineHeight: 1 }}>
            {order.order_number}
          </h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
            <span>{order.company_name}</span>
            <span>·</span>
            <span>{new Date(order.created_at).toLocaleDateString()}</span>
            <span>·</span>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} />
          </p>
        </div>
        <button
          onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#2A2830", cursor: "pointer" }}
          className="no-print"
        >
          🖨️ Print
        </button>
      </div>
      <style>{`
        @media print {
          nav, header, aside, [data-sidebar], .no-print { display: none !important; }
          body { font-size: 12px; }
          main, .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      {/* Feedback */}
      {msg && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.ok ? "rgba(5,150,105,.1)" : "rgba(232,36,42,.1)", color: msg.ok ? "#059669" : "#E8242A", border: `1px solid ${msg.ok ? "rgba(5,150,105,.2)" : "rgba(232,36,42,.2)"}` }}>
          {msg.text}
        </div>
      )}

      {/* Payment Capture Alert */}
      {order.payment_status === "authorized" && (
        <div style={{ background: "#fff8f0", border: "1.5px solid #fed7aa", borderRadius: "10px", padding: "20px 24px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" as const }}>
            <div>
              <h4 style={{ fontWeight: 700, color: "#c2410c", marginBottom: "4px", fontSize: "15px" }}>⏰ Payment Authorized</h4>
              <p style={{ fontSize: "13px", color: "#7A7880" }}>Capture payment before authorization expires</p>
            </div>
            <button onClick={handleCapturePayment} disabled={isCapturing}
              style={{ background: "#059669", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "14px", opacity: isCapturing ? .6 : 1, whiteSpace: "nowrap" as const }}>
              {isCapturing ? "Capturing…" : `Capture $${Number(order.total).toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* ── 2-COLUMN LAYOUT ── */}
      <div className="admin-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", alignItems: "flex-start" }}>

        {/* ── LEFT: Main content ── */}
        <div>
          {/* SHIPPING & COURIER — always shown; content varies by order type */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", marginBottom: "14px" }}>SHIPPING & COURIER</h3>

            {/* Already-shipped summary */}
            {order.status === "shipped" && order.courier && (
              <div style={{ fontSize: "12px", color: "#059669", fontWeight: 600, marginBottom: "14px", padding: "8px 12px", background: "rgba(5,150,105,.08)", borderRadius: "6px" }}>
                ✓ Shipped via {courierDisplayName} {order.courier_service}
                {order.tracking_number && ` · Tracking: ${order.tracking_number}`}
                {order.shipped_at && ` · ${new Date(order.shipped_at).toLocaleDateString()}`}
              </div>
            )}

            {/* CASE 3: Will Call Pickup */}
            {isWillCallPickup ? (
              <div style={{ background: "rgba(26,92,255,.05)", border: "1.5px solid rgba(26,92,255,.2)", borderRadius: "10px", padding: "18px 20px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A5CFF", marginBottom: "10px" }}>📦 Customer selected: Will Call Pickup</div>
                <div style={{ fontSize: "13px", color: "#2A2830", fontWeight: 600, marginBottom: "6px" }}>Warehouse Address:</div>
                <div style={{ fontSize: "13px", color: "#7A7880", lineHeight: 1.7 }}>
                  AF Apparels<br />
                  10719 Turbeville Rd<br />
                  Dallas, TX 75243<br />
                  Mon–Fri 9am–5pm CST
                </div>
                <div style={{ marginTop: "12px", fontSize: "12px", color: "#059669", fontWeight: 700, background: "rgba(5,150,105,.08)", padding: "6px 10px", borderRadius: "6px", display: "inline-block" }}>
                  ✓ No shipping label required — customer will pick up
                </div>
              </div>
            ) : (
              /* CASE 1 & 2: Shippo label generation */
              <div style={{ marginBottom: "16px" }}>
                <label style={{ ...LabelStyle, marginBottom: "10px" }}>Generate Shipping Label via Shippo</label>

                {/* Customer selection info banner */}
                {order.shipping_method && (
                  <div style={{ background: "rgba(26,92,255,.06)", border: "1px solid rgba(26,92,255,.2)", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, marginBottom: "2px" }}>Customer Selected:</div>
                    <div style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 600 }}>
                      {hasLiveRate && order.carrier
                        ? `${order.carrier} — ${order.courier_service ?? ""} — $${Number(order.shipping_cost).toFixed(2)}`
                        : `${order.shipping_method} — Flat Rate — $${Number(order.shipping_cost).toFixed(2)}`
                      }
                    </div>
                    {order.shipping_rate_id && (
                      <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>Rate ID: {order.shipping_rate_id}</div>
                    )}
                  </div>
                )}

                {/* CASE 2 (Standard Ground): live rates fetch UI */}
                {isStandardGround ? (
                  <>
                    {!labelResult?.success && (
                      <>
                        {/* Weight input + Fetch Rates button */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" as const }}>
                          <label style={{ ...LabelStyle, marginBottom: 0, whiteSpace: "nowrap" as const }}>Package Weight (lbs)</label>
                          <input
                            type="number" min="0.1" step="0.1" value={manualWeight}
                            onChange={e => setManualWeight(parseFloat(e.target.value) || 0.5)}
                            style={{ width: "80px", padding: "8px 10px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)" }}
                          />
                          <button onClick={handleFetchAdminRates} disabled={adminRatesLoading}
                            style={{ padding: "8px 18px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: adminRatesLoading ? "not-allowed" : "pointer", opacity: adminRatesLoading ? .65 : 1, whiteSpace: "nowrap" as const }}>
                            {adminRatesLoading ? "Fetching…" : "Refresh Rates"}
                          </button>
                        </div>

                        {/* Loading */}
                        {adminRatesLoading && (
                          <div style={{ fontSize: "12px", color: "#7A7880", padding: "6px 0", marginBottom: "10px" }}>Fetching live carrier rates…</div>
                        )}

                        {/* Rate list */}
                        {!adminRatesLoading && adminRates.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", marginBottom: "14px" }}>
                            {adminRates.map(rate => {
                              const isRateSelected = adminSelectedRateId === rate.rate_id;
                              return (
                                <div key={rate.rate_id}
                                  onClick={() => setAdminSelectedRateId(rate.rate_id)}
                                  style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 14px", cursor: "pointer",
                                    border: `1px solid ${isRateSelected ? "#1A5CFF" : "#E2E0DA"}`,
                                    borderRadius: "6px",
                                    background: isRateSelected ? "rgba(26,92,255,.04)" : "#fff",
                                    transition: "all .1s",
                                  }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{
                                      width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
                                      border: `2px solid ${isRateSelected ? "#1A5CFF" : "#E2E0DA"}`,
                                      background: isRateSelected ? "#1A5CFF" : "#fff",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {isRateSelected && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#fff" }} />}
                                    </div>
                                    {CARRIER_LOGOS[rate.carrier] && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={CARRIER_LOGOS[rate.carrier]} alt={rate.carrier}
                                        style={{ maxHeight: "20px", width: "auto", objectFit: "contain", flexShrink: 0 }} />
                                    )}
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{rate.service}</div>
                                      {rate.days != null && <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "1px" }}>{rate.days} business day{rate.days !== 1 ? "s" : ""}</div>}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#2A2830" }}>${Number(rate.cost).toFixed(2)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* No rates yet */}
                        {!adminRatesLoading && adminRates.length === 0 && (
                          <div style={{ fontSize: "12px", color: "#7A7880", marginBottom: "14px" }}>
                            Enter a package weight and click "Refresh Rates" to load available carrier options.
                          </div>
                        )}

                        {/* Generate Label button */}
                        <button onClick={handleGenerateManualLabel} disabled={!adminSelectedRateId || manualLabelLoading}
                          style={{ background: adminSelectedRateId ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: adminSelectedRateId ? "pointer" : "not-allowed", opacity: manualLabelLoading ? .65 : 1, marginBottom: "14px" }}>
                          {manualLabelLoading ? "Generating label…" : adminSelectedRateId ? "Generate Label" : "Select a rate first"}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  /* CASE 1 (Live Rate): customer's rate already known — generate label directly */
                  <>
                    <button onClick={handleGenerateLabel} disabled={!selectedCarrier || labelLoading}
                      style={{ background: selectedCarrier ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: selectedCarrier ? "pointer" : "not-allowed", opacity: labelLoading ? .65 : 1, marginBottom: "14px" }}>
                      {labelLoading ? "Generating label…" : `Generate ${(order.carrier ?? selectedCarrier ?? "").toUpperCase()} Label`}
                    </button>
                  </>
                )}

                {/* Label result */}
                {labelResult && labelResult.success && (
                  <div style={{ background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.2)", borderRadius: "8px", padding: "14px 16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669", marginBottom: "10px" }}>✓ Label generated</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", color: "#2A2830", marginBottom: "12px" }}>
                      {labelResult.carrier && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Carrier: </span>{labelResult.carrier.toUpperCase()}</div>}
                      {labelResult.service && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Service: </span>{labelResult.service}</div>}
                      {labelResult.tracking_number && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#7A7880", fontWeight: 600 }}>Tracking: </span>{labelResult.tracking_number}</div>}
                      {labelResult.rate != null && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Rate: </span>${Number(labelResult.rate).toFixed(2)}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
                      {labelResult.label_url && (
                        <a href={labelResult.label_url} target="_blank" rel="noreferrer"
                          style={{ background: "#1A5CFF", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                          ↓ Download Label PDF
                        </a>
                      )}
                      {labelResult.tracking_url && (
                        <a href={labelResult.tracking_url} target="_blank" rel="noreferrer"
                          style={{ background: "#fff", color: "#1A5CFF", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none", border: "1.5px solid #1A5CFF" }}>
                          Track Package →
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {labelResult && !labelResult.success && (
                  <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid rgba(232,36,42,.2)", borderRadius: "8px", padding: "12px 16px", fontSize: "13px", color: "#E8242A", fontWeight: 600 }}>
                    ✗ {labelResult.error ?? "Label generation failed. Check that Shippo API key and shipping address are set."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STATUS UPDATE */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", marginBottom: "16px" }}>UPDATE ORDER</h3>
            <form onSubmit={handleUpdate} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div>
                <label style={LabelStyle}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", background: "#fff" }}>
                  {getAvailableStatuses(order.status).filter(s => !(s === "shipped" && order.shipping_method === "will_call")).map(s => (
                    <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                  ))}
                </select>
              </div>
              {/* Tracking is managed via Shipping & Courier section above */}
              <button type="submit" disabled={isSaving}
                style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "11px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: "pointer", opacity: isSaving ? .6 : 1 }}>
                {isSaving ? "Saving…" : "Update Order"}
              </button>
            </form>
          </div>

          {/* ORDER ITEMS */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em" }}>ORDER ITEMS</h3>
              {["pending", "confirmed", "processing"].includes(order.status) && (
                editingItems ? (
                  <button
                    onClick={() => setEditingItems(false)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "1.5px solid #E2E0DA", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#7A7880" }}>
                    ✕ Done Editing
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingItems(true)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830" }}>
                    ✎ Edit
                  </button>
                )
              )}
            </div>

            {/* Add Items — only in edit mode */}
            {editingItems && (
              <div style={{ background: "#F4F3EF", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#7A7880", marginBottom: "10px" }}>Add Product</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      value={itemSearch}
                      onChange={e => handleItemSearchChange(e.target.value)}
                      placeholder="Search product by name or SKU…"
                      style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box" as const, background: "#fff" }}
                    />
                    {itemResults.length > 0 && !selectedVariant && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "6px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 50, maxHeight: "200px", overflowY: "auto" as const }}>
                        {itemResults.map(v => (
                          <div
                            key={v.variant_id}
                            onClick={() => { setSelectedVariant(v); setItemSearch(`${v.product_name} — ${[v.color, v.size].filter(Boolean).join(" / ")}`); setItemResults([]); }}
                            style={{ padding: "9px 12px", fontSize: "13px", cursor: "pointer", borderBottom: "1px solid #F4F3EF" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F4F3EF")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                          >
                            <span style={{ fontWeight: 600, color: "#2A2830" }}>{v.product_name}</span>
                            <span style={{ color: "#7A7880", marginLeft: "8px" }}>
                              {[v.color, v.size].filter(Boolean).join(" / ")}
                            </span>
                            <span style={{ color: "#1A5CFF", marginLeft: "8px", fontFamily: "monospace", fontSize: "11px" }}>{v.sku}</span>
                            <span style={{ color: "#059669", marginLeft: "8px", fontWeight: 700 }}>${v.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={e => setAddQty(Math.max(1, Number(e.target.value)))}
                    placeholder="Qty"
                    style={{ width: "72px", padding: "9px 8px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", textAlign: "center" as const, background: "#fff" }}
                  />
                  <button
                    onClick={handleAddItem}
                    disabled={!selectedVariant || addingItem}
                    style={{ background: selectedVariant && !addingItem ? "#059669" : "#E2E0DA", color: selectedVariant && !addingItem ? "#fff" : "#aaa", border: "none", padding: "9px 18px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: selectedVariant && !addingItem ? "pointer" : "not-allowed", whiteSpace: "nowrap" as const }}>
                    {addingItem ? "Adding…" : "+ Add"}
                  </button>
                </div>
                {selectedVariant && (
                  <div style={{ fontSize: "12px", color: "#059669", fontWeight: 600 }}>
                    Selected: {selectedVariant.product_name} — {[selectedVariant.color, selectedVariant.size].filter(Boolean).join(" / ")} @ ${selectedVariant.price.toFixed(2)}/unit
                    <button onClick={() => { setSelectedVariant(null); setItemSearch(""); }} style={{ marginLeft: "8px", fontSize: "11px", color: "#E8242A", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                )}
                {addItemMsg && (
                  <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 600, color: addItemMsg.ok ? "#059669" : "#E8242A" }}>{addItemMsg.text}</div>
                )}
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E0DA" }}>
                  {["Product", "SKU", "Color / Size", "Qty", "Unit Price", "Total", ""].map(h => (
                    <th key={h} style={{ textAlign: (h === "Qty" || h === "Unit Price" || h === "Total") ? "right" as const : "left" as const, padding: "10px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#7A7880" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: i < order.items.length - 1 ? "1px solid #F4F3EF" : "none" }}>
                    <td style={{ padding: "14px 12px", fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{item.product_name}</td>
                    <td style={{ padding: "14px 12px", fontSize: "12px", color: "#7A7880", fontFamily: "monospace" }}>{item.sku}</td>
                    <td style={{ padding: "14px 12px" }}>
                      {item.color && <span style={{ fontSize: "13px", color: "#2A2830", marginRight: "6px" }}>{item.color}</span>}
                      {item.size && <span style={{ background: "#F4F3EF", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color: "#2A2830" }}>{item.size}</span>}
                      {!item.color && !item.size && <span style={{ color: "#aaa" }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, fontWeight: 700, color: "#2A2830" }}>{item.quantity}</td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, color: "#7A7880" }}>${Number(item.unit_price).toFixed(2)}</td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, fontWeight: 700, fontFamily: "var(--font-bebas)", fontSize: "16px", color: "#2A2830" }}>${Number(item.line_total).toFixed(2)}</td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const }}>
                      {editingItems && (
                        <button
                          onClick={() => handleRemoveItem(item.id, item.line_total)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "14px", fontWeight: 700, padding: "2px 6px" }}
                          title="Remove item">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div style={{ borderTop: "2px solid #E2E0DA", marginTop: "16px", paddingTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: "260px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                  <span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                  <span>Shipping</span><span>${Number(order.shipping_cost).toFixed(2)}</span>
                </div>
                {order.tax_amount && Number(order.tax_amount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                    <span>Tax</span><span>${Number(order.tax_amount).toFixed(2)}</span>
                  </div>
                )}
                {order.convenience_fee && Number(order.convenience_fee) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#D97706" }}>
                    <span>Convenience Fee (3%)</span><span>${Number(order.convenience_fee).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#2A2830", borderTop: "1px solid #E2E0DA", paddingTop: "10px", marginTop: "4px" }}>
                  <span>Total</span><span>${Number(order.total).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* INVOICE & PAYMENT — always visible unless paid+card+no edits */}
          {(order.payment_status !== "paid" || order.items_edited) && (
          <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1B3A5C' }}>Invoice &amp; Payment</p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888' }}>
                {order.payment_status === "paid" && !order.invoice_sent_at
                  ? `Payment received via ${order.payment_method === "ach" ? "ACH / Bank Transfer" : "Card"}`
                  : order.invoice_sent_at
                    ? `Invoice sent ${new Date(order.invoice_sent_at).toLocaleDateString()}`
                    : 'Invoice not yet sent'}
                {Number(order.amount_paid) > 0 && order.payment_status !== "paid" && (
                  <span style={{ color: '#D97706', marginLeft: '6px' }}>
                    · ${Number(order.amount_paid).toFixed(2)} paid · ${Number(order.balance_due ?? 0).toFixed(2)} remaining
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleResendInvoice}
              disabled={isResendingInvoice}
              style={{ background: '#fff', color: '#1B3A5C', border: '1px solid #1B3A5C', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: isResendingInvoice ? 'not-allowed' : 'pointer', opacity: isResendingInvoice ? 0.6 : 1 }}>
              {isResendingInvoice ? 'Sending…' : (order.invoice_sent_at ? 'Resend Invoice' : 'Send Invoice')}
            </button>
            {order.payment_status !== "paid" && (
              <button
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid}
                style={{ background: '#10B981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: isMarkingPaid ? 'not-allowed' : 'pointer', opacity: isMarkingPaid ? 0.6 : 1 }}>
                {isMarkingPaid ? 'Saving…' : '✓ Mark as Paid'}
              </button>
            )}
          </div>
          )}

          {/* TIMELINE */}
          <div style={{ ...CardStyle, padding: "24px", marginBottom: 0 }}>
            <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", marginBottom: "20px" }}>TIMELINE</h3>
            <div style={{ position: "relative", paddingLeft: "28px" }}>
              <div style={{ position: "absolute", left: "23px", top: "8px", bottom: "8px", width: "2px", background: "#E2E0DA" }} />
              {timelineEvents.map((event, i) => (
                <div key={i} style={{ display: "flex", gap: "16px", marginBottom: "20px", position: "relative", alignItems: "flex-start" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: event.color, border: "2px solid #fff", boxShadow: `0 0 0 2px ${event.color}`, flexShrink: 0, zIndex: 1, marginLeft: "-14px", marginTop: "2px" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{event.text}</div>
                    {event.sub && <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "2px" }}>{event.sub}</div>}
                    <div style={{ fontSize: "11px", color: "#bbb", marginTop: "4px" }}>{new Date(event.time).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div>
          {/* ── SECTION 0: DOCUMENTS ── */}
          {/* <div style={CardStyle}>
            <h3 style={{ ...SectionHead, marginBottom: "14px" }}>DOCUMENTS</h3>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
              <button
                onClick={handleResendInvoice}
                disabled={isResendingInvoice}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: isResendingInvoice ? "#F4F3EF" : "#1B3A5C", color: isResendingInvoice ? "#7A7880" : "#fff", border: "none", padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: isResendingInvoice ? "not-allowed" : "pointer", opacity: isResendingInvoice ? .6 : 1, width: "100%", justifyContent: "center" as const }}>
                {isResendingInvoice ? "Sending…" : "📄 Email Invoice to Customer"}
              </button>
              <a
                href={`/api/v1/orders/${id}/pdf/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" as const, gap: "8px", background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                ⬇ Download Invoice PDF
              </a>
            </div>
          </div> */}

          {/* ── SECTION 1: NOTES ── */}
          <div style={CardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={SectionHead}>NOTES</h3>
              <button onClick={() => { setEditingNote(true); setNoteText(order.order_notes ?? ""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>✏️</button>
            </div>

            {editingNote ? (
              <div>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Add note about this order…"
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #1A5CFF", borderRadius: "6px", fontSize: "13px", fontFamily: "var(--font-jakarta)", minHeight: "80px", resize: "vertical" as const, outline: "none", boxSizing: "border-box" as const }} />
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={handleSaveNote}
                    style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                    Save
                  </button>
                  <button onClick={() => setEditingNote(false)}
                    style={{ background: "none", border: "1px solid #E2E0DA", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: order.order_notes ? "#2A2830" : "#bbb", fontStyle: order.order_notes ? "normal" : "italic" as const, lineHeight: 1.65 }}>
                {order.order_notes || "No notes added yet"}
              </p>
            )}

            {(order.po_number || order.qb_invoice_id) && (
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #F4F3EF" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Additional Details</div>
                {order.po_number && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                    <span style={{ color: "#7A7880" }}>PO Number</span>
                    <span style={{ fontWeight: 600, color: "#2A2830" }}>{order.po_number}</span>
                  </div>
                )}
                {order.qb_invoice_id && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                    <span style={{ color: "#7A7880" }}>QB Invoice</span>
                    <span style={{ fontWeight: 600, color: "#059669" }}>#{order.qb_invoice_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 2: CUSTOMER ── */}
          <div style={CardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={SectionHead}>CUSTOMER</h3>
              <span onClick={() => router.push(`/admin/customers/${order.company_id}`)}
                style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, cursor: "pointer" }}>
                View Profile →
              </span>
            </div>

            {/* Avatar + company */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#1A5CFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "16px", flexShrink: 0 }}>
                {avatarInitial}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{order.customer_name ?? order.company_name}</div>
                {order.customer_name && <div style={{ fontSize: "12px", color: "#7A7880" }}>{order.company_name}</div>}
              </div>
            </div>

            {/* Contact */}
            {(order.customer_email || order.customer_phone) && (
              <div style={{ fontSize: "13px", marginBottom: "14px" }}>
                {order.customer_email && <div style={{ color: "#1A5CFF", marginBottom: "4px" }}>📧 {order.customer_email}</div>}
                {order.customer_phone && <div style={{ color: "#7A7880" }}>📞 {order.customer_phone}</div>}
              </div>
            )}

            {/* All orders link */}
            <div style={{ background: "#F4F3EF", borderRadius: "6px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" }}>
              <span style={{ color: "#7A7880" }}>Orders from this company: </span>
              <span onClick={() => router.push(`/admin/orders?company=${order.company_id}`)}
                style={{ fontWeight: 700, color: "#1A5CFF", cursor: "pointer" }}>
                View all →
              </span>
            </div>

            {/* Shipping Address */}
            {addr && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Shipping Address</div>
                <div style={{ fontSize: "13px", color: "#2A2830", lineHeight: 1.7 }}>
                  {addr.full_name && <div style={{ fontWeight: 600 }}>{addr.full_name}</div>}
                  {addr.address_line1 && <div>{addr.address_line1}</div>}
                  {addr.address_line2 && <div>{addr.address_line2}</div>}
                  {(addr.city || addr.state) && <div>{[addr.city, addr.state, zip].filter(Boolean).join(", ")}</div>}
                  <div>{addr.country ?? "United States"}</div>
                </div>
                {mapQuery && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, textDecoration: "none", display: "inline-block", marginTop: "6px" }}>
                    View map →
                  </a>
                )}
              </div>
            )}

            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Billing Address</div>
              <div style={{ fontSize: "13px", color: "#7A7880" }}>Same as shipping address</div>
            </div>

            {/* Company Registration Info */}
            {companyReg && (companyReg.company_email || companyReg.address_line1 || companyReg.city || companyReg.secondary_business || companyReg.ppac_number || companyReg.how_heard) && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginTop: "4px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "10px" }}>Company Registration Info</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", fontSize: "13px" }}>
                  {companyReg.company_email && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Company Email: </span><span style={{ color: "#2A2830", fontWeight: 600 }}>{companyReg.company_email}</span></div>
                  )}
                  {(companyReg.address_line1 || companyReg.city) && (
                    <div>
                      <span style={{ color: "#7A7880", fontSize: "11px" }}>Address: </span>
                      <span style={{ color: "#2A2830" }}>
                        {[companyReg.address_line1, companyReg.address_line2, companyReg.city, companyReg.state_province, companyReg.postal_code, companyReg.country].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {companyReg.secondary_business && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Secondary Business: </span><span style={{ color: "#2A2830" }}>{companyReg.secondary_business}</span></div>
                  )}
                  {companyReg.estimated_annual_volume && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Est. Annual Volume: </span><span style={{ color: "#2A2830" }}>{companyReg.estimated_annual_volume}</span></div>
                  )}
                  {(companyReg.ppac_number || companyReg.ppai_number || companyReg.asi_number) && (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
                      {companyReg.ppac_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>PPAC: </span><span style={{ color: "#2A2830" }}>{companyReg.ppac_number}</span></span>}
                      {companyReg.ppai_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>PPAI: </span><span style={{ color: "#2A2830" }}>{companyReg.ppai_number}</span></span>}
                      {companyReg.asi_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>ASI: </span><span style={{ color: "#2A2830" }}>{companyReg.asi_number}</span></span>}
                    </div>
                  )}
                  {(companyReg.num_employees || companyReg.num_sales_reps) && (
                    <div style={{ display: "flex", gap: "16px" }}>
                      {companyReg.num_employees && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>Employees: </span><span style={{ color: "#2A2830" }}>{companyReg.num_employees}</span></span>}
                      {companyReg.num_sales_reps && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>Sales Reps: </span><span style={{ color: "#2A2830" }}>{companyReg.num_sales_reps}</span></span>}
                    </div>
                  )}
                  {companyReg.how_heard && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>How heard: </span><span style={{ color: "#2A2830" }}>{companyReg.how_heard}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION 3: CONVERSION SUMMARY ── */}
          <div style={{ ...CardStyle, marginBottom: 0 }}>
            <h3 style={{ ...SectionHead, marginBottom: "14px" }}>CONVERSION SUMMARY</h3>

            {/* Key metrics */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>🛒</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    {customerStats?.total_orders ?? 1} total orders
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>from this customer</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>💰</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    ${customerStats ? Number(customerStats.total_spent).toFixed(2) : Number(order.total).toFixed(2)} lifetime value
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>total revenue from customer</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>📅</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    {customerStats?.created_at
                      ? new Date(customerStats.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                      : "New Customer"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>customer since</div>
                </div>
              </div>
            </div>

            {/* Order source */}
            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "10px" }}>Order Source</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830", marginBottom: "6px" }}>
                <span>🌐</span><span>Online Store — Direct</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830" }}>
                <span>📱</span><span>Device: Desktop</span>
              </div>
            </div>

            {/* Pricing tier */}
            {order.pricing_tier && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Pricing Tier</div>
                <span style={{ background: "rgba(26,92,255,.1)", color: "#1A5CFF", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
                  {order.pricing_tier}
                </span>
              </div>
            )}

            {/* Payment */}
            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Payment</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                <span style={{ color: "#7A7880" }}>Method</span>
                <span style={{ fontWeight: 600, color: "#2A2830" }}>{order.payment_method === "ach" ? "ACH / Bank Transfer" : (order.payment_method ?? "Card")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                <span style={{ color: "#7A7880" }}>Status</span>
                <span style={{ background: order.payment_status === "paid" ? "rgba(5,150,105,.1)" : "rgba(217,119,6,.1)", color: order.payment_status === "paid" ? "#059669" : "#D97706", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
                  {order.payment_status.toUpperCase()}
                </span>
              </div>
              {order.payment_method === "ach" && (
                <div style={{ marginTop: "10px", padding: "12px 14px", background: "#F4F3EF", borderRadius: "8px", fontSize: "12px", display: "flex", flexDirection: "column" as const, gap: "4px" }}>
                  {order.ach_bank_name && <div><span style={{ color: "#7A7880" }}>Bank: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_bank_name}</span></div>}
                  {order.ach_account_holder && <div><span style={{ color: "#7A7880" }}>Holder: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_account_holder}</span></div>}
                  {order.ach_account_last4 && <div><span style={{ color: "#7A7880" }}>Account: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>****{order.ach_account_last4}</span></div>}
                  {order.ach_account_type && <div><span style={{ color: "#7A7880" }}>Type: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_account_type.charAt(0).toUpperCase() + order.ach_account_type.slice(1)}</span></div>}
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ background: order.ach_verified ? "rgba(5,150,105,.12)" : "rgba(217,119,6,.12)", color: order.ach_verified ? "#059669" : "#D97706", padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
                      {order.ach_verified ? "Verified" : "Pending Verification"}
                    </span>
                    {!order.ach_verified && (
                      <button onClick={handleVerifyAch} disabled={isVerifyingAch}
                        style={{ background: "#059669", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: isVerifyingAch ? .6 : 1 }}>
                        {isVerifyingAch ? "Verifying…" : "Mark as Verified"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {order.payment_method !== "ach" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginTop: "5px" }}>
                  <span style={{ color: "#7A7880" }}>QB Invoice</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: 600, color: order.qb_invoice_id ? "#059669" : "#aaa" }}>
                      {order.qb_invoice_id ? `#${order.qb_invoice_id}` : "Not synced"}
                    </span>
                    {!order.qb_invoice_id && (
                      <button
                        onClick={handleSyncQB}
                        disabled={isSyncing}
                        style={{ background: "#1B3A5C", color: "#fff", border: "none", padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: isSyncing ? "not-allowed" : "pointer", opacity: isSyncing ? 0.6 : 1 }}>
                        {isSyncing ? "Syncing…" : "Sync Now"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
