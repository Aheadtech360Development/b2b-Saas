"use client";

import { useEffect, useState, useCallback } from "react";
import {
  supplierCatalogService,
  type SSCategory,
  type SSProductListItem,
  type SSProductDetail,
  type SSMarkupRule,
  type MarkupRuleCreate,
  type SyncStatus,
  type ProductsFilter,
} from "@/services/supplierCatalog.service";

// ── Mini icon helpers ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "inline-block", width: 18, height: 18, border: "2px solid #e5e7eb", borderTopColor: "#1A5CFF", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
  );
}

function Badge({ text, color = "#1A5CFF" }: { text: string; color?: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}18`, color }}>
      {text}
    </span>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "catalog" | "markup" | "sync";

const TABS: { id: Tab; label: string }[] = [
  { id: "catalog", label: "Browse Catalog" },
  { id: "markup", label: "Markup Rules" },
  { id: "sync", label: "Sync Status" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplierCatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>("catalog");

  return (
    <div style={{ maxWidth: 1400 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sc-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.1); transform: translateY(-2px); }
        .sc-btn:hover:not(:disabled) { opacity: .85; }
        .sc-btn:disabled { opacity: .5; cursor: not-allowed; }
        .sc-row:hover { background: #f8f8f8; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1B3A5C", margin: 0 }}>
          Supplier Catalog
        </h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
          S&S Activewear — Browse, import, and sync the full apparel catalog
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e5e7eb", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? "#1A5CFF" : "#6b7280",
              background: "none",
              border: "none",
              borderBottom: activeTab === t.id ? "2px solid #1A5CFF" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -2,
              transition: "all .15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "catalog" && <CatalogTab />}
      {activeTab === "markup" && <MarkupTab />}
      {activeTab === "sync" && <SyncTab />}
    </div>
  );
}

// ── CATALOG TAB ───────────────────────────────────────────────────────────────

function CatalogTab() {
  const [categories, setCategories] = useState<SSCategory[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [products, setProducts] = useState<SSProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ProductsFilter>({ page: 1, page_size: 48 });
  const [importing, setImporting] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<{ styleId: string; msg: string; ok: boolean } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SSProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    supplierCatalogService.getCategories().then(setCategories).catch(() => {});
  }, []);

  const loadProducts = useCallback(async (f: ProductsFilter) => {
    setLoading(true);
    try {
      const res = await supplierCatalogService.getProducts(f);
      setProducts(res.items);
      setTotal(res.total);
      setPages(res.pages);
      // Derive unique brands from results for sidebar filter
      const uniqueBrands = [...new Set(res.items.map((p) => p.brand_name).filter(Boolean) as string[])].sort();
      if (!f.brand) setBrands(uniqueBrands);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(filter);
  }, [filter, loadProducts]);

  function applyFilter(updates: Partial<ProductsFilter>) {
    setFilter((prev) => ({ ...prev, ...updates, page: 1 }));
  }

  async function handleImport(styleId: string) {
    setImporting(styleId);
    setImportMsg(null);
    try {
      const res = await supplierCatalogService.importProduct(styleId);
      setImportMsg({ styleId, msg: res.message, ok: res.success });
      // Mark as imported in local state
      setProducts((prev) =>
        prev.map((p) =>
          p.style_id === styleId
            ? { ...p, is_imported: true, imported_product_id: res.product_id }
            : p
        )
      );
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Import failed";
      setImportMsg({ styleId, msg, ok: false });
    } finally {
      setImporting(null);
    }
  }

  async function handleViewDetail(styleId: string) {
    setDetailLoading(true);
    setSelectedProduct(null);
    try {
      const d = await supplierCatalogService.getProduct(styleId);
      setSelectedProduct(d);
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }

  const noCatalog = !loading && products.length === 0 && !filter.q && !filter.category;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Sidebar filters */}
      <aside style={{ width: 220, flexShrink: 0 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "#9ca3af", marginBottom: 12 }}>Filters</div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search styles, brands…"
            defaultValue={filter.q ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilter({ q: (e.target as HTMLInputElement).value || undefined }); }}
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 12, marginBottom: 14, boxSizing: "border-box" }}
          />

          {/* Show imported only */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!filter.imported_only}
              onChange={(e) => applyFilter({ imported_only: e.target.checked || undefined })}
            />
            Imported only
          </label>

          {/* Category */}
          {categories.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Category</div>
              <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 14 }}>
                <div
                  onClick={() => applyFilter({ category: undefined })}
                  style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: !filter.category ? 700 : 400, background: !filter.category ? "#EFF6FF" : "transparent", color: !filter.category ? "#1A5CFF" : "#374151" }}
                >
                  All ({total})
                </div>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => applyFilter({ category: c.name })}
                    style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: filter.category === c.name ? 700 : 400, background: filter.category === c.name ? "#EFF6FF" : "transparent", color: filter.category === c.name ? "#1A5CFF" : "#374151" }}
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Brand */}
          {brands.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Brand</div>
              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                <div
                  onClick={() => applyFilter({ brand: undefined })}
                  style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: !filter.brand ? 700 : 400, background: !filter.brand ? "#EFF6FF" : "transparent", color: !filter.brand ? "#1A5CFF" : "#374151" }}
                >
                  All brands
                </div>
                {brands.map((b) => (
                  <div
                    key={b}
                    onClick={() => applyFilter({ brand: b })}
                    style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: filter.brand === b ? 700 : 400, background: filter.brand === b ? "#EFF6FF" : "transparent", color: filter.brand === b ? "#1A5CFF" : "#374151" }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Product grid */}
      <div style={{ flex: 1 }}>
        {/* Results bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {loading ? "Loading…" : `${total.toLocaleString()} products`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {filter.category && (
              <Badge text={`Category: ${filter.category}`} />
            )}
            {filter.brand && (
              <Badge text={`Brand: ${filter.brand}`} />
            )}
          </div>
        </div>

        {noCatalog ? (
          <EmptyState
            title="No supplier products synced yet"
            description="Go to the Sync Status tab and trigger a product sync to populate the catalog."
          />
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 60 }}><Spinner /></div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  importing={importing === p.style_id}
                  importMsg={importMsg?.styleId === p.style_id ? importMsg : null}
                  onImport={() => handleImport(p.style_id)}
                  onViewDetail={() => handleViewDetail(p.style_id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
                <PaginationBtn label="‹ Prev" disabled={(filter.page ?? 1) <= 1} onClick={() => applyFilter({ page: (filter.page ?? 1) - 1 })} />
                <span style={{ padding: "7px 14px", fontSize: 13 }}>
                  Page {filter.page ?? 1} of {pages}
                </span>
                <PaginationBtn label="Next ›" disabled={(filter.page ?? 1) >= pages} onClick={() => applyFilter({ page: (filter.page ?? 1) + 1 })} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail drawer */}
      {(detailLoading || selectedProduct) && (
        <ProductDetailDrawer
          product={selectedProduct}
          loading={detailLoading}
          importing={importing === selectedProduct?.style_id}
          onImport={() => selectedProduct && handleImport(selectedProduct.style_id)}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  importing,
  importMsg,
  onImport,
  onViewDetail,
}: {
  product: SSProductListItem;
  importing: boolean;
  importMsg: { msg: string; ok: boolean } | null;
  onImport: () => void;
  onViewDetail: () => void;
}) {
  return (
    <div
      className="sc-card"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        transition: "box-shadow .2s, transform .2s",
        cursor: "pointer",
      }}
      onClick={onViewDetail}
    >
      {/* Image */}
      <div style={{ height: 160, background: "#f3f4f6", position: "relative", overflow: "hidden" }}>
        {product.front_image ? (
          <img
            src={product.front_image}
            alt={product.style_name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#d1d5db", fontSize: 32 }}>
            👕
          </div>
        )}
        {product.is_imported && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "#10b981", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>
            IMPORTED
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>
          {product.brand_name ?? "S&S Activewear"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4, lineHeight: 1.3 }}>
          {product.style_name}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
          Style #{product.style_id}
          {product.color_count > 0 && ` · ${product.color_count} colors`}
        </div>

        {product.piece_price != null && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1B3A5C", marginBottom: 10 }}>
            ${product.piece_price.toFixed(2)} / piece
            {product.case_price && (
              <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                (${product.case_price.toFixed(2)} / case)
              </span>
            )}
          </div>
        )}

        {importMsg && (
          <div style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, marginBottom: 8, background: importMsg.ok ? "#d1fae5" : "#fee2e2", color: importMsg.ok ? "#065f46" : "#b91c1c" }}>
            {importMsg.msg}
          </div>
        )}

        <button
          className="sc-btn"
          disabled={importing || product.is_imported}
          onClick={(e) => { e.stopPropagation(); onImport(); }}
          style={{
            width: "100%",
            padding: "7px 12px",
            borderRadius: 7,
            border: "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: product.is_imported ? "default" : "pointer",
            background: product.is_imported ? "#d1fae5" : "#1A5CFF",
            color: product.is_imported ? "#065f46" : "#fff",
            transition: "opacity .15s",
          }}
        >
          {importing ? <Spinner /> : product.is_imported ? "✓ Imported" : "Import Product"}
        </button>
      </div>
    </div>
  );
}

function PaginationBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="sc-btn"
      style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}

// ── Product detail drawer ─────────────────────────────────────────────────────

function ProductDetailDrawer({
  product,
  loading,
  importing,
  onImport,
  onClose,
}: {
  product: SSProductDetail | null;
  loading: boolean;
  importing: boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  const colors = product
    ? [...new Set(product.variants.map((v) => v.color_name).filter(Boolean))]
    : [];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 480,
        background: "#fff", zIndex: 201, overflowY: "auto",
        boxShadow: "-8px 0 40px rgba(0,0,0,.15)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Product Detail</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>

        <div style={{ flex: 1, padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: "center", paddingTop: 60 }}><Spinner /></div>
          ) : product ? (
            <>
              {/* Image */}
              {product.front_image && (
                <img src={product.front_image} alt={product.style_name} style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 10, background: "#f3f4f6", marginBottom: 20 }} />
              )}

              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af", letterSpacing: ".08em" }}>{product.brand_name}</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 4px" }}>{product.style_name}</h2>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>Style #{product.style_id} · {product.category_name}</div>

              {product.piece_price != null && (
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A5C", marginBottom: 16 }}>
                  Wholesale: ${product.piece_price.toFixed(2)}/piece
                  {product.case_price && (
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>
                      ${product.case_price.toFixed(2)}/case of {product.case_size}
                    </span>
                  )}
                </div>
              )}

              {product.description && (
                <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, marginBottom: 16 }}>{product.description}</p>
              )}

              {/* Colors */}
              {colors.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                    {colors.length} Color{colors.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {colors.map((c) => {
                      const variant = product.variants.find((v) => v.color_name === c);
                      return (
                        <div key={c} title={c ?? ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          {variant?.color_swatch ? (
                            <img src={variant.color_swatch} alt={c ?? ""} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>?</div>
                          )}
                          <span style={{ fontSize: 9, color: "#6b7280", maxWidth: 40, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Variants table */}
              {product.variants.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Variants ({product.variants.length})</div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {["SKU", "Color", "Size", "Price", "Stock"].map((h) => (
                            <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.slice(0, 20).map((v) => (
                          <tr key={v.id} className="sc-row">
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6", fontFamily: "monospace", fontSize: 11 }}>{v.sku}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{v.color_name ?? "—"}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{v.size_name ?? "—"}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{v.piece_price != null ? `$${Number(v.piece_price).toFixed(2)}` : "—"}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6", color: v.qty_on_hand > 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>
                              {v.qty_on_hand}
                            </td>
                          </tr>
                        ))}
                        {product.variants.length > 20 && (
                          <tr>
                            <td colSpan={5} style={{ padding: "6px 10px", color: "#9ca3af", fontSize: 11, textAlign: "center" }}>
                              +{product.variants.length - 20} more variants
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Import button */}
        {product && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb" }}>
            <button
              className="sc-btn"
              disabled={importing || product.is_imported}
              onClick={onImport}
              style={{
                width: "100%",
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: product.is_imported ? "default" : "pointer",
                background: product.is_imported ? "#d1fae5" : "#1A5CFF",
                color: product.is_imported ? "#065f46" : "#fff",
              }}
            >
              {importing ? <Spinner /> : product.is_imported ? "✓ Already Imported" : "Import to Catalog"}
            </button>
            {product.imported_product_id && (
              <a
                href={`/admin/products/${product.imported_product_id}`}
                style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 12, color: "#1A5CFF" }}
              >
                View in Products →
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── MARKUP RULES TAB ──────────────────────────────────────────────────────────

function MarkupTab() {
  const [rules, setRules] = useState<SSMarkupRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MarkupRuleCreate>({ rule_type: "global", markup_pct: 40 });
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function loadRules() {
    setLoading(true);
    try {
      setRules(await supplierCatalogService.getMarkupRules());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRules(); }, []);

  function startEdit(rule: SSMarkupRule) {
    setEditingId(rule.id);
    setForm({ rule_type: rule.rule_type, target_value: rule.target_value ?? undefined, markup_pct: rule.markup_pct, markup_fixed: rule.markup_fixed, is_active: rule.is_active });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm({ rule_type: "global", markup_pct: 40, markup_fixed: 0, is_active: true });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      if (editingId) {
        await supplierCatalogService.updateMarkupRule(editingId, form);
        setMsg({ text: "Rule updated", ok: true });
      } else {
        await supplierCatalogService.createMarkupRule(form);
        setMsg({ text: "Rule created", ok: true });
      }
      setShowForm(false);
      await loadRules();
    } catch {
      setMsg({ text: "Save failed", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this markup rule?")) return;
    try {
      await supplierCatalogService.deleteMarkupRule(id);
      await loadRules();
    } catch {
      setMsg({ text: "Delete failed", ok: false });
    }
  }

  const RULE_TYPE_LABELS: Record<string, string> = {
    global: "Global (all products)",
    category: "By Category",
    brand: "By Brand",
    product: "By Style ID",
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Pricing Markup Rules</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Set markup over S&S wholesale cost. Higher-priority rules override lower ones.
            <br />
            Priority: Style ID &gt; Brand &gt; Category &gt; Global (default: +40%)
          </p>
        </div>
        <button
          onClick={startNew}
          style={{ padding: "9px 18px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          + Add Rule
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: msg.ok ? "#d1fae5" : "#fee2e2", color: msg.ok ? "#065f46" : "#b91c1c", fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* Add/edit form */}
      {showForm && (
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>{editingId ? "Edit Rule" : "New Rule"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Rule Type</label>
              <select
                value={form.rule_type}
                onChange={(e) => setForm((f) => ({ ...f, rule_type: e.target.value, target_value: undefined }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13 }}
              >
                {Object.entries(RULE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {form.rule_type !== "global" && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {form.rule_type === "product" ? "Style ID" : form.rule_type === "brand" ? "Brand Name" : "Category Name"}
                </label>
                <input
                  value={form.target_value ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
                  placeholder={form.rule_type === "product" ? "e.g. PC61" : form.rule_type === "brand" ? "e.g. Port & Company" : "e.g. T-Shirts"}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Markup % (e.g. 40 = 40%)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.markup_pct ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, markup_pct: parseFloat(e.target.value) || 0 }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Fixed $ Add-on (optional)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.markup_fixed ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, markup_fixed: parseFloat(e.target.value) || 0 }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowForm(false)} style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "7px 16px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {saving ? "Saving…" : "Save Rule"}
            </button>
          </div>
        </div>
      )}

      {/* Rules table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spinner /></div>
      ) : rules.length === 0 ? (
        <EmptyState title="No markup rules yet" description="Add a Global rule to set a default markup for all S&S products (recommended: 40%)." />
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Rule Type", "Target", "Markup %", "Fixed $", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="sc-row">
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
                    <Badge text={RULE_TYPE_LABELS[r.rule_type] ?? r.rule_type} color={r.rule_type === "global" ? "#7c3aed" : "#1A5CFF"} />
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>
                    {r.target_value ?? <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 700 }}>{r.markup_pct}%</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>${r.markup_fixed.toFixed(2)}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
                    <Badge text={r.is_active ? "Active" : "Inactive"} color={r.is_active ? "#059669" : "#9ca3af"} />
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => startEdit(r)} style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => handleDelete(r.id)} style={{ padding: "4px 10px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", fontSize: 12, cursor: "pointer" }}>Delete</button>
                    </div>
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

// ── SYNC STATUS TAB ───────────────────────────────────────────────────────────

function SyncTab() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    try {
      setStatus(await supplierCatalogService.getSyncStatus(30));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleTrigger(type: "categories" | "products" | "inventory") {
    setTriggering(type);
    setMsg(null);
    try {
      const r = await supplierCatalogService.triggerSync(type);
      setMsg({ text: `${type} sync queued (task: ${r.task_id.slice(0, 8)}…)`, ok: true });
      setTimeout(load, 3000);
    } catch {
      setMsg({ text: "Failed to queue sync", ok: false });
    } finally {
      setTriggering(null);
    }
  }

  const SYNCS: { type: "categories" | "products" | "inventory"; label: string; schedule: string }[] = [
    { type: "categories", label: "Categories", schedule: "Daily at 02:00 UTC" },
    { type: "products", label: "Products", schedule: "Every 6 hours" },
    { type: "inventory", label: "Inventory", schedule: "Every 15 minutes" },
  ];

  const STATUS_COLOR: Record<string, string> = {
    completed: "#059669",
    running: "#d97706",
    failed: "#dc2626",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Sync Status</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Syncs run automatically on schedule. Use manual triggers for immediate refresh.
          </p>
        </div>
        <button onClick={load} style={{ padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>
          ↻ Refresh
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: msg.ok ? "#d1fae5" : "#fee2e2", color: msg.ok ? "#065f46" : "#b91c1c", fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* Sync cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {SYNCS.map(({ type, label, schedule }) => {
          const info = status?.latest_by_type?.[type];
          return (
            <div key={type} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
                {info && (
                  <Badge text={info.status} color={STATUS_COLOR[info.status] ?? "#6b7280"} />
                )}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>{schedule}</div>
              {info ? (
                <>
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                    Last run: {info.last_run ? new Date(info.last_run).toLocaleString() : "Never"}
                  </div>
                  {info.records_upserted > 0 && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                      {info.records_upserted.toLocaleString()} records synced
                    </div>
                  )}
                  {info.error && (
                    <div style={{ fontSize: 11, color: "#b91c1c", background: "#fee2e2", padding: "4px 8px", borderRadius: 6, marginBottom: 8 }}>
                      {info.error.slice(0, 100)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Never synced</div>
              )}
              <button
                onClick={() => handleTrigger(type)}
                disabled={triggering === type}
                className="sc-btn"
                style={{ marginTop: 8, width: "100%", padding: "7px 12px", border: "1px solid #1A5CFF", borderRadius: 7, background: "transparent", color: "#1A5CFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {triggering === type ? <Spinner /> : `Sync ${label} Now`}
              </button>
            </div>
          );
        })}
      </div>

      {/* History table */}
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sync History</h3>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spinner /></div>
      ) : !status?.history?.length ? (
        <EmptyState title="No sync history yet" description="Trigger a manual sync or wait for the scheduled sync to run." />
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Type", "Status", "Started", "Duration", "Records", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.history.map((log) => {
                const duration = log.completed_at && log.started_at
                  ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={log.id} className="sc-row">
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ textTransform: "capitalize" }}>{log.sync_type}</span>
                    </td>
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6" }}>
                      <Badge text={log.status} color={STATUS_COLOR[log.status] ?? "#6b7280"} />
                    </td>
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6", color: "#6b7280", fontSize: 12 }}>
                      {new Date(log.started_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>
                      {duration != null ? `${duration}s` : "—"}
                    </td>
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6" }}>
                      {log.records_upserted.toLocaleString()}
                    </td>
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6" }}>
                      {log.error_message && (
                        <span title={log.error_message} style={{ color: "#dc2626", fontSize: 11, cursor: "help" }}>⚠ Error</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", background: "#f9fafb", borderRadius: 12, border: "1px dashed #e5e7eb" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#374151", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#6b7280", maxWidth: 360, margin: "0 auto" }}>{description}</div>
    </div>
  );
}
