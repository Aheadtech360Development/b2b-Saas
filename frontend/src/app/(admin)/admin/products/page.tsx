"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import type { ProductDetail } from "@/types/product.types";
import { ImportProductsModal } from "@/components/admin/ImportProductsModal";
import { SearchIcon, DownloadIcon, EditIcon, TrashIcon } from "@/components/ui/icons";

// ── Style constants ────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: "12px 16px", textAlign: "left", fontSize: "11px",
  textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
};
const bulkBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.3)",
  padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
};
const pageBtn: React.CSSProperties = {
  padding: "7px 12px", border: "1px solid #E6E6E6", borderRadius: "9px",
  background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "10px 16px", border: "1px solid #E6E6E6", borderRadius: "10px", background: "#fff",
  fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
  fontFamily: "var(--font-jakarta)", color: "#1A1A1A",
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "10px",
  fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-jakarta)",
};

// Bulk edit modal cell label
const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};

export default function AdminProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const loadSeqRef = useRef(0);

  // Bulk edit state: productId → partial edits
  const [bulkEdits, setBulkEdits] = useState<Record<string, Record<string, string>>>({});
  const bulkFields = ["status", "vendor", "product_type"] as const;

  async function load(p = page) {
    const seq = ++loadSeqRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await adminService.listProducts({
        q: search || undefined,
        status: statusFilter || undefined,
        page: p,
      });
      if (seq !== loadSeqRef.current) return; // stale — a newer request is in flight
      const items = data ?? [];
      setProducts(items);
      setTotal(items.length < pageSize ? (p - 1) * pageSize + items.length : p * pageSize + 1);
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to load products";
      setLoadError(msg);
      setProducts([]);
    } finally {
      if (seq === loadSeqRef.current) setIsLoading(false);
    }
  }

  // When filters change, reset to page 1 and reload immediately
  useEffect(() => { setPage(1); load(1); }, [search, statusFilter]); // eslint-disable-line
  // When page changes (pagination), reload with current filters
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  const selectedProducts = useMemo(
    () => products.filter(p => selectedIds.includes(p.id)),
    [products, selectedIds]
  );

  async function handleBulkAction(action: string) {
    if (!selectedIds.length) return;
    await adminService.bulkAction(selectedIds, action);
    setSelectedIds([]);
    load();
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm(`Permanently delete ${selectedIds.length} product(s)? This cannot be undone.`)) return;
    try {
      const results = await Promise.allSettled(selectedIds.map(id => adminService.deleteProduct(id)));
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length > 0) {
        const reason = (failed[0] as PromiseRejectedResult).reason;
        alert(`Delete failed: ${reason instanceof Error ? reason.message : "Server error. The product may be referenced by existing orders."}`);
      }
    } catch (err: unknown) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "Server error."}`);
    }
    setSelectedIds([]);
    load();
  }

  async function handleBulkSave() {
    await Promise.all(
      Object.entries(bulkEdits).map(([id, changes]) =>
        Object.keys(changes).length > 0
          ? adminService.updateProduct(id, changes)
          : Promise.resolve()
      )
    );
    setBulkEdits({});
    setShowBulkEdit(false);
    load();
  }

  function setBulkEdit(productId: string, field: string, value: string) {
    setBulkEdits(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? {}), [field]: value },
    }));
  }

  function initBulkEdits() {
    const initial: Record<string, Record<string, string>> = {};
    selectedProducts.forEach(p => {
      initial[p.id] = {
        status: p.status,
        vendor: p.vendor ?? "",
        product_type: p.product_type ?? "",
      };
    });
    setBulkEdits(initial);
  }

  const totalInventory = (p: ProductDetail) =>
    p.variants.reduce((s, v) => s + (v.stock_quantity ?? 0), 0);

  const openProduct = (slug: string) => router.push(`/admin/products/${slug}/edit`);
  const STATUS_TABS: { id: string; label: string }[] = [
    { id: "", label: "All" }, { id: "active", label: "Active" },
    { id: "draft", label: "Draft" }, { id: "archived", label: "Archived" },
  ];
  const statusTone = (st: string) =>
    st === "active" ? { bg: "rgba(5,150,105,.1)", fg: "#059669", label: "Active" }
      : st === "draft" ? { bg: "rgba(156,163,175,.16)", fg: "#6B7280", label: "Draft" }
        : { bg: "rgba(232,36,42,.1)", fg: "#E8242A", label: "Archived" };
  const allChecked = selectedIds.length === products.length && products.length > 0;

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#9A98A0", letterSpacing: ".04em", marginBottom: "6px" }}>Catalogue</div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>Products</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px" }}>{products.length} item{products.length === 1 ? "" : "s"} on this page</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setShowImport(true)} style={ghostBtn}>
            <DownloadIcon size={14} color="#2A2830" /> Import
          </button>
          <button onClick={() => adminService.exportProductsCsv()} style={ghostBtn}>↓ Export</button>
          <button onClick={() => router.push("/admin/products/new")} style={primaryBtn}>+ Add Product</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", padding: "6px 6px 6px 8px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
        <div role="tablist" aria-label="Status" style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
          {STATUS_TABS.map(t => {
            const on = statusFilter === t.id;
            return (
              <button key={t.id || "all"} role="tab" aria-selected={on} onClick={() => setStatusFilter(t.id)} style={{
                padding: "7px 14px", borderRadius: "9px", border: "none", cursor: "pointer", fontSize: "13px",
                fontWeight: on ? 700 : 500, background: on ? "#1A1A1A" : "transparent", color: on ? "#fff" : "#5A5860",
                fontFamily: "var(--font-jakarta)",
              }}>{t.label}</button>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex" }}><SearchIcon size={14} color="#aaa" /></span>
          <input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1px solid transparent", background: "#F6F6F7", borderRadius: "10px", fontSize: "14px", fontFamily: "var(--font-jakarta)", boxSizing: "border-box", outline: "none" }}
          />
        </div>
      </div>

      {/* Bulk Toolbar */}
      {selectedIds.length > 0 && (
        <div style={{ position: "sticky", top: "env(safe-area-inset-top, 0px)", zIndex: 5, background: "#1A1A1A", color: "#fff", padding: "10px 16px", borderRadius: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", boxShadow: "0 6px 20px rgba(0,0,0,.15)" }}>
          <span style={{ fontWeight: 700, marginRight: "4px" }}>{selectedIds.length} selected</span>
          <button onClick={() => handleBulkAction("active")} style={bulkBtnStyle}>Set Active</button>
          <button onClick={() => handleBulkAction("draft")} style={bulkBtnStyle}>Set Draft</button>
          <button onClick={() => handleBulkAction("archived")} style={bulkBtnStyle}>Archive</button>
          <button
            onClick={() => { initBulkEdits(); setShowBulkEdit(true); }}
            style={{ ...bulkBtnStyle, background: "rgba(255,255,255,.2)", display: "inline-flex", alignItems: "center", gap: "5px" }}
          >
            <EditIcon size={13} color="#fff" /> Bulk Edit
          </button>
          <button
            onClick={handleBulkDelete}
            style={{ ...bulkBtnStyle, background: "rgba(232,36,42,.4)", display: "inline-flex", alignItems: "center", gap: "5px" }}
          >
            <TrashIcon size={13} color="#fff" /> Delete
          </button>
          <button
            onClick={() => setSelectedIds([])}
            aria-label="Clear selection"
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ background: "#fff", border: "1px solid #ECECEC", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 18px", borderBottom: "1px solid #F0F0F0", fontSize: "12px", color: "#9A98A0", fontWeight: 600 }}>
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allChecked}
            onChange={e => setSelectedIds(e.target.checked ? products.map(p => p.id) : [])}
          />
          <span>{allChecked ? "All on this page selected" : "Select all"}</span>
        </div>

        {isLoading && products.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`sk-${i}`} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid #F4F4F4" }}>
              <div className="at-skel" style={{ width: "14px", height: "14px" }} />
              <div className="at-skel" style={{ width: "56px", height: "56px", borderRadius: "12px" }} />
              <div style={{ flex: 1 }}>
                <div className="at-skel" style={{ height: "12px", width: `${40 + (i % 3) * 12}%`, marginBottom: "8px" }} />
                <div className="at-skel" style={{ height: "10px", width: "26%" }} />
              </div>
              <div className="at-skel" style={{ height: "22px", width: "70px", borderRadius: "20px" }} />
            </div>
          ))
        ) : loadError ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#E8242A", fontWeight: 600, marginBottom: "8px" }}>Failed to load products</div>
            <div style={{ fontSize: "12px", color: "#aaa", maxWidth: "480px", margin: "0 auto 16px" }}>{loadError}</div>
            <button onClick={() => load()} style={primaryBtn}>Retry</button>
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "24px" }}>👕</div>
            <div style={{ fontSize: "15px", color: "#1A1A1A", fontWeight: 700, marginBottom: "4px" }}>
              {search || statusFilter ? "No products match your filters" : "No products yet"}
            </div>
            <div style={{ fontSize: "13px", color: "#7A7880", marginBottom: "18px" }}>
              {search || statusFilter ? "Try a different search, or clear the filters to see everything." : "Add your first product to start selling."}
            </div>
            {search || statusFilter ? (
              <button onClick={() => { setSearch(""); setStatusFilter(""); }} style={ghostBtn}>Clear filters</button>
            ) : (
              <button onClick={() => router.push("/admin/products/new")} style={primaryBtn}>+ Add product</button>
            )}
          </div>
        ) : products.map(product => {
          const tone = statusTone(product.status);
          const stock = totalInventory(product);
          const checked = selectedIds.includes(product.id);
          const meta = [product.product_type, product.vendor].filter(Boolean).join(" · ");
          const category = [product.fabric, product.product_code, product.weight].filter(Boolean).join(" · ") || product.categories?.[0]?.name || "Apparel";
          return (
            <div
              key={product.id}
              onClick={() => openProduct(product.slug)}
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 18px", borderBottom: "1px solid #F4F4F4", cursor: "pointer", background: checked ? "#FAFAF7" : "#fff", transition: "background .15s", flexWrap: "wrap" }}
              onMouseEnter={e => { if (!checked) e.currentTarget.style.background = "#FAFAFA"; }}
              onMouseLeave={e => { e.currentTarget.style.background = checked ? "#FAFAF7" : "#fff"; }}
            >
              <span onClick={e => e.stopPropagation()} style={{ display: "flex" }}>
                <input
                  type="checkbox"
                  aria-label={`Select ${product.name}`}
                  checked={checked}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(prev => [...prev, product.id]);
                    else setSelectedIds(prev => prev.filter(id => id !== product.id));
                  }}
                />
              </span>
              <div style={{ width: "56px", height: "56px", borderRadius: "12px", overflow: "hidden", background: "#F4F2EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {product.images?.[0] ? (
                  <img src={product.images[0].url_thumbnail} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "20px", opacity: 0.4 }}>👕</span>
                )}
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                <div style={{ fontSize: "12px", color: "#8A8890", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {category}{meta ? ` · ${meta}` : ""}
                </div>
              </div>
              <div style={{ flex: "0 0 150px", textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: stock > 0 ? "#1A1A1A" : "#9A98A0" }}>{stock.toLocaleString()} in stock</div>
                <div style={{ fontSize: "11px", color: "#9A98A0", marginTop: "2px" }}>{product.variants?.length || 0} variants</div>
              </div>
              <span style={{ flex: "0 0 auto", padding: "5px 11px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: tone.bg, color: tone.fg, minWidth: "72px", textAlign: "center" }}>
                {tone.label}
              </span>
              <span aria-hidden style={{ color: "#C4C2C8", fontSize: "18px", flex: "0 0 auto" }}>›</span>
            </div>
          );
        })}

        {/* Pagination */}
        <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FCFCFC" }}>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>{products.length} products</span>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ ...pageBtn, opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
            <span style={{ padding: "6px 12px", fontSize: "13px", fontWeight: 600 }}>Page {page}</span>
            <button disabled={products.length < pageSize} onClick={() => setPage(p => p + 1)} style={{ ...pageBtn, opacity: products.length < pageSize ? 0.4 : 1 }}>Next →</button>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <ImportProductsModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load(); }}
        />
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "90%", maxWidth: "960px", maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E3E3E3", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "24px", color: "#2A2830", letterSpacing: "-0.01em" }}>
                BULK EDIT — {selectedIds.length} PRODUCTS
              </h2>
              <button onClick={() => setShowBulkEdit(false)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "12px" }}>
                💡 Tip: You can paste rows from Excel/Sheets (columns: Vendor, Type) directly into the table cells.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#F6F6F7", borderBottom: "1px solid #E3E3E3" }}>
                    {["Product", "Status", "Vendor", "Type"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody
                  onPaste={e => {
                    // Support pasting tab-separated data from Excel/Sheets
                    const text = e.clipboardData.getData("text");
                    if (!text.includes("\t") && !text.includes("\n")) return;
                    e.preventDefault();
                    const lines = text.trim().split("\n");
                    lines.forEach((line, i) => {
                      const product = selectedProducts[i];
                      if (!product) return;
                      const cols = line.split("\t");
                      const updates: Record<string, string> = {};
                      if (cols[0] !== undefined) updates.vendor = cols[0]!.trim();
                      if (cols[1] !== undefined) updates.product_type = cols[1]!.trim();
                      setBulkEdits(prev => ({
                        ...prev,
                        [product.id]: { ...(prev[product.id] ?? {}), ...updates },
                      }));
                    });
                  }}
                >
                  {selectedProducts.map(p => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #F6F6F7" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px", color: "#2A2830" }}>{p.name}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <select
                          value={bulkEdits[p.id]?.status ?? p.status}
                          onChange={e => setBulkEdit(p.id, "status", e.target.value)}
                          style={{ padding: "6px 10px", border: "1px solid #E3E3E3", borderRadius: "6px", fontSize: "12px" }}
                        >
                          <option value="active">Active</option>
                          <option value="draft">Draft</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <input
                          value={bulkEdits[p.id]?.vendor ?? (p.vendor ?? "")}
                          onChange={e => setBulkEdit(p.id, "vendor", e.target.value)}
                          placeholder="Vendor"
                          style={{ padding: "6px 8px", border: "1px solid #E3E3E3", borderRadius: "6px", fontSize: "12px", width: "120px" }}
                        />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <input
                          value={bulkEdits[p.id]?.product_type ?? (p.product_type ?? "")}
                          onChange={e => setBulkEdit(p.id, "product_type", e.target.value)}
                          placeholder="Type"
                          style={{ padding: "6px 8px", border: "1px solid #E3E3E3", borderRadius: "6px", fontSize: "12px", width: "120px" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #E3E3E3", display: "flex", gap: "10px", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
              <button
                onClick={() => setShowBulkEdit(false)}
                style={{ padding: "10px 20px", border: "1px solid #E3E3E3", borderRadius: "6px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSave}
                style={{ padding: "10px 20px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
