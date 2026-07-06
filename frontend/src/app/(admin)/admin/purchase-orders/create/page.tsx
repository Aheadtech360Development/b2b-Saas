"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Manufacturer { id: string; name: string; contact_name?: string; email?: string; phone?: string; address?: string; notes?: string; }

interface SearchProduct { id: string; name: string; slug: string; product_code?: string | null; }

interface FullVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  stock_quantity: number;
  cost_per_item: string | null;
}

interface VariantRow {
  key: number;
  variant_id: string | null;   // null = new variant
  color: string;
  size: string;
  stock_quantity: number;
  qty_ordered: number;
  unit_cost_expected: number;
  is_new_variant: boolean;
}

interface ProductBlock {
  key: number;
  mode: "existing" | "new";
  // Existing product
  product_id: string | null;
  product_name: string;
  search_variant_rows: VariantRow[];   // loaded from selected product
  // New product
  new_product_name: string;
  new_sku_prefix: string;
  new_variant_rows: VariantRow[];      // manually added
  // Search state
  search_query: string;
  search_results: SearchProduct[];
  loading_variants: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const SIZE_OPTIONS = [...SIZE_ORDER, "Custom"];

function sizeRank(s: string) {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  return i === -1 ? 999 : i;
}

let _blockKey = 0;
let _rowKey = 0;

function blankBlock(): ProductBlock {
  return {
    key: ++_blockKey,
    mode: "existing",
    product_id: null,
    product_name: "",
    search_variant_rows: [],
    new_product_name: "",
    new_sku_prefix: "",
    new_variant_rows: [],
    search_query: "",
    search_results: [],
    loading_variants: false,
  };
}

function blankRow(overrides: Partial<VariantRow> = {}): VariantRow {
  return {
    key: ++_rowKey,
    variant_id: null,
    color: "",
    size: "M",
    stock_quantity: 0,
    qty_ordered: 0,
    unit_cost_expected: 0,
    is_new_variant: true,
    ...overrides,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreatePOPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState<ProductBlock[]>([blankBlock()]);
  const [saving, setSaving] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [showNewMfr, setShowNewMfr] = useState(false);
  const [newMfrForm, setNewMfrForm] = useState({ name: "", contact_name: "", email: "", phone: "", address: "", notes: "" });
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Manufacturer[]>("/api/v1/admin/purchase-orders/manufacturers")
      .then(d => setManufacturers(Array.isArray(d) ? d : []));
  }, []);

  // ── Block helpers ────────────────────────────────────────────────────────────

  function updateBlock(key: number, patch: Partial<ProductBlock>) {
    setBlocks(bs => bs.map(b => b.key === key ? { ...b, ...patch } : b));
  }

  function removeBlock(key: number) {
    setBlocks(bs => bs.filter(b => b.key !== key));
  }

  function activeRows(b: ProductBlock) {
    return b.mode === "existing" ? b.search_variant_rows : b.new_variant_rows;
  }

  function setActiveRows(b: ProductBlock, rows: VariantRow[]): Partial<ProductBlock> {
    return b.mode === "existing" ? { search_variant_rows: rows } : { new_variant_rows: rows };
  }

  function updateRow(blockKey: number, rowKey: number, patch: Partial<VariantRow>) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      return { ...b, ...setActiveRows(b, activeRows(b).map(r => r.key === rowKey ? { ...r, ...patch } : r)) };
    }));
  }

  function removeRow(blockKey: number, rowKey: number) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      return { ...b, ...setActiveRows(b, activeRows(b).filter(r => r.key !== rowKey)) };
    }));
  }

  function addNewVariantRow(blockKey: number) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      const rows = activeRows(b);
      const defaultCost = rows.find(r => r.unit_cost_expected > 0)?.unit_cost_expected ?? 0;
      return { ...b, ...setActiveRows(b, [...rows, blankRow({ unit_cost_expected: defaultCost })]) };
    }));
  }

  function applyCostToAll(blockKey: number, cost: number) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      return { ...b, ...setActiveRows(b, activeRows(b).map(r => ({ ...r, unit_cost_expected: cost }))) };
    }));
  }

  function applyQtyToAll(blockKey: number, qty: number) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      return { ...b, ...setActiveRows(b, activeRows(b).map(r => ({ ...r, qty_ordered: qty }))) };
    }));
  }

  function duplicateRow(blockKey: number, rowKey: number) {
    setBlocks(bs => bs.map(b => {
      if (b.key !== blockKey) return b;
      const rows = activeRows(b);
      const idx = rows.findIndex(r => r.key === rowKey);
      if (idx === -1) return b;
      const src = rows[idx]!;
      const newRow = blankRow({ color: src.color, size: src.size, qty_ordered: src.qty_ordered, unit_cost_expected: src.unit_cost_expected });
      const newRows = [...rows.slice(0, idx + 1), newRow, ...rows.slice(idx + 1)];
      return { ...b, ...setActiveRows(b, newRows) };
    }));
  }

  // ── Product search & variant load ────────────────────────────────────────────

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchProducts = useCallback((blockKey: number, q: string) => {
    updateBlock(blockKey, { search_query: q, search_results: [] });
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 1) return;
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<SearchProduct[]>(
          `/api/v1/admin/products?q=${encodeURIComponent(q)}&page_size=10`
        );
        const items: SearchProduct[] = Array.isArray(data) ? data : [];
        updateBlock(blockKey, { search_results: items });
      } catch {
        updateBlock(blockKey, { search_results: [] });
      }
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectProduct(blockKey: number, product: SearchProduct) {
    updateBlock(blockKey, {
      search_query: product.name,
      search_results: [],
      product_id: product.id,
      product_name: product.name,
      loading_variants: true,
      search_variant_rows: [],
    });
    try {
      const detail = await apiClient.get<{ variants: FullVariant[] }>(
        `/api/v1/admin/products/${product.slug}`
      );
      const variants: FullVariant[] = detail.variants ?? [];
      const rows: VariantRow[] = variants
        .sort((a, b) => sizeRank(a.size ?? "") - sizeRank(b.size ?? ""))
        .map(v => blankRow({
          variant_id: v.id,
          color: v.color ?? "",
          size: v.size ?? "",
          stock_quantity: v.stock_quantity ?? 0,
          unit_cost_expected: parseFloat(v.cost_per_item ?? "0") || 0,
          is_new_variant: false,
        }));
      updateBlock(blockKey, { search_variant_rows: rows, loading_variants: false });
    } catch {
      updateBlock(blockKey, { loading_variants: false });
    }
  }

  // ── Manufacturer add ──────────────────────────────────────────────────────────

  async function addManufacturer() {
    if (!newMfrForm.name.trim() || !newMfrForm.contact_name.trim() || !newMfrForm.email.trim() || !newMfrForm.phone.trim() || !newMfrForm.address.trim()) {
      setStepError("Please fill all required manufacturer fields: Name, Contact Name, Email, Phone, Address");
      return;
    }
    try {
      const data = await apiClient.post<Manufacturer>("/api/v1/admin/purchase-orders/manufacturers", newMfrForm);
      setManufacturers(m => [...m, data]);
      setManufacturerId(data.id);
      setNewMfrForm({ name: "", contact_name: "", email: "", phone: "", address: "", notes: "" });
      setShowNewMfr(false);
      setStepError(null);
    } catch (err) {
      setStepError(err instanceof ApiClientError ? err.message : "Failed to add manufacturer");
    }
  }

  // ── Build final line items ───────────────────────────────────────────────────

  function buildLineItems() {
    const items: object[] = [];
    for (const block of blocks) {
      // Existing product rows (including custom new-variant rows added to an existing product)
      for (const row of block.search_variant_rows.filter(r => r.qty_ordered > 0)) {
        if (!row.is_new_variant && row.variant_id) {
          items.push({ product_variant_id: row.variant_id, qty_ordered: row.qty_ordered, unit_cost_expected: row.unit_cost_expected });
        } else {
          items.push({ new_product_name: block.product_name, new_product_sku: null, new_product_color: row.color || null, new_product_size: row.size || null, qty_ordered: row.qty_ordered, unit_cost_expected: row.unit_cost_expected });
        }
      }
      // New product rows
      for (const row of block.new_variant_rows.filter(r => r.qty_ordered > 0)) {
        items.push({
          new_product_name: block.new_product_name,
          new_product_sku: block.new_sku_prefix ? `${block.new_sku_prefix}-${row.color}-${row.size}`.toUpperCase() : null,
          new_product_color: row.color || null,
          new_product_size: row.size || null,
          qty_ordered: row.qty_ordered,
          unit_cost_expected: row.unit_cost_expected,
        });
      }
    }
    return items;
  }

  // ── Step navigation with validation ─────────────────────────────────────────

  function handleStep1Next() {
    if (!manufacturerId) {
      setStepError("Please select a manufacturer before continuing.");
      return;
    }
    setStepError(null);
    setStep(2);
  }

  function handleStep2Next() {
    for (const block of blocks) {
      const hasExistingIdentity = block.product_id !== null && block.search_variant_rows.some(r => r.qty_ordered > 0);
      const hasNewIdentity = block.new_product_name.trim() !== "" && block.new_variant_rows.some(r => r.qty_ordered > 0);
      if (!hasExistingIdentity && !hasNewIdentity) {
        setStepError(
          block.new_product_name.trim() !== "" || block.product_id !== null
            ? `Please enter at least one quantity for "${block.new_product_name || block.product_name || "a product"}".`
            : "Please select or name a product for all product blocks."
        );
        return;
      }
      const rows = [...block.search_variant_rows, ...block.new_variant_rows];
    const hasQty = rows.some(r => r.qty_ordered > 0);
      if (!hasQty) {
        const label = block.mode === "new" ? (block.new_product_name || "a product") : block.product_name;
        setStepError(`Please enter at least one quantity for "${label}".`);
        return;
      }
    }
    if (blocks.length === 0) {
      setStepError("Add at least one product before continuing.");
      return;
    }
    setStepError(null);
    setStep(3);
  }

  // ── Save helpers ──────────────────────────────────────────────────────────────

  async function savePO(): Promise<{ id: string } | null> {
    if (!manufacturerId) { alert("Please select a manufacturer"); return null; }
    const lineItems = buildLineItems();
    if (lineItems.length === 0) { alert("Add at least one line item with qty > 0"); return null; }
    try {
      return await apiClient.post<{ id: string }>("/api/v1/admin/purchase-orders/", {
        manufacturer_id: manufacturerId,
        expected_delivery: expectedDelivery || null,
        notes: notes || null,
        line_items: lineItems,
      });
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to create PO");
      return null;
    }
  }

  async function save() {
    setSaving(true);
    try {
      const data = await savePO();
      if (data) router.push(`/admin/purchase-orders/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndEmail() {
    setSaving(true);
    let poData: { id: string } | null = null;
    try {
      poData = await savePO();
    } finally {
      setSaving(false);
    }
    if (!poData) return;

    setEmailSending(true);
    try {
      await apiClient.post(`/api/v1/admin/purchase-orders/${poData.id}/send-email`);
      alert("PO saved and email sent to manufacturer!");
    } catch {
      alert("PO saved but email failed. You can resend from the PO detail page.");
    } finally {
      setEmailSending(false);
    }
    router.push(`/admin/purchase-orders/${poData.id}`);
  }

  // ── Running total ─────────────────────────────────────────────────────────────

  const total = blocks.reduce((sum, b) => {
    const searchSum = b.search_variant_rows.reduce((s, r) => s + r.qty_ordered * r.unit_cost_expected, 0);
    const newSum = b.new_variant_rows.reduce((s, r) => s + r.qty_ordered * r.unit_cost_expected, 0);
    return sum + searchSum + newSum;
  }, 0);

  const reviewRows: Array<{ productLabel: string; color: string; size: string; qty: number; cost: number; isNew: boolean }> = [];
  for (const block of blocks) {
    for (const row of block.search_variant_rows.filter(r => r.qty_ordered > 0)) {
      reviewRows.push({ productLabel: block.product_name || "Unknown product", color: row.color, size: row.size, qty: row.qty_ordered, cost: row.unit_cost_expected, isNew: row.is_new_variant });
    }
    for (const row of block.new_variant_rows.filter(r => r.qty_ordered > 0)) {
      reviewRows.push({ productLabel: block.new_product_name || "Unnamed product", color: row.color, size: row.size, qty: row.qty_ordered, cost: row.unit_cost_expected, isNew: true });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px", maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px" }}>← Back</button>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C", letterSpacing: ".04em" }}>CREATE PURCHASE ORDER</h1>
      </div>

      {/* Step tabs — display only, not clickable */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px" }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            cursor: "default", pointerEvents: "none", userSelect: "none",
            background: step === s ? "#1B3A5C" : "#F3F4F6",
            color: step === s ? "#fff" : "#6B7280",
          }}>
            Step {s}: {["PO Info", "Line Items", "Review"][s - 1]}
          </div>
        ))}
      </div>

      {/* ── Step 1: PO Info ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "28px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1B3A5C", marginBottom: "20px" }}>PO Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={LBL}>Manufacturer *</label>
              <select value={manufacturerId} onChange={e => {
                if (e.target.value === "__new__") { setShowNewMfr(true); return; }
                setManufacturerId(e.target.value);
                if (e.target.value) setStepError(null);
              }} style={{ ...SELECT, borderColor: stepError && !manufacturerId ? "#EF4444" : "#D1D5DB" }}>
                <option value="">Select manufacturer…</option>
                {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__new__">+ Add New Manufacturer</option>
              </select>
              {showNewMfr && (
                <div style={{ marginTop: "10px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#F9FAFB" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div><label style={LBL}>Name *</label><input value={newMfrForm.name} onChange={e => setNewMfrForm(f => ({ ...f, name: e.target.value }))} placeholder="Manufacturer name" style={INPUT} /></div>
                    <div><label style={LBL}>Contact Name *</label><input value={newMfrForm.contact_name} onChange={e => setNewMfrForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact person" style={INPUT} /></div>
                    <div><label style={LBL}>Email *</label><input type="email" value={newMfrForm.email} onChange={e => setNewMfrForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" style={INPUT} /></div>
                    <div><label style={LBL}>Phone *</label><input value={newMfrForm.phone} onChange={e => setNewMfrForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" style={INPUT} /></div>
                    <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Address *</label><input value={newMfrForm.address} onChange={e => setNewMfrForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" style={INPUT} /></div>
                    <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Notes</label><input value={newMfrForm.notes} onChange={e => setNewMfrForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" style={INPUT} /></div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button onClick={addManufacturer} style={BTN_SM}>Add Manufacturer</button>
                    <button onClick={() => { setShowNewMfr(false); setNewMfrForm({ name: "", contact_name: "", email: "", phone: "", address: "", notes: "" }); }} style={{ ...BTN_SM, background: "#F3F4F6", color: "#374151" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label style={LBL}>Expected Delivery</label>
              <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} style={INPUT} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LBL}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} placeholder="Optional notes…" />
            </div>
          </div>
          {stepError && (
            <p style={{ color: "#CC0000", fontSize: "13px", marginTop: "12px" }}>{stepError}</p>
          )}
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleStep1Next} style={BTN_PRIMARY}>Next: Add Line Items →</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Line Items ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div>
          {blocks.map((block, bIdx) => (
            <ProductBlockEditor
              key={block.key}
              block={block}
              blockIndex={bIdx}
              onUpdate={patch => updateBlock(block.key, patch)}
              onRemove={() => removeBlock(block.key)}
              onSearchChange={q => searchProducts(block.key, q)}
              onSelectProduct={p => selectProduct(block.key, p)}
              onUpdateRow={(rk, patch) => updateRow(block.key, rk, patch)}
              onRemoveRow={rk => removeRow(block.key, rk)}
              onDuplicateRow={rk => duplicateRow(block.key, rk)}
              onAddNewVariant={() => addNewVariantRow(block.key)}
              onApplyCostToAll={cost => applyCostToAll(block.key, cost)}
              onApplyQtyToAll={qty => applyQtyToAll(block.key, qty)}
            />
          ))}

          <button onClick={() => setBlocks(bs => [...bs, blankBlock()])}
            style={{ ...BTN_SM, width: "100%", marginBottom: "20px" }}>
            + Add Another Product
          </button>

          {/* Running total */}
          <div style={{ padding: "16px 20px", background: "#F0F4FF", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <span style={{ fontSize: "14px", color: "#374151" }}>Running Total ({blocks.reduce((n, b) => n + b.search_variant_rows.filter(r => r.qty_ordered > 0).length + b.new_variant_rows.filter(r => r.qty_ordered > 0).length, 0)} line items):</span>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C" }}>${total.toFixed(2)}</span>
          </div>

          {stepError && (
            <p style={{ color: "#CC0000", fontSize: "13px", marginBottom: "12px" }}>{stepError}</p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => { setStepError(null); setStep(1); }} style={{ ...BTN_SM, background: "#F3F4F6", color: "#374151" }}>← Back</button>
            <button onClick={handleStep2Next} style={BTN_PRIMARY}>Next: Review →</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "28px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1B3A5C", marginBottom: "20px" }}>Review & Save</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "#F9FAFB", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px" }}>MANUFACTURER</div>
              <div style={{ fontWeight: 600 }}>{manufacturers.find(m => m.id === manufacturerId)?.name || "—"}</div>
            </div>
            <div style={{ background: "#F9FAFB", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px" }}>EXPECTED DELIVERY</div>
              <div style={{ fontWeight: 600 }}>{expectedDelivery || "—"}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["PRODUCT / VARIANT", "COLOR", "SIZE", "QTY", "UNIT COST", "TOTAL"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewRows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "20px 14px", color: "#9CA3AF", fontSize: "13px" }}>No line items with qty &gt; 0 yet.</td></tr>
              ) : reviewRows.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "12px 14px", fontSize: "13px" }}>{it.productLabel}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: "#6B7280" }}>{it.color || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: "#6B7280" }}>{it.size || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px" }}>{it.qty}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px" }}>${it.cost.toFixed(2)}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", fontWeight: 600 }}>${(it.qty * it.cost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ textAlign: "right", fontSize: "18px", fontWeight: 700, color: "#1B3A5C", marginBottom: "24px" }}>
            Total Expected: ${total.toFixed(2)}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <button onClick={() => setStep(2)} style={{ ...BTN_SM, background: "#F3F4F6", color: "#374151" }}>← Back</button>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={save} disabled={saving || emailSending} style={BTN_PRIMARY}>
                {saving ? "Saving…" : "Save as Draft"}
              </button>
              <button onClick={saveAndEmail} disabled={saving || emailSending}
                style={{ ...BTN_PRIMARY, background: "#1D4ED8" }}>
                {emailSending ? "Sending…" : saving ? "Saving…" : "Save & Send to Manufacturer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProductBlockEditor sub-component ─────────────────────────────────────────

interface BlockEditorProps {
  block: ProductBlock;
  blockIndex: number;
  onUpdate: (patch: Partial<ProductBlock>) => void;
  onRemove: () => void;
  onSearchChange: (q: string) => void;
  onSelectProduct: (p: SearchProduct) => void;
  onUpdateRow: (rowKey: number, patch: Partial<VariantRow>) => void;
  onRemoveRow: (rowKey: number) => void;
  onDuplicateRow: (rowKey: number) => void;
  onAddNewVariant: () => void;
  onApplyCostToAll: (cost: number) => void;
  onApplyQtyToAll: (qty: number) => void;
}

function ProductBlockEditor({
  block, blockIndex, onUpdate, onRemove,
  onSearchChange, onSelectProduct,
  onUpdateRow, onRemoveRow, onDuplicateRow, onAddNewVariant, onApplyCostToAll, onApplyQtyToAll,
}: BlockEditorProps) {
  const [applyCostVal, setApplyCostVal] = useState("");
  const [applyQtyVal, setApplyQtyVal] = useState("");
  const variantRows = block.mode === "existing" ? block.search_variant_rows : block.new_variant_rows;

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "24px", marginBottom: "16px" }}>
      {/* Block header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#1B3A5C" }}>Product {blockIndex + 1}</span>
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: "18px" }}>×</button>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {(["existing", "new"] as const).map(m => (
          <button key={m} onClick={() => onUpdate({ mode: m })}
            style={{
              padding: "6px 16px", borderRadius: "6px", border: "1px solid", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              background: block.mode === m ? "#1B3A5C" : "#fff",
              color: block.mode === m ? "#fff" : "#6B7280",
              borderColor: block.mode === m ? "#1B3A5C" : "#D1D5DB",
            }}>
            {m === "existing" ? "Search Existing" : "New Product"}
          </button>
        ))}
      </div>

      {/* ── Search Existing mode ─────────────────────────────────────────── */}
      {block.mode === "existing" && (
        <>
          {block.product_id ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "10px 14px", background: "#F0F4FF", borderRadius: "8px" }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>{block.product_name}</span>
              <button onClick={() => onUpdate({ product_id: null, product_name: "", search_variant_rows: [], search_query: "" })}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#6B7280" }}>
                Change product
              </button>
            </div>
          ) : (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <input
                value={block.search_query}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Search by product name or product code…"
                style={INPUT}
              />
              {block.search_results.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", zIndex: 20, maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
                  {block.search_results.map(p => (
                    <button key={p.id} onClick={() => onSelectProduct(p)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #F3F4F6" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#111827" }}>{p.name}</div>
                      {p.product_code && (
                        <div style={{ fontSize: "11px", color: "#9CA3AF", fontFamily: "'IBM Plex Mono', monospace", marginTop: "2px" }}>{p.product_code}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {block.loading_variants && (
                <div style={{ position: "absolute", top: "100%", left: 0, padding: "10px 14px", fontSize: "13px", color: "#9CA3AF" }}>
                  Loading variants…
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── New Product mode ─────────────────────────────────────────────── */}
      {block.mode === "new" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={LBL}>Product Name *</label>
            <input value={block.new_product_name} onChange={e => onUpdate({ new_product_name: e.target.value })}
              placeholder="e.g. 1001 Premium Unisex Tee" style={INPUT} />
          </div>
          <div>
            <label style={LBL}>Style Number</label>
            <input value={block.new_sku_prefix} onChange={e => onUpdate({ new_sku_prefix: e.target.value })}
              placeholder="e.g. 1001" style={INPUT} />
          </div>
        </div>
      )}

      {/* ── Variant table ─────────────────────────────────────────────────── */}
      {(variantRows.length > 0 || block.mode === "new") && (
        <>
          {/* Apply to all */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" as const }}>
            <span style={{ fontSize: "12px", color: "#6B7280", fontWeight: 600 }}>Apply to all:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#6B7280" }}>Cost</span>
              <input type="number" min={0} step={0.01} value={applyCostVal} onChange={e => setApplyCostVal(e.target.value)} placeholder="$0.00" style={{ ...INPUT, width: "80px" }} />
              <button onClick={() => onApplyCostToAll(parseFloat(applyCostVal) || 0)} style={{ ...BTN_SM, padding: "5px 10px", fontSize: "11px" }}>Apply Cost</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#6B7280" }}>Qty</span>
              <input type="number" min={0} value={applyQtyVal} onChange={e => setApplyQtyVal(e.target.value)} placeholder="0" style={{ ...INPUT, width: "70px" }} />
              <button onClick={() => onApplyQtyToAll(parseInt(applyQtyVal) || 0)} style={{ ...BTN_SM, padding: "5px 10px", fontSize: "11px" }}>Apply Qty</button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["COLOR", "SIZE", "CURRENT STOCK", "QTY ORDERED", "UNIT COST ($)", ""].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variantRows.map(row => (
                <tr key={row.key} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 12px" }}>
                    {row.is_new_variant ? (
                      <input value={row.color} onChange={e => onUpdateRow(row.key, { color: e.target.value })}
                        placeholder="Color" style={{ ...INPUT, width: "100px" }} />
                    ) : (
                      <span style={{ fontSize: "13px" }}>{row.color || "—"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {row.is_new_variant ? (
                      <select value={row.size} onChange={e => onUpdateRow(row.key, { size: e.target.value })}
                        style={{ ...SELECT, width: "90px" }}>
                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: "13px" }}>{row.size || "—"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: "13px", color: row.stock_quantity > 0 ? "#374151" : "#9CA3AF" }}>
                    {row.stock_quantity}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <input type="number" min={0}
                      value={row.qty_ordered === 0 ? "" : row.qty_ordered}
                      onChange={e => onUpdateRow(row.key, { qty_ordered: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      style={{ ...INPUT, width: "80px", background: row.qty_ordered > 0 ? "#F0F4FF" : "#fff" }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <input type="number" min={0} step={0.01}
                      value={row.unit_cost_expected === 0 ? "" : row.unit_cost_expected}
                      onChange={e => onUpdateRow(row.key, { unit_cost_expected: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      style={{ ...INPUT, width: "90px" }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <button onClick={() => onDuplicateRow(row.key)} title="Duplicate row"
                        style={{ background: "none", border: "1px solid #D1D5DB", borderRadius: "4px", cursor: "pointer", color: "#6B7280", fontSize: "12px", padding: "2px 6px" }}>⧉</button>
                      {row.is_new_variant && (
                        <button onClick={() => onRemoveRow(row.key)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: "16px" }}>×</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={onAddNewVariant}
            style={{ fontSize: "12px", color: "#1A5CFF", background: "none", border: "1px dashed #93C5FD", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", width: "100%", marginBottom: "4px" }}>
            + Add New Variant (New Color or Size)
          </button>
        </>
      )}

      {/* Prompt to search if no variants yet */}
      {block.mode === "existing" && !block.product_id && variantRows.length === 0 && (
        <div style={{ padding: "20px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>
          Search and select a product above to see its variants.
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const LBL: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" };
const INPUT: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: "7px", fontSize: "13px", boxSizing: "border-box", outline: "none" };
const SELECT: React.CSSProperties = { ...INPUT, background: "#fff" };
const BTN_PRIMARY: React.CSSProperties = { padding: "10px 24px", background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const BTN_SM: React.CSSProperties = { padding: "8px 16px", background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
