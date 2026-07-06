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
  padding: "5px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
};
const pageBtn: React.CSSProperties = {
  padding: "6px 12px", border: "1px solid #E2E0DA", borderRadius: "6px",
  background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer",
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

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>PRODUCTS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Manage your product catalog · {products.length} items</p>
        </div>
      </div>

      {/* Top Bar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: "240px", position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#aaa", display: "flex" }}><SearchIcon size={14} color="#aaa" /></span>
          <input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "14px", fontFamily: "var(--font-jakarta)", boxSizing: "border-box", outline: "none" }}
          />
        </div>

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}
        >
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button
            onClick={() => setShowImport(true)}
            style={{ padding: "10px 16px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <DownloadIcon size={14} color="#2A2830" /> Import
          </button>
          <button
            onClick={() => adminService.exportProductsCsv()}
            style={{ padding: "10px 16px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            ↓ Export
          </button>
          <button
            onClick={() => router.push("/admin/products/new")}
            style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Bulk Toolbar */}
      {selectedIds.length > 0 && (
        <div style={{ background: "#1A5CFF", color: "#fff", padding: "10px 16px", borderRadius: "8px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "2px solid #E2E0DA" }}>
              <th style={{ width: "40px", padding: "12px 16px" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === products.length && products.length > 0}
                  onChange={e => setSelectedIds(e.target.checked ? products.map(p => p.id) : [])}
                />
              </th>
              <th style={{ width: "60px", ...thStyle }} />
              {["Product", "Status", "Inventory", "Category", "Type", "Vendor"].map(col => (
                <th key={col} style={thStyle}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && products.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: "48px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>Loading…</td></tr>
            ) : loadError ? (
              <tr>
                <td colSpan={9} style={{ padding: "48px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", color: "#E8242A", fontWeight: 600, marginBottom: "8px" }}>Failed to load products</div>
                  <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "16px", maxWidth: "480px", margin: "0 auto 16px" }}>{loadError}</div>
                  <button onClick={() => load()} style={{ padding: "8px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Retry</button>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "56px", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>👕</div>
                  <div style={{ fontSize: "14px", color: "#aaa", fontWeight: 600 }}>No products found</div>
                </td>
              </tr>
            ) : products.map(product => (
              <tr
                key={product.id}
                style={{ borderBottom: "1px solid #F4F3EF", cursor: "pointer", transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFAFA")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                {/* Checkbox */}
                <td style={{ padding: "14px 16px" }} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(product.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedIds(prev => [...prev, product.id]);
                      else setSelectedIds(prev => prev.filter(id => id !== product.id));
                    }}
                  />
                </td>

                {/* Image */}
                <td style={{ padding: "10px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "8px", overflow: "hidden", background: "linear-gradient(135deg,#f0ede8,#e8e4df)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E2E0DA", flexShrink: 0 }}>
                    {product.images?.[0] ? (
                      <img src={product.images[0].url_thumbnail} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "20px", opacity: 0.4 }}>👕</span>
                    )}
                  </div>
                </td>

                {/* Product */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830", marginBottom: "2px" }}>{product.name}</div>
                </td>

                {/* Status */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <span style={{
                    padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                    background: product.status === "active" ? "rgba(5,150,105,.1)" : product.status === "draft" ? "rgba(156,163,175,.15)" : "rgba(232,36,42,.1)",
                    color: product.status === "active" ? "#059669" : product.status === "draft" ? "#9CA3AF" : "#E8242A",
                  }}>
                    {product.status === "active" ? "● Active" : product.status === "draft" ? "○ Draft" : "✕ Archived"}
                  </span>
                </td>

                {/* Inventory */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{totalInventory(product)} in stock</div>
                  <div style={{ fontSize: "11px", color: "#aaa" }}>{product.variants?.length || 0} variants</div>
                </td>

                {/* Category */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ fontSize: "13px", color: "#2A2830" }}>{[product.fabric, product.product_code, product.weight].filter(Boolean).join(" · ") || product.categories?.[0]?.name || "Apparel"}</div>
                </td>

                {/* Type */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ fontSize: "13px", color: "#7A7880" }}>{product.product_type || "—"}</div>
                </td>

                {/* Vendor */}
                <td style={{ padding: "14px 16px" }} onClick={() => router.push(`/admin/products/${product.slug}/edit`)}>
                  <div style={{ fontSize: "13px", color: "#7A7880" }}>{product.vendor || "—"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "24px", color: "#2A2830", letterSpacing: ".04em" }}>
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
                  <tr style={{ background: "#F4F3EF", borderBottom: "2px solid #E2E0DA" }}>
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
                    <tr key={p.id} style={{ borderBottom: "1px solid #F4F3EF" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px", color: "#2A2830" }}>{p.name}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <select
                          value={bulkEdits[p.id]?.status ?? p.status}
                          onChange={e => setBulkEdit(p.id, "status", e.target.value)}
                          style={{ padding: "6px 10px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px" }}
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
                          style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "120px" }}
                        />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <input
                          value={bulkEdits[p.id]?.product_type ?? (p.product_type ?? "")}
                          onChange={e => setBulkEdit(p.id, "product_type", e.target.value)}
                          placeholder="Type"
                          style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", width: "120px" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E0DA", display: "flex", gap: "10px", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
              <button
                onClick={() => setShowBulkEdit(false)}
                style={{ padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSave}
                style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}
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
