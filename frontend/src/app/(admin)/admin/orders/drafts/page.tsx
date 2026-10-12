"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";
import { ask } from "@/lib/dialog";
import { OrdersFrame, useOrdersOverview } from "@/components/admin/orders/OrdersFrame";

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
  confirmed: { bg: "rgba(26,26,26,.1)",  color: "#1A1A1A" },
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
  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-jakarta)" };

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #E3E3E3", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: "-0.01em", margin: 0 }}>Create Draft Order</h2>
            <div style={{ display: "flex", gap: "6px" }}>
              {STEPS.map((label, i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, background: step === i + 1 ? "#1A1A1A" : step > i + 1 ? "#059669" : "#E3E3E3", color: step >= i + 1 ? "#fff" : "#aaa" }}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: step === i + 1 ? "#1A1A1A" : "#aaa" }}>{label}</span>
                  {i < 2 && <span style={{ color: "#E3E3E3", fontSize: "12px" }}>›</span>}
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
                <div style={{ border: "1.5px solid #E3E3E3", borderTop: "none", borderRadius: "0 0 7px 7px", maxHeight: "200px", overflowY: "auto", background: "#fff" }}>
                  {companies.map(c => (
                    <div key={c.id} onClick={async () => {
                      setCompanyId(c.id); setCompanyName(c.name); setCompanySearch(c.name); setCompanies([]);
                      try {
                        const detail = await apiClient.get<{ discount_percent?: number | null }>(`/api/v1/admin/companies/${c.id}`);
                        setCompanyDiscount(detail?.discount_percent ?? 0);
                      } catch { setCompanyDiscount(0); }
                    }}
                      style={{ padding: "10px 12px", fontSize: "13px", cursor: "pointer", color: "#2A2830" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F6F6F7")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                    >{c.name}</div>
                  ))}
                </div>
              )}
              {companyId && (
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.2)", borderRadius: "8px", fontSize: "13px", color: "#059669", fontWeight: 600 }}>
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
                  <div style={{ border: "1px solid #E3E3E3", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "#F6F6F7", borderBottom: "1px solid #E3E3E3" }}>
                      {selectedProduct.primary_image?.url_thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedProduct.primary_image.url_thumbnail} alt="" style={{ width: "36px", height: "36px", objectFit: "contain", borderRadius: "6px", background: "#fff" }} />
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
                          <tr style={{ background: "#F6F6F7" }}>
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
                            <tr key={v.id} style={{ borderBottom: "1px solid #F6F6F7" }}>
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
                                  style={{ width: "56px", padding: "4px 6px", border: "1px solid #E3E3E3", borderRadius: "6px", fontSize: "12px", textAlign: "center" }}
                                />
                              </td>
                            </tr>
                          ); })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "10px 14px", borderTop: "1px solid #E3E3E3", display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={addLineItems}
                        disabled={!Object.values(variantQtys).some(q => parseInt(q, 10) > 0)}
                        style={{ padding: "8px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: !Object.values(variantQtys).some(q => parseInt(q, 10) > 0) ? 0.4 : 1 }}>
                        Add to Order
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ maxHeight: "340px", overflowY: "auto", border: "1px solid #E3E3E3", borderRadius: "8px" }}>
                    {loadingProducts ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Loading…</div>
                    ) : products.length === 0 ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No products found</div>
                    ) : products.map((p, i) => (
                      <div key={p.id} onClick={() => { setSelectedProduct(p); setVariantQtys({}); }}
                        style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", cursor: "pointer", borderBottom: i < products.length - 1 ? "1px solid #F6F6F7" : "none", background: "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F6F6F7")}
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
              <div style={{ border: "1px solid #E3E3E3", borderRadius: "8px", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #E3E3E3", background: "#F6F6F7" }}>
                  <div style={{ fontFamily: "var(--font-bebas)", fontSize: "15px", letterSpacing: "-0.01em", color: "#2A2830" }}>Order Items</div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>{lineItems.length} line items</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                  {lineItems.length === 0 ? (
                    <div style={{ padding: "24px 14px", textAlign: "center", color: "#aaa", fontSize: "12px" }}>No items added yet</div>
                  ) : lineItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "8px 14px", borderBottom: "1px solid #F6F6F7" }}>
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
                  <div style={{ padding: "10px 14px", borderTop: "1px solid #E3E3E3", background: "#F6F6F7" }}>
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
              <div style={{ background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px" }}>Company</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#2A2830" }}>{companyName}</div>
              </div>

              {lineItems.length > 0 && (
                <div style={{ border: "1px solid #E3E3E3", borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#F6F6F7" }}>
                        {["Product", "Variant", "Qty", "Unit Price", "Total"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F6F6F7" }}>
                          <td style={{ padding: "8px 12px", color: "#2A2830", fontWeight: 600 }}>{item.productName}</td>
                          <td style={{ padding: "8px 12px", color: "#7A7880" }}>{[item.color, item.size].filter(Boolean).join(" / ")}</td>
                          <td style={{ padding: "8px 12px", color: "#2A2830" }}>{item.qty}</td>
                          <td style={{ padding: "8px 12px", color: "#2A2830" }}>${item.price.toFixed(2)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 700, color: "#2A2830" }}>${(item.qty * item.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F6F6F7" }}>
                        <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 700, textAlign: "right", fontSize: "13px" }}>Order Total</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>${orderTotal.toFixed(2)}</td>
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
        <div style={{ display: "flex", gap: "10px", padding: "16px 24px", borderTop: "1px solid #E3E3E3", flexShrink: 0 }}>
          <button onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2 | 3)}
            style={{ flex: 1, padding: "10px", border: "1.5px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button
              disabled={step === 1 && !companyId}
              onClick={() => setStep(s => (s + 1) as 2 | 3)}
              style={{ flex: 2, padding: "10px", background: (step === 1 && !companyId) ? "#E3E3E3" : "#1A1A1A", color: (step === 1 && !companyId) ? "#aaa" : "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: (step === 1 && !companyId) ? "not-allowed" : "pointer" }}>
              Continue →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving}
              style={{ flex: 2, padding: "10px", background: saving ? "#E3E3E3" : "#1A1A1A", color: saving ? "#aaa" : "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
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
  // The address is read with useSearchParams, which wants a boundary above it.
  return <Suspense fallback={null}><Drafts /></Suspense>;
}

function Drafts() {
  const router = useRouter();
  const sp = useSearchParams();
  const { overview, refresh } = useOrdersOverview();
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState("");

  // "New order" anywhere in Orders lands here with the form already open.
  useEffect(() => { if (sp.get("new") === "1") setShowCreate(true); }, [sp]);

  function closeCreate() {
    setShowCreate(false);
    if (sp.get("new")) router.replace("/admin/orders/drafts", { scroll: false });
  }

  async function load() {
    setIsLoading(true);
    try {
      // Filtered by the server. Pulling a page of pending orders and sifting it
      // here meant a store with more pending orders than that page stopped
      // seeing its own drafts.
      const data = await apiClient.get<{ items: DraftOrder[]; total: number }>(
        "/api/v1/admin/orders?drafts_only=true&status=pending&page_size=200"
      );
      setOrders(data?.items ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as { message?: string })?.message || "Could not load drafts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleConvert(o: DraftOrder) {
    const yes = await ask(
      `Confirm draft ${o.order_number} for ${o.company_name}? It becomes an order and the invoice for $${Number(o.total).toFixed(2)} is emailed to the customer.`,
      { title: "Confirm this draft", ok: "Confirm and send invoice" },
    );
    if (!yes) return;
    setBusyId(o.id);
    try {
      await apiClient.patch(`/api/v1/admin/orders/${o.id}`, { status: "confirmed" });
      // Read again rather than patch in place: a confirmed draft is no longer
      // pending, so the list should stop showing it as one.
      await load();
      refresh();
    } catch (e) {
      setLoadError((e as { message?: string })?.message || "Could not confirm this draft.");
    }
    setBusyId("");
  }

  return (
    <OrdersFrame active="drafts" overview={overview}>
      {loadError && <div className="pc-flash" data-bad="" role="status">{loadError}</div>}
      {showCreate && (
        <CreateDraftModal
          onClose={closeCreate}
          onSuccess={(id) => {
            setShowCreate(false);
            router.push(`/admin/orders/${id}`);
          }}
        />
      )}

      <div className="pc-card">
        <div className="pc-card-head">
          <div>
            <h2 className="pc-h2">Drafts</h2>
            <div className="pc-sub-line">Orders you are writing for a customer. Confirming one makes it an order and emails the invoice.</div>
          </div>
          <button type="button" className="pc-btn" onClick={() => setShowCreate(true)}>Create a draft</button>
        </div>
        <div className="pc-scroll-x">
          <table className="pc-table" style={{ minWidth: "720px" }}>
            <thead>
              <tr><th>Draft</th><th>Customer</th><th>PO</th><th className="pc-num">Items</th><th className="pc-num">Total</th><th>Created</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {isLoading && orders.length === 0 && (
                <tr><td colSpan={7}><div className="at-skel" style={{ height: "18px", width: "60%", borderRadius: "6px" }} /></td></tr>
              )}
              {!isLoading && orders.length === 0 && (
                <tr><td colSpan={7} className="pc-empty">No drafts. Use &quot;New order&quot; to write one for a customer.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} data-draft={o.order_number}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    <Link href={`/admin/orders/${o.id}`} style={{ color: "inherit", textDecoration: "none" }}>{o.order_number}</Link>
                  </td>
                  <td>{o.company_name}</td>
                  <td style={{ color: "var(--pc-muted)" }}>{o.po_number ?? ""}</td>
                  <td className="pc-num">{o.item_count}</td>
                  <td className="pc-num" style={{ fontWeight: 600 }}>${Number(o.total).toFixed(2)}</td>
                  <td style={{ color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="pc-row-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button type="button" className="pc-btn" style={{ height: "36px" }} disabled={busyId === o.id || o.item_count === 0}
                        title={o.item_count === 0 ? "Add a product to this draft first" : undefined} onClick={() => handleConvert(o)}>
                        {busyId === o.id ? "Confirming…" : "Confirm"}
                      </button>
                      <Link href={`/admin/orders/${o.id}`} className="pc-link">Open</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pc-table-foot"><span>{orders.length} {orders.length === 1 ? "draft" : "drafts"}</span></div>
      </div>
    </OrdersFrame>
  );
}
