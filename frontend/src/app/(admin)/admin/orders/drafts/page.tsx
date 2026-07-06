"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";
import { FileTextIcon } from "@/components/ui/icons";

interface DraftOrder {
  id: string;
  order_number: string;
  company_name: string;
  status: string;
  payment_status: string;
  po_number: string | null;
  total: string;
  item_count: number;
  created_at: string;
}

interface CompanyOption { id: string; name: string; }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "rgba(217,119,6,.1)",  color: "#D97706" },
  confirmed: { bg: "rgba(26,92,255,.1)",  color: "#1A5CFF" },
  cancelled: { bg: "rgba(232,36,42,.1)",  color: "#E8242A" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "rgba(0,0,0,.06)", color: "#555" };
  return (
    <span style={{ background: s.bg, color: s.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" as const }}>
      {status}
    </span>
  );
}

// ── Types for draft modal ──────────────────────────────────────────────────────

interface DraftProduct {
  id: string; name: string; slug: string;
  primary_image?: { url_medium?: string; url_thumbnail?: string } | null;
  variants?: { id: string; color: string | null; size: string | null; retail_price: string; stock_quantity?: number }[];
  categories?: { name: string }[];
}

interface DraftLineItem {
  variantId: string; productId: string; productName: string;
  color: string | null; size: string | null; price: number; qty: number;
}

// ── Create Draft Modal (3-step) ────────────────────────────────────────────────

function CreateDraftModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-jakarta)" };

  // Step 1
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyDiscount, setCompanyDiscount] = useState(0); // percent

  // Step 2
  const [products, setProducts] = useState<DraftProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<DraftProduct | null>(null);
  const [variantQtys, setVariantQtys] = useState<Record<string, string>>({});
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Step 3
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Company search
  useEffect(() => {
    adminService.listCompanies({ q: companySearch || undefined, page_size: 50 })
      .then((d: unknown) => { const data = d as { items: CompanyOption[] }; setCompanies(data.items ?? []); })
      .catch(() => {});
  }, [companySearch]);

  // Product search
  useEffect(() => {
    if (step !== 2) return;
    setLoadingProducts(true);
    adminService.listProducts({ q: productSearch || undefined })
      .then((res: unknown) => {
        const r = res as { items?: DraftProduct[] } | DraftProduct[] | null;
        const items: DraftProduct[] = Array.isArray(r) ? r : (r as any)?.items ?? [];
        setProducts(items);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [step, productSearch]);

  function applyDiscount(price: number) {
    if (!companyDiscount) return price;
    return price * (1 - companyDiscount / 100);
  }

  function addLineItems() {
    if (!selectedProduct) return;
    const toAdd: DraftLineItem[] = [];
    for (const [vid, qtyStr] of Object.entries(variantQtys)) {
      const qty = parseInt(qtyStr, 10);
      if (!qty || qty <= 0) continue;
      const variant = selectedProduct.variants?.find(v => v.id === vid);
      if (!variant) continue;
      const discountedPrice = applyDiscount(parseFloat(variant.retail_price) || 0);
      const existing = lineItems.findIndex(l => l.variantId === vid);
      if (existing >= 0) {
        setLineItems(prev => prev.map((l, i) => i === existing ? { ...l, qty: l.qty + qty } : l));
      } else {
        toAdd.push({ variantId: vid, productId: selectedProduct.id, productName: selectedProduct.name, color: variant.color, size: variant.size, price: discountedPrice, qty });
      }
    }
    if (toAdd.length > 0) setLineItems(prev => [...prev, ...toAdd]);
    setVariantQtys({});
    setSelectedProduct(null);
  }

  const orderTotal = lineItems.reduce((s, l) => s + l.price * l.qty, 0);

  async function handleCreate() {
    if (!companyId) { setError("Please select a company."); return; }
    setSaving(true); setError(null);
    try {
      const draft = await apiClient.post<{ id: string }>("/api/v1/admin/orders/draft", {
        company_id: companyId,
        po_number: poNumber || undefined,
        notes: notes || undefined,
      });
      for (const item of lineItems) {
        await apiClient.post(`/api/v1/admin/orders/${draft.id}/items`, {
          variant_id: item.variantId,
          quantity: item.qty,
          unit_price: item.price,
        });
      }
      onSuccess(draft.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create draft order");
    } finally {
      setSaving(false);
    }
  }

  const STEPS = ["Company", "Products", "Review"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: step === 2 ? "860px" : "560px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #E2E0DA", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em", margin: 0 }}>CREATE DRAFT ORDER</h2>
            <div style={{ display: "flex", gap: "6px" }}>
              {STEPS.map((label, i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, background: step === i + 1 ? "#1A5CFF" : step > i + 1 ? "#059669" : "#E2E0DA", color: step >= i + 1 ? "#fff" : "#aaa" }}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: step === i + 1 ? "#1A5CFF" : "#aaa" }}>{label}</span>
                  {i < 2 && <span style={{ color: "#E2E0DA", fontSize: "12px" }}>›</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#7A7880", lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {error && <div style={{ background: "rgba(232,36,42,.08)", border: "1px solid rgba(232,36,42,.2)", borderRadius: "6px", padding: "10px 14px", fontSize: "13px", color: "#E8242A", marginBottom: "16px" }}>{error}</div>}

          {/* ── Step 1: Company ── */}
          {step === 1 && (
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "5px" }}>Select Company *</label>
              <input style={inp} placeholder="Search company…" value={companySearch} onChange={e => { setCompanySearch(e.target.value); setCompanyId(""); setCompanyName(""); }} />
              {companies.length > 0 && !companyId && (
                <div style={{ border: "1.5px solid #E2E0DA", borderTop: "none", borderRadius: "0 0 7px 7px", maxHeight: "200px", overflowY: "auto", background: "#fff" }}>
                  {companies.map(c => (
                    <div key={c.id} onClick={async () => {
                      setCompanyId(c.id); setCompanyName(c.name); setCompanySearch(c.name); setCompanies([]);
                      try {
                        const detail = await apiClient.get<{ discount_percent?: number | null }>(`/api/v1/admin/companies/${c.id}`);
                        setCompanyDiscount(detail?.discount_percent ?? 0);
                      } catch { setCompanyDiscount(0); }
                    }}
                      style={{ padding: "10px 12px", fontSize: "13px", cursor: "pointer", color: "#2A2830" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F4F3EF")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                    >{c.name}</div>
                  ))}
                </div>
              )}
              {companyId && (
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.2)", borderRadius: "7px", fontSize: "13px", color: "#059669", fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  {companyName} selected
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Products ── */}
          {step === 2 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", minHeight: "400px" }}>
              {/* Left: browse */}
              <div>
                <input style={{ ...inp, marginBottom: "12px" }} placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)} />

                {selectedProduct ? (
                  <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "#F4F3EF", borderBottom: "1px solid #E2E0DA" }}>
                      {selectedProduct.primary_image?.url_thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedProduct.primary_image.url_thumbnail} alt="" style={{ width: "36px", height: "36px", objectFit: "contain", borderRadius: "4px", background: "#fff" }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>{selectedProduct.name}</div>
                        <div style={{ fontSize: "11px", color: "#7A7880" }}>{selectedProduct.variants?.length ?? 0} variants</div>
                      </div>
                      <button onClick={() => { setSelectedProduct(null); setVariantQtys({}); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#7A7880" }}>✕ back</button>
                    </div>
                    <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ background: "#FAFAFA" }}>
                            {["Color", "Size", "Price", "Qty"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...(selectedProduct.variants ?? [])].sort((a, b) => {
                            const SIZE_ORDER = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
                            const sizeSort = (x: string | null, y: string | null) => {
                              const ai = SIZE_ORDER.indexOf((x ?? '').toUpperCase());
                              const bi = SIZE_ORDER.indexOf((y ?? '').toUpperCase());
                              if (ai === -1 && bi === -1) return (x ?? '').localeCompare(y ?? '');
                              if (ai === -1) return 1;
                              if (bi === -1) return -1;
                              return ai - bi;
                            };
                            const colorCmp = (a.color ?? '').localeCompare(b.color ?? '');
                            return colorCmp !== 0 ? colorCmp : sizeSort(a.size, b.size);
                          }).map(v => {
                            const retail = parseFloat(v.retail_price);
                            const discounted = applyDiscount(retail);
                            const hasDiscount = companyDiscount > 0;
                            return (
                            <tr key={v.id} style={{ borderBottom: "1px solid #F4F3EF" }}>
                              <td style={{ padding: "8px 12px", color: "#2A2830" }}>{v.color ?? "—"}</td>
                              <td style={{ padding: "8px 12px", color: "#2A2830" }}>{v.size ?? "—"}</td>
                              <td style={{ padding: "8px 12px", color: "#2A2830" }}>
                                {hasDiscount ? (
                                  <><span style={{ textDecoration: "line-through", color: "#bbb", fontSize: "11px" }}>${retail.toFixed(2)}</span>{" "}<span style={{ color: "#059669", fontWeight: 700 }}>${discounted.toFixed(2)}</span></>
                                ) : `$${retail.toFixed(2)}`}
                              </td>
                              <td style={{ padding: "8px 12px" }}>
                                <input type="number" min="0" placeholder="0"
                                  value={variantQtys[v.id] ?? ""}
                                  onChange={e => setVariantQtys(prev => ({ ...prev, [v.id]: e.target.value }))}
                                  style={{ width: "56px", padding: "4px 6px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", textAlign: "center" }}
                                />
                              </td>
                            </tr>
                          ); })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "10px 14px", borderTop: "1px solid #E2E0DA", display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={addLineItems}
                        disabled={!Object.values(variantQtys).some(q => parseInt(q, 10) > 0)}
                        style={{ padding: "8px 18px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: !Object.values(variantQtys).some(q => parseInt(q, 10) > 0) ? 0.4 : 1 }}>
                        Add to Order
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ maxHeight: "340px", overflowY: "auto", border: "1px solid #E2E0DA", borderRadius: "8px" }}>
                    {loadingProducts ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Loading…</div>
                    ) : products.length === 0 ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No products found</div>
                    ) : products.map((p, i) => (
                      <div key={p.id} onClick={() => { setSelectedProduct(p); setVariantQtys({}); }}
                        style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", cursor: "pointer", borderBottom: i < products.length - 1 ? "1px solid #F4F3EF" : "none", background: "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F4F3EF")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "13px", color: "#2A2830", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ fontSize: "11px", color: "#7A7880" }}>{p.variants?.length ?? 0} variants</div>
                        </div>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#aaa" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: cart summary */}
              <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E0DA", background: "#F4F3EF" }}>
                  <div style={{ fontFamily: "var(--font-bebas)", fontSize: "15px", letterSpacing: ".06em", color: "#2A2830" }}>ORDER ITEMS</div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>{lineItems.length} line items</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                  {lineItems.length === 0 ? (
                    <div style={{ padding: "24px 14px", textAlign: "center", color: "#aaa", fontSize: "12px" }}>No items added yet</div>
                  ) : lineItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "8px 14px", borderBottom: "1px solid #F4F3EF" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#2A2830", lineHeight: 1.3 }}>{item.productName}</div>
                        <div style={{ fontSize: "11px", color: "#7A7880" }}>{[item.color, item.size].filter(Boolean).join(" / ")}</div>
                        <div style={{ fontSize: "11px", color: "#2A2830" }}>{item.qty} × ${item.price.toFixed(2)}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>${(item.qty * item.price).toFixed(2)}</div>
                        <button onClick={() => setLineItems(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "12px", padding: 0 }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                {lineItems.length > 0 && (
                  <div style={{ padding: "10px 14px", borderTop: "1px solid #E2E0DA", background: "#FAFAFA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                      <span>Total</span>
                      <span>${orderTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <div>
              <div style={{ background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Company</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#2A2830" }}>{companyName}</div>
              </div>

              {lineItems.length > 0 && (
                <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#FAFAFA" }}>
                        {["Product", "Variant", "Qty", "Unit Price", "Total"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                          <td style={{ padding: "8px 12px", color: "#2A2830", fontWeight: 600 }}>{item.productName}</td>
                          <td style={{ padding: "8px 12px", color: "#7A7880" }}>{[item.color, item.size].filter(Boolean).join(" / ")}</td>
                          <td style={{ padding: "8px 12px", color: "#2A2830" }}>{item.qty}</td>
                          <td style={{ padding: "8px 12px", color: "#2A2830" }}>${item.price.toFixed(2)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 700, color: "#2A2830" }}>${(item.qty * item.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F4F3EF" }}>
                        <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 700, textAlign: "right", fontSize: "13px" }}>Order Total</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: "14px", color: "#1A5CFF" }}>${orderTotal.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "5px" }}>PO Number (optional)</label>
                <input style={inp} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Customer purchase order #" />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "5px" }}>Notes (optional)</label>
                <textarea style={{ ...inp, resize: "vertical", minHeight: "64px" }} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: "10px", padding: "16px 24px", borderTop: "1px solid #E2E0DA", flexShrink: 0 }}>
          <button onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2 | 3)}
            style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button
              disabled={step === 1 && !companyId}
              onClick={() => setStep(s => (s + 1) as 2 | 3)}
              style={{ flex: 2, padding: "10px", background: (step === 1 && !companyId) ? "#E2E0DA" : "#1A5CFF", color: (step === 1 && !companyId) ? "#aaa" : "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: (step === 1 && !companyId) ? "not-allowed" : "pointer" }}>
              Continue →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving}
              style={{ flex: 2, padding: "10px", background: saving ? "#E2E0DA" : "#1A5CFF", color: saving ? "#aaa" : "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Creating…" : "Create Draft Order"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DraftOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const data = await apiClient.get<{ items: DraftOrder[]; total: number }>(
        "/api/v1/admin/orders?status=pending&page_size=100"
      );
      const drafts = (data?.items ?? []).filter(o => o.order_number.startsWith("DRAFT-"));
      setOrders(drafts);
      setTotal(drafts.length);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleConvert(orderId: string) {
    try {
      await apiClient.patch(`/api/v1/admin/orders/${orderId}`, { status: "confirmed" });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "confirmed" } : o));
    } catch { /* ignore */ }
  }

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {showCreate && (
        <CreateDraftModal
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            router.push(`/admin/orders/${id}`);
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>DRAFT ORDERS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Pending orders awaiting confirmation · {total} total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
          + Create Draft
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#FAFAF8", borderBottom: "2px solid #E2E0DA" }}>
              {["Order #", "Company", "Status", "PO #", "Items", "Total", "Created", "Actions"].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: h === "Total" ? "right" as const : "left" as const, fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && orders.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "56px", textAlign: "center" as const }}>
                  <div style={{ marginBottom: "10px" }}><FileTextIcon size={32} color="#aaa" /></div>
                  <div style={{ fontSize: "14px", color: "#aaa", fontWeight: 600 }}>No draft orders</div>
                  <div style={{ fontSize: "12px", color: "#bbb", marginTop: "4px" }}>Pending orders will appear here</div>
                </td>
              </tr>
            ) : orders.map((o, i) => (
              <tr key={o.id}
                style={{ borderBottom: i < orders.length - 1 ? "1px solid #F0EDE8" : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "13px 16px" }}>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: "#1A5CFF", textDecoration: "none", fontFamily: "monospace", fontSize: "12px", fontWeight: 700 }}>
                    {o.order_number}
                  </Link>
                </td>
                <td style={{ padding: "13px 16px", color: "#2A2830", fontWeight: 600 }}>{o.company_name}</td>
                <td style={{ padding: "13px 16px" }}><StatusBadge status={o.status} /></td>
                <td style={{ padding: "13px 16px", color: "#7A7880" }}>{o.po_number ?? "—"}</td>
                <td style={{ padding: "13px 16px", color: "#2A2830" }}>{o.item_count}</td>
                <td style={{ padding: "13px 16px", textAlign: "right" as const, fontWeight: 700, color: "#2A2830" }}>${Number(o.total).toFixed(2)}</td>
                <td style={{ padding: "13px 16px", color: "#7A7880" }}>{new Date(o.created_at).toLocaleDateString()}</td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
                    {o.status === "pending" && (
                      <button onClick={() => handleConvert(o.id)}
                        style={{ background: "rgba(5,150,105,.1)", color: "#059669", border: "none", padding: "5px 12px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                        ✓ Confirm
                      </button>
                    )}
                    <Link href={`/admin/orders/${o.id}`}
                      style={{ background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", padding: "5px 12px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, textDecoration: "none" }}>
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
