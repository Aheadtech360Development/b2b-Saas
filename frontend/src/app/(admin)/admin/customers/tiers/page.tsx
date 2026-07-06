// frontend/src/app/(admin)/admin/customers/tiers/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { apiClient } from "@/lib/api-client";
import { TrashIcon } from "@/components/ui/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullShippingBracket {
  min_units: number;
  max_units: number | null;
  min_order_value: number | null;
  max_order_value: number | null;
  cost: number;
}

interface DiscountGroup {
  id: string;
  title: string;
  customer_tag: string;
  applies_to: "store" | "collections" | "products";
  applies_to_ids: string[];
  min_req_type: "none" | "amount" | "quantity";
  min_req_value: number;
  shipping_type: "store_default" | "flat_rate" | "live_shippo";
  shipping_amount: number;
  shipping_calc_type: "units" | "order_value";
  shipping_cutoff_time: string;
  shipping_brackets: FullShippingBracket[];
  status: "enabled" | "disabled";
  created_at: string;
}

interface VPVariant {
  id: string;
  color: string | null;
  size: string | null;
  retail_price: number | null;
}

interface VPProduct {
  id: string;
  name: string;
  categories: string[];
  base_price: number | null;
  variants: VPVariant[];
}

interface TierOverride { price: string; discount: string; }
interface BrowseItem { id: string; name: string; }
interface CustomerItem { id: string; name: string; tags: string[]; }

const EMPTY_GROUP_FORM: Omit<DiscountGroup, "id" | "created_at" | "applies_to_ids" | "shipping_brackets" | "shipping_calc_type" | "shipping_cutoff_time"> = {
  title: "",
  customer_tag: "",
  applies_to: "store",
  min_req_type: "none",
  min_req_value: 0,
  shipping_type: "store_default" as "store_default" | "flat_rate" | "live_shippo",
  shipping_amount: 0,
  status: "enabled",
};

function emptyBracket(): FullShippingBracket {
  return { min_units: 0, max_units: null, min_order_value: null, max_order_value: null, cost: 0 };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", display: "block", marginBottom: "5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA",
  borderRadius: "7px", fontSize: "13px", fontFamily: "var(--font-jakarta)",
  outline: "none", boxSizing: "border-box", background: "#fff",
};

const sectionBox: React.CSSProperties = {
  background: "#F4F3EF", borderRadius: "8px", padding: "18px", marginBottom: "16px",
};

// ─── Bracket Editor (mirrors shipping-tiers UI) ───────────────────────────────

function BracketEditor({
  brackets, calcType, onChange,
}: {
  brackets: FullShippingBracket[];
  calcType: "units" | "order_value";
  onChange: (b: FullShippingBracket[]) => void;
}) {
  const thS: React.CSSProperties = {
    padding: "8px 12px", textAlign: "left", fontSize: "10px",
    textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
  };

  function update(i: number, field: string, val: string) {
    onChange(brackets.map((b, idx) => {
      if (idx !== i) return b;
      if (field === "cost") return { ...b, cost: parseFloat(val) || 0 };
      if (field === "min_units" || field === "max_units")
        return { ...b, [field]: val === "" ? null : parseInt(val) || 0 };
      if (field === "min_order_value" || field === "max_order_value")
        return { ...b, [field]: val === "" ? null : parseFloat(val) || null };
      return b;
    }));
  }

  return (
    <div>
      <div style={{ overflowX: "auto", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "420px" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "1px solid #E2E0DA" }}>
              {calcType === "units" ? (
                <><th style={thS}>Min Units</th><th style={thS}>Max Units (blank = no limit)</th></>
              ) : (
                <><th style={thS}>Min Order $</th><th style={thS}>Max Order $ (blank = no limit)</th></>
              )}
              <th style={thS}>Shipping Cost ($)</th>
              <th style={{ ...thS, width: "36px" }} />
            </tr>
          </thead>
          <tbody>
            {brackets.map((b, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F4F3EF" }}>
                {calcType === "units" ? (
                  <>
                    <td style={{ padding: "7px 10px" }}>
                      <input type="number" min={0} value={b.min_units}
                        onChange={e => update(i, "min_units", e.target.value)}
                        style={{ ...inputStyle, width: "100px" }} />
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <input type="number" min={1} value={b.max_units ?? ""}
                        onChange={e => update(i, "max_units", e.target.value)}
                        placeholder="∞ unlimited"
                        style={{ ...inputStyle, width: "130px" }} />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.min_order_value ?? ""}
                          onChange={e => update(i, "min_order_value", e.target.value)}
                          placeholder="0.00" style={{ ...inputStyle, width: "100px" }} />
                      </div>
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "#aaa" }}>$</span>
                        <input type="number" min={0} step="0.01" value={b.max_order_value ?? ""}
                          onChange={e => update(i, "max_order_value", e.target.value)}
                          placeholder="∞ unlimited" style={{ ...inputStyle, width: "110px" }} />
                      </div>
                    </td>
                  </>
                )}
                <td style={{ padding: "7px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#aaa" }}>$</span>
                    <input type="number" min={0} step="0.01" value={b.cost}
                      onChange={e => update(i, "cost", e.target.value)}
                      style={{ ...inputStyle, width: "80px" }} />
                    {Number(b.cost) === 0 && (
                      <span style={{
                        fontSize: "10px", fontWeight: 700, color: "#059669",
                        background: "rgba(5,150,105,.1)", padding: "2px 6px", borderRadius: "4px"
                      }}>FREE</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "7px 6px", textAlign: "center" }}>
                  <button onClick={() => onChange(brackets.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}>×</button>
                </td>
              </tr>
            ))}
            {brackets.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "14px 12px", textAlign: "center", color: "#aaa", fontSize: "12px" }}>
                No brackets yet. Click &quot;+ Add Bracket&quot; below.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange([...brackets, emptyBracket()])}
        style={{
          marginTop: "8px", padding: "6px 14px", background: "#F4F3EF", border: "1px solid #E2E0DA",
          borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830"
        }}>
        + Add Bracket
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscountGroupsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"groups" | "variants">(
    initialTab === "variants" ? "variants" : "groups"
  );

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Discount Groups state ─────────────────────────────────────────────────
  const [groups, setGroups] = useState<DiscountGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ ...EMPTY_GROUP_FORM });
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");

  // ── Browse state (Applies To picker) ─────────────────────────────────────
  const [browseIds, setBrowseIds] = useState<string[]>([]);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseList, setBrowseList] = useState<BrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // ── Flat rate shipping config ─────────────────────────────────────────────
  const [flatCalcType, setFlatCalcType] = useState<"units" | "order_value">("order_value");
  const [flatCutoffTime, setFlatCutoffTime] = useState("");
  const [flatBrackets, setFlatBrackets] = useState<FullShippingBracket[]>([]);

  // ── Assigned customers in group modal ────────────────────────────────────
  const [groupCustomers, setGroupCustomers] = useState<CustomerItem[]>([]);
  const [groupCustomersLoading, setGroupCustomersLoading] = useState(false);
  const [customerAssignSearch, setCustomerAssignSearch] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [allCustomers, setAllCustomers] = useState<CustomerItem[]>([]);

  // ── Individual Variant Pricing state ──────────────────────────────────────
  const [vpProducts, setVpProducts] = useState<VPProduct[]>([]);
  const [vpLoading, setVpLoading] = useState(false);
  const [vpOverrides, setVpOverrides] = useState<Record<string, Record<string, TierOverride>>>({}); // productId → groupId → {price, discount}
  const [vpVariantOverrides, setVpVariantOverrides] = useState<Record<string, Record<string, string>>>({}); // variantId → groupId → price string
  const [vpBulkSelected, setVpBulkSelected] = useState<Set<string>>(new Set());
  const [vpBulkPrices, setVpBulkPrices] = useState<Record<string, string>>({});
  const [vpSaving, setVpSaving] = useState(false);
  const [vpSearch, setVpSearch] = useState("");
  const [vpExpanded, setVpExpanded] = useState<Set<string>>(new Set());

  async function loadGroups() {
    setGroupsLoading(true);
    try {
      const data = await apiClient.get<DiscountGroup[]>("/api/v1/admin/discount-groups").catch(() => []);
      setGroups(Array.isArray(data) ? data : []);
    } finally {
      setGroupsLoading(false);
    }
  }

  async function loadVariantPricing() {
    setVpLoading(true);
    try {
      const prods = await apiClient.get<Array<{
        id: string; name: string;
        categories: Array<{ id: string; name: string }>;
        variants?: Array<{ id: string; color?: string | null; size?: string | null; retail_price?: number | string | null }>;
      }>>("/api/v1/admin/products?page_size=200").catch(() => []);
      setVpProducts(
        (Array.isArray(prods) ? prods : []).map(p => ({
          id: String(p.id),
          name: p.name,
          categories: (p.categories || []).map(c => c.name),
          base_price: p.variants?.[0]?.retail_price != null ? Number(p.variants[0].retail_price) : null,
          variants: (p.variants || []).map(v => ({
            id: String(v.id),
            color: v.color || null,
            size: v.size || null,
            retail_price: v.retail_price != null ? Number(v.retail_price) : null,
          })),
        }))
      );
      const overrides = await apiClient.get<Record<string, Record<string, TierOverride>>>("/api/v1/admin/variant-pricing").catch(() => ({}));
      setVpOverrides(overrides ?? {});
      const variantOverrides = await apiClient.get<Record<string, Record<string, string>>>("/api/v1/admin/variant-level-pricing").catch(() => ({}));
      setVpVariantOverrides(variantOverrides ?? {});
    } finally {
      setVpLoading(false);
    }
  }

  async function loadBrowseList(type: "collections" | "products") {
    setBrowseLoading(true);
    setBrowseList([]);
    try {
      if (type === "collections") {
        const cats = await apiClient.get<Array<{ id: string; name: string; children?: Array<{ id: string; name: string }> }>>("/api/v1/products/categories").catch(() => []);
        const flat: BrowseItem[] = [];
        function flatten(arr: Array<{ id: string; name: string; children?: Array<{ id: string; name: string }> }>, depth = 0) {
          for (const c of arr) {
            flat.push({ id: String(c.id), name: depth > 0 ? `  ↳ ${c.name}` : c.name });
            if (c.children?.length) flatten(c.children, depth + 1);
          }
        }
        flatten(Array.isArray(cats) ? cats : []);
        setBrowseList(flat);
      } else {
        const prods = await apiClient.get<Array<{ id: string; name: string }>>("/api/v1/admin/products?page_size=200").catch(() => []);
        setBrowseList((Array.isArray(prods) ? prods : []).map(p => ({ id: String(p.id), name: p.name })));
      }
    } finally {
      setBrowseLoading(false);
    }
  }

  async function loadAllCustomers() {
    try {
      const data = await adminService.listCompanies({ page_size: 200 }) as any;
      const items: CustomerItem[] = data?.items ?? data ?? [];
      setAllCustomers(Array.isArray(items) ? items : []);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    loadGroups();
    if (activeTab === "variants") loadVariantPricing();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "variants" && vpProducts.length === 0) loadVariantPricing();
  }, [activeTab]); // eslint-disable-line

  // ── Discount Group helpers ────────────────────────────────────────────────
  function openCreateGroup() {
    setEditingGroupId(null);
    setGroupForm({ ...EMPTY_GROUP_FORM });
    setBrowseIds([]);
    setBrowseSearch("");
    setBrowseList([]);
    setFlatCalcType("order_value");
    setFlatCutoffTime("");
    setFlatBrackets([]);
    setGroupCustomers([]);
    setCustomerAssignSearch("");
    setShowAddPanel(false);
    setShowGroupModal(true);
    loadAllCustomers();
  }

  function openEditGroup(g: DiscountGroup) {
    setEditingGroupId(g.id);
    setGroupForm({
      title: g.title,
      customer_tag: g.customer_tag,
      applies_to: g.applies_to,
      min_req_type: g.min_req_type,
      min_req_value: g.min_req_value,
      shipping_type: ((g.shipping_type as string) === "custom_brackets" ? "flat_rate" : g.shipping_type) as "store_default" | "flat_rate" | "live_shippo",
      shipping_amount: g.shipping_amount,
      status: g.status,
    });
    setBrowseIds(g.applies_to_ids || []);
    setBrowseSearch("");
    setFlatCalcType(g.shipping_calc_type || "order_value");
    setFlatCutoffTime(g.shipping_cutoff_time || "");
    setFlatBrackets(g.shipping_brackets && g.shipping_brackets.length > 0 ? g.shipping_brackets : []);
    setCustomerAssignSearch("");
    setShowAddPanel(false);
    if (g.applies_to !== "store") loadBrowseList(g.applies_to);
    else setBrowseList([]);
    setShowGroupModal(true);
    loadAllCustomers();
    if (g.customer_tag) {
      loadGroupCustomers(g.customer_tag);
    } else {
      setGroupCustomers([]);
    }
  }

  async function loadGroupCustomers(tag: string) {
    setGroupCustomersLoading(true);
    try {
      const data = await adminService.listCompanies({ page_size: 200 }) as any;
      const items: CustomerItem[] = data?.items ?? data ?? [];
      const assigned = (Array.isArray(items) ? items : []).filter(c =>
        Array.isArray(c.tags) && c.tags.includes(tag)
      );
      setGroupCustomers(assigned);
    } finally {
      setGroupCustomersLoading(false);
    }
  }

  async function toggleCustomerAssignment(customer: CustomerItem, assign: boolean) {
    const tag = groupForm.customer_tag;
    if (!tag) { showToast("Set a Customer Tag first", false); return; }
    const currentTags = Array.isArray(customer.tags) ? customer.tags : [];
    const newTags = assign
      ? [...new Set([...currentTags, tag])]
      : currentTags.filter(t => t !== tag);
    try {
      await adminService.updateCompany(customer.id, { tags: newTags });
      const updated = { ...customer, tags: newTags };
      if (assign) {
        setGroupCustomers(prev => [...prev.filter(c => c.id !== customer.id), updated]);
      } else {
        setGroupCustomers(prev => prev.filter(c => c.id !== customer.id));
      }
      // keep allCustomers in sync
      setAllCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
      showToast(assign ? "Customer assigned to group" : "Customer removed from group");
    } catch {
      showToast("Failed to update customer", false);
    }
  }

  async function handleSaveGroup() {
    if (!groupForm.title.trim()) { showToast("Title is required", false); return; }
    setSavingGroup(true);
    try {
      const payload = {
        ...groupForm,
        applies_to_ids: groupForm.applies_to === "store" ? [] : browseIds,
        shipping_calc_type: flatCalcType,
        shipping_cutoff_time: flatCutoffTime,
        shipping_type: groupForm.shipping_type === "flat_rate" && flatBrackets.length > 0
          ? "custom_brackets"
          : groupForm.shipping_type,
        shipping_brackets: groupForm.shipping_type === "flat_rate" ? flatBrackets : [],
      };
      if (editingGroupId) {
        await apiClient.patch(`/api/v1/admin/discount-groups/${editingGroupId}`, payload);
        showToast("Group updated");
      } else {
        await apiClient.post("/api/v1/admin/discount-groups", payload);
        showToast("Group created");
      }
      setShowGroupModal(false);
      await loadGroups();
    } catch {
      showToast("Save failed", false);
    } finally { setSavingGroup(false); }
  }

  async function handleDeleteGroup(id: string, title: string) {
    if (!confirm(`Delete discount group "${title}"?`)) return;
    try {
      await apiClient.delete(`/api/v1/admin/discount-groups/${id}`);
      showToast("Group deleted");
      await loadGroups();
    } catch { showToast("Delete failed", false); }
  }

  function handleAppliesTo(opt: "store" | "collections" | "products") {
    setGroupForm(f => ({ ...f, applies_to: opt }));
    setBrowseIds([]);
    setBrowseSearch("");
    if (opt !== "store") loadBrowseList(opt);
    else setBrowseList([]);
  }

  // ── Variant Pricing helpers ───────────────────────────────────────────────
  function updateVPOverride(productId: string, groupId: string, field: "price" | "discount", value: string) {
    setVpOverrides(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] ?? {}),
        [groupId]: {
          ...(prev[productId]?.[groupId] ?? { price: "", discount: "" }),
          [field]: value,
        },
      },
    }));
  }

  function updateVPVariantOverride(variantId: string, groupId: string, value: string) {
    setVpVariantOverrides(prev => ({
      ...prev,
      [variantId]: { ...(prev[variantId] ?? {}), [groupId]: value },
    }));
  }

  function applyBulkPrices() {
    if (vpBulkSelected.size === 0) return;
    setVpVariantOverrides(prev => {
      const next = { ...prev };
      for (const vid of vpBulkSelected) {
        for (const [gid, price] of Object.entries(vpBulkPrices)) {
          if (price.trim()) {
            next[vid] = { ...(next[vid] ?? {}), [gid]: price };
          }
        }
      }
      return next;
    });
    setVpBulkSelected(new Set());
    setVpBulkPrices({});
  }

  async function handleSaveVariantPricing() {
    setVpSaving(true);
    try {
      await apiClient.post("/api/v1/admin/variant-pricing", { overrides: vpOverrides });
      await apiClient.post("/api/v1/admin/variant-level-pricing", { overrides: vpVariantOverrides });
      showToast("Pricing saved");
    } catch { showToast("Save failed", false); }
    finally { setVpSaving(false); }
  }

  const filteredGroups = groups.filter(g => !groupSearch || g.title.toLowerCase().includes(groupSearch.toLowerCase()));
  const filteredVpProducts = vpProducts.filter(p =>
    !vpSearch || p.name.toLowerCase().includes(vpSearch.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 9999, background: toast.ok ? "#059669" : "#E8242A", color: "#fff", padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,.15)" }}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>Discount Groups & Pricing</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Manage discount groups and individual variant pricing overrides</p>
        </div>
        {activeTab === "groups" && (
          <button onClick={openCreateGroup} style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            + Create Group
          </button>
        )}
        {activeTab === "variants" && (
          <button onClick={handleSaveVariantPricing} disabled={vpSaving} style={{ padding: "10px 20px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: vpSaving ? 0.6 : 1 }}>
            {vpSaving ? "Saving…" : "Save Pricing"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E2E0DA", marginBottom: "24px" }}>
        {([
          { key: "groups", label: "Discount Groups" },
          { key: "variants", label: "Individual Variant Pricing" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "#1A5CFF" : "#7A7880",
              borderBottom: activeTab === tab.key ? "2px solid #1A5CFF" : "2px solid transparent",
              marginBottom: "-2px", whiteSpace: "nowrap",
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Discount Groups ── */}
      {activeTab === "groups" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Search groups…" style={{ ...inputStyle, maxWidth: "320px" }} />
          </div>

          {groupsLoading ? (
            <div style={{ textAlign: "center", padding: "60px", color: "#bbb", fontSize: "14px" }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px" }}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#2A2830", marginBottom: "6px" }}>No Discount Groups</div>
              <div style={{ fontSize: "13px", color: "#7A7880", marginBottom: "20px" }}>Create a group to apply discounts and shipping rules to tagged customers</div>
              <button onClick={openCreateGroup} style={{ padding: "10px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>+ Create First Group</button>
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#FAFAF8", borderBottom: "2px solid #E2E0DA" }}>
                    {["Title", "Customer Tag", "Applies To", "Min Requirement", "Shipping", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g, i) => (
                    <tr key={g.id} style={{ borderBottom: i < filteredGroups.length - 1 ? "1px solid #F0EDE8" : "none" }}>
                      <td style={{ padding: "13px 16px", fontWeight: 700, color: "#2A2830" }}>{g.title}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ background: "#F4F3EF", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600 }}>{g.customer_tag || "—"}</span>
                      </td>
                      <td style={{ padding: "13px 16px", color: "#7A7880", textTransform: "capitalize" }}>
                        {g.applies_to.replace("_", " ")}
                        {g.applies_to_ids?.length > 0 && <span style={{ marginLeft: "4px", fontSize: "11px", color: "#1A5CFF" }}>({g.applies_to_ids.length})</span>}
                      </td>
                      <td style={{ padding: "13px 16px", color: "#7A7880" }}>
                        {g.min_req_type === "none" ? "None" : g.min_req_type === "amount" ? `$${g.min_req_value}` : `${g.min_req_value} units`}
                      </td>
                      <td style={{ padding: "13px 16px", color: "#7A7880" }}>
                        {g.shipping_type === "flat_rate"
                          ? `${g.shipping_brackets?.length ?? 0} bracket${(g.shipping_brackets?.length ?? 0) !== 1 ? "s" : ""} (${g.shipping_calc_type === "units" ? "by units" : "by order $"})`
                          : g.shipping_type === "live_shippo"
                            ? "Live rates (Shippo)"
                            : "Store default"}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ background: g.status === "enabled" ? "rgba(5,150,105,.1)" : "rgba(0,0,0,.06)", color: g.status === "enabled" ? "#059669" : "#7A7880", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>{g.status}</span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => openEditGroup(g)} style={{ background: "#F4F3EF", border: "1px solid #E2E0DA", padding: "5px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", color: "#2A2830" }}>Edit</button>
                          <button onClick={() => handleDeleteGroup(g.id, g.title)} style={{ background: "rgba(232,36,42,.06)", border: "1px solid rgba(232,36,42,.2)", padding: "5px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", color: "#E8242A" }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Individual Variant Pricing ── */}
      {activeTab === "variants" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center" }}>
            <input value={vpSearch} onChange={e => setVpSearch(e.target.value)} placeholder="Search products…" style={{ ...inputStyle, maxWidth: "320px" }} />
            <span style={{ fontSize: "12px", color: "#7A7880" }}>Set per-group prices or discounts; leave blank to use group default</span>
          </div>

          {vpLoading ? (
            <div style={{ textAlign: "center", padding: "60px", color: "#bbb", fontSize: "14px" }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px" }}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "18px", color: "#2A2830", marginBottom: "6px" }}>No Discount Groups</div>
              <div style={{ fontSize: "13px", color: "#7A7880" }}>Create discount groups first to set per-group variant pricing</div>
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "600px" }}>
                <thead>
                  <tr style={{ background: "#FAFAF8", borderBottom: "2px solid #E2E0DA" }}>
                    <th style={{ padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em", minWidth: "200px" }}>Product</th>
                    <th style={{ padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase", letterSpacing: ".06em" }}>Categories</th>
                    {groups.map(group => (
                      <th key={group.id} style={{ padding: "11px 12px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#1A5CFF", textTransform: "uppercase", letterSpacing: ".06em", minWidth: "140px", borderLeft: "1px solid #E2E0DA" }}>
                        {group.title}
                        <div style={{ fontSize: "10px", color: "#7A7880", fontWeight: 500, marginTop: "1px", textTransform: "none" }}>
                          {group.customer_tag ? `@${group.customer_tag}` : group.applies_to}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVpProducts.length === 0 ? (
                    <tr><td colSpan={2 + groups.length} style={{ padding: "40px", textAlign: "center", color: "#bbb" }}>
                      {vpProducts.length === 0 ? "No products found" : "No products match your search"}
                    </td></tr>
                  ) : filteredVpProducts.map((product, i) => {
                    const isExp = vpExpanded.has(product.id);
                    function toggleExp() {
                      setVpExpanded(prev => { const s = new Set(prev); s.has(product.id) ? s.delete(product.id) : s.add(product.id); return s; });
                    }
                    return (
                      <>
                        <tr key={product.id} style={{ borderBottom: "1px solid #F0EDE8" }}>
                          <td style={{ padding: "10px 16px" }}>
                            <button onClick={toggleExp} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "9px", color: "#aaa", display: "inline-block", transform: isExp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s", flexShrink: 0 }}>▶</span>
                              <span style={{ fontWeight: 600, color: "#2A2830", fontSize: "12px" }}>{product.name}</span>
                            </button>
                            <div style={{ fontSize: "10px", color: "#bbb", marginLeft: "15px", marginTop: "1px" }}>{product.variants.length} variant{product.variants.length !== 1 ? "s" : ""}</div>
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {(product.categories ?? []).slice(0, 3).map(cat => (
                                <span key={cat} style={{ background: "#F4F3EF", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", color: "#7A7880" }}>{cat}</span>
                              ))}
                            </div>
                          </td>
                          {groups.map(group => {
                            const ov = vpOverrides[product.id]?.[group.id] ?? { price: "", discount: "" };
                            const discountAmt = ov.price ? parseFloat(ov.price) : null;
                            const bp = product.base_price;
                            const calcDiscount = (discountAmt != null && bp != null && bp > 0)
                              ? (discountAmt / bp * 100).toFixed(1)
                              : null;
                            return (
                              <td key={group.id} style={{ padding: "8px 12px", borderLeft: "1px solid #E2E0DA" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                    <span style={{ fontSize: "11px", color: "#aaa" }}>-$</span>
                                    <input
                                      type="number"
                                      value={ov.price}
                                      onChange={e => updateVPOverride(product.id, group.id, "price", e.target.value)}
                                      placeholder="0.00"
                                      style={{ width: "72px", padding: "4px 6px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "12px", textAlign: "center" }}
                                    />
                                  </div>
                                  {calcDiscount != null ? (
                                    <div style={{ fontSize: "10px", color: "#059669", fontWeight: 700, textAlign: "center" }}>
                                      ≈ {calcDiscount}% off
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: "10px", color: "#ddd", textAlign: "center" }}>— %</div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                        {isExp && (
                          <tr key={`${product.id}-variants`}>
                            <td colSpan={2 + groups.length} style={{ padding: 0, background: "#FAFAF8", borderBottom: "2px solid #E8E6E0" }}>
                              {/* Bulk edit bar — shown when variants are selected */}
                              {vpBulkSelected.size > 0 && product.variants.some(v => vpBulkSelected.has(v.id)) && (
                                <div style={{ padding: "10px 16px", background: "rgba(26,92,255,.06)", borderBottom: "1px solid rgba(26,92,255,.15)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#1A5CFF" }}>
                                    {vpBulkSelected.size} variant{vpBulkSelected.size !== 1 ? "s" : ""} selected
                                  </span>
                                  <span style={{ fontSize: "11px", color: "#7A7880" }}>Set price for each group:</span>
                                  {groups.map(g => (
                                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <span style={{ fontSize: "11px", color: "#7A7880", whiteSpace: "nowrap" }}>{g.title}:</span>
                                      <span style={{ fontSize: "11px", color: "#aaa" }}>$</span>
                                      <input
                                        type="number"
                                        value={vpBulkPrices[g.id] ?? ""}
                                        onChange={e => setVpBulkPrices(p => ({ ...p, [g.id]: e.target.value }))}
                                        placeholder="0.00"
                                        style={{ width: "70px", padding: "4px 6px", border: "1px solid rgba(26,92,255,.3)", borderRadius: "5px", fontSize: "12px", textAlign: "center" }}
                                      />
                                    </div>
                                  ))}
                                  <button
                                    onClick={applyBulkPrices}
                                    style={{ padding: "5px 14px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                                  >Apply to Selected</button>
                                  <button
                                    onClick={() => { setVpBulkSelected(new Set()); setVpBulkPrices({}); }}
                                    style={{ padding: "5px 10px", background: "none", border: "1px solid #E2E0DA", borderRadius: "6px", fontSize: "12px", color: "#7A7880", cursor: "pointer" }}
                                  >Clear</button>
                                </div>
                              )}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                                <thead>
                                  <tr style={{ background: "#F0EDE8" }}>
                                    <th style={{ padding: "5px 8px 5px 16px", width: "30px" }} />
                                    <th style={{ padding: "5px 12px", textAlign: "left", color: "#7A7880", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", fontSize: "10px" }}>Color</th>
                                    <th style={{ padding: "5px 12px", textAlign: "left", color: "#7A7880", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", fontSize: "10px" }}>Size</th>
                                    <th style={{ padding: "5px 12px", textAlign: "right", color: "#7A7880", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", fontSize: "10px" }}>MSRP</th>
                                    {groups.map(g => (
                                      <th key={g.id} style={{ padding: "5px 12px", textAlign: "center", color: "#1A5CFF", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", fontSize: "10px" }}>
                                        {g.title}
                                        <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 500, textTransform: "none" }}>Price ($)</div>
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {product.variants.length === 0 ? (
                                    <tr><td colSpan={4 + groups.length} style={{ padding: "10px 32px", color: "#bbb", fontSize: "11px" }}>No variants</td></tr>
                                  ) : product.variants.map(v => {
                                    const isSelected = vpBulkSelected.has(v.id);
                                    return (
                                      <tr key={v.id} style={{ borderTop: "1px solid #EDE9E3", background: isSelected ? "rgba(26,92,255,.04)" : "transparent" }}>
                                        <td style={{ padding: "5px 8px 5px 16px", textAlign: "center" }}>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={e => {
                                              setVpBulkSelected(prev => {
                                                const s = new Set(prev);
                                                e.target.checked ? s.add(v.id) : s.delete(v.id);
                                                return s;
                                              });
                                            }}
                                            style={{ accentColor: "#1A5CFF", width: "14px", height: "14px", cursor: "pointer" }}
                                          />
                                        </td>
                                        <td style={{ padding: "5px 12px", color: "#555" }}>{v.color || "—"}</td>
                                        <td style={{ padding: "5px 12px", color: "#555" }}>{v.size || "—"}</td>
                                        <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "monospace", color: "#2A2830" }}>
                                          {v.retail_price != null ? `$${v.retail_price.toFixed(2)}` : "—"}
                                        </td>
                                        {groups.map(g => {
                                          const variantPrice = vpVariantOverrides[v.id]?.[g.id] ?? "";
                                          return (
                                            <td key={g.id} style={{ padding: "4px 10px", textAlign: "center" }}>
                                              <div style={{ display: "flex", alignItems: "center", gap: "3px", justifyContent: "center" }}>
                                                <span style={{ fontSize: "11px", color: "#aaa" }}>$</span>
                                                <input
                                                  type="number"
                                                  value={variantPrice}
                                                  onChange={e => updateVPVariantOverride(v.id, g.id, e.target.value)}
                                                  placeholder={(() => {
                                                    const gOv = vpOverrides[product.id]?.[g.id] ?? { price: "", discount: "" };
                                                    return gOv.price || "0.00";
                                                  })()}
                                                  style={{ width: "70px", padding: "4px 6px", border: `1px solid ${variantPrice ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "5px", fontSize: "12px", textAlign: "center", background: variantPrice ? "rgba(26,92,255,.04)" : "#fff" }}
                                                />
                                              </div>
                                              {variantPrice && (
                                                <div style={{ fontSize: "10px", color: "#059669", fontWeight: 700, textAlign: "center", marginTop: "2px" }}>
                                                  ${parseFloat(variantPrice).toFixed(2)}
                                                </div>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DISCOUNT GROUP MODAL ──────────────────────────────────────────── */}
      {showGroupModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "700px", padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
              <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", color: "#2A2830" }}>
                {editingGroupId ? "EDIT DISCOUNT GROUP" : "CREATE DISCOUNT GROUP"}
              </h2>
              <button onClick={() => setShowGroupModal(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#7A7880" }}>✕</button>
            </div>

            {/* Status toggle */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#7A7880" }}>Status</span>
                <div onClick={() => setGroupForm(f => ({ ...f, status: f.status === "enabled" ? "disabled" : "enabled" }))}
                  style={{ position: "relative", width: "44px", height: "24px", borderRadius: "12px", background: groupForm.status === "enabled" ? "#059669" : "#E2E0DA", cursor: "pointer", transition: "background .2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "3px", left: groupForm.status === "enabled" ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: groupForm.status === "enabled" ? "#059669" : "#7A7880" }}>{groupForm.status === "enabled" ? "Enabled" : "Disabled"}</span>
              </label>
            </div>

            {/* Title */}
            <div style={sectionBox}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "13px", letterSpacing: ".1em", color: "#7A7880", marginBottom: "14px" }}>BASIC INFO</div>
              <div>
                <label style={labelStyle}>Title *</label>
                <input value={groupForm.title} onChange={e => setGroupForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. VIP Wholesale Group" style={inputStyle} />
              </div>
            </div>

            {/* Customer Tag + Assigned Customers */}
            <div style={sectionBox}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "13px", letterSpacing: ".1em", color: "#7A7880", marginBottom: "14px" }}>CUSTOMER TAG & ASSIGNMENT</div>

              <div style={{ marginBottom: "16px" }}>
                <label style={labelStyle}>Customer Tag</label>
                <input
                  value={groupForm.customer_tag}
                  onChange={e => setGroupForm(f => ({ ...f, customer_tag: e.target.value }))}
                  onBlur={e => {
                    if (e.target.value.trim()) loadGroupCustomers(e.target.value.trim());
                    else setGroupCustomers([]);
                  }}
                  placeholder="e.g. vip, tier-1, wholesale-b"
                  style={inputStyle}
                />
                <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>
                  Customers with this tag are automatically part of this group
                </p>
              </div>

              {/* Assigned customers — always visible */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Assigned Customers{groupCustomers.length > 0 ? ` (${groupCustomers.length})` : ""}
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowAddPanel(p => !p); if (!showAddPanel) { loadAllCustomers(); setCustomerAssignSearch(""); } }}
                    style={{ padding: "5px 12px", background: showAddPanel ? "#E2E0DA" : "rgba(26,92,255,.08)", border: `1px solid ${showAddPanel ? "#ccc" : "rgba(26,92,255,.2)"}`, color: showAddPanel ? "#7A7880" : "#1A5CFF", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                  >{showAddPanel ? "✕ Close" : "+ Add"}</button>
                </div>

                {groupCustomersLoading ? (
                  <div style={{ fontSize: "12px", color: "#bbb", padding: "8px 0" }}>Loading…</div>
                ) : groupCustomers.length > 0 ? (
                  <div style={{ border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", maxHeight: "150px", overflowY: "auto" }}>
                    {groupCustomers.map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #F4F3EF" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{c.name}</span>
                        <button
                          onClick={() => toggleCustomerAssignment(c, false)}
                          style={{ background: "rgba(232,36,42,.06)", border: "1px solid rgba(232,36,42,.2)", color: "#E8242A", padding: "4px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                        >Remove</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#bbb", padding: "4px 0" }}>No customers assigned yet</div>
                )}

                {/* Add panel — visible when "+ Add" is clicked */}
                {showAddPanel && (
                  <div style={{ border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", overflow: "hidden", marginTop: "10px" }}>
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #F4F3EF" }}>
                      <input
                        value={customerAssignSearch}
                        onChange={e => setCustomerAssignSearch(e.target.value)}
                        placeholder="Search by company name…"
                        style={{ ...inputStyle, fontSize: "13px" }}
                        autoFocus
                      />
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {(() => {
                        const unassigned = allCustomers.filter(c => {
                          if (groupCustomers.some(gc => gc.id === c.id)) return false;
                          if (!customerAssignSearch.trim()) return true;
                          return c.name?.toLowerCase().includes(customerAssignSearch.toLowerCase());
                        });
                        if (unassigned.length === 0) {
                          return (
                            <div style={{ padding: "20px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>
                              {allCustomers.length === 0 ? "Loading customers…" : "No more customers to add"}
                            </div>
                          );
                        }
                        return unassigned.slice(0, 20).map(c => (
                          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #F4F3EF" }}>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>{c.name}</span>
                            <button
                              onClick={() => toggleCustomerAssignment(c, true)}
                              style={{ background: "rgba(26,92,255,.08)", border: "1px solid rgba(26,92,255,.2)", color: "#1A5CFF", padding: "4px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                            >Add</button>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Applies To */}
            <div style={sectionBox}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "13px", letterSpacing: ".1em", color: "#7A7880", marginBottom: "12px" }}>APPLIES TO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(["store", "collections", "products"] as const).map(opt => (
                  <div key={opt}>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: groupForm.applies_to === opt ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${groupForm.applies_to === opt ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                      <input type="radio" name="applies_to" value={opt} checked={groupForm.applies_to === opt} onChange={() => handleAppliesTo(opt)} style={{ accentColor: "#1A5CFF" }} />
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>
                          {opt === "store" ? "Entire Store" : opt === "collections" ? "Selected Collections" : "Selected Products"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#7A7880" }}>
                          {opt === "store" ? "Applies to all products" : opt === "collections" ? "Choose specific collections" : "Choose specific products"}
                        </div>
                      </div>
                    </label>
                    {groupForm.applies_to === opt && opt !== "store" && (
                      <div style={{ marginTop: "8px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E0DA", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", color: "#aaa" }}>🔍</span>
                          <input value={browseSearch} onChange={e => setBrowseSearch(e.target.value)} placeholder={`Search ${opt}…`} style={{ flex: 1, border: "none", outline: "none", fontSize: "13px", fontFamily: "var(--font-jakarta)" }} />
                          {browseIds.length > 0 && <span style={{ fontSize: "11px", fontWeight: 700, color: "#1A5CFF", whiteSpace: "nowrap" }}>{browseIds.length} selected</span>}
                        </div>
                        <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                          {browseLoading ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>Loading…</div>
                          ) : browseList.filter(item => !browseSearch || item.name.toLowerCase().includes(browseSearch.toLowerCase())).map(item => (
                            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid #F4F3EF", background: browseIds.includes(item.id) ? "rgba(26,92,255,.04)" : "transparent" }}>
                              <input type="checkbox" checked={browseIds.includes(item.id)} onChange={e => setBrowseIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} style={{ accentColor: "#1A5CFF", width: "15px", height: "15px", flexShrink: 0 }} />
                              <span style={{ fontSize: "13px", color: "#2A2830" }}>{item.name}</span>
                            </label>
                          ))}
                        </div>
                        {browseIds.length > 0 && (
                          <div style={{ padding: "8px 14px", borderTop: "1px solid #E2E0DA", background: "#F4F3EF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "12px", color: "#2A2830", fontWeight: 600 }}>{browseIds.length} {opt === "collections" ? "collection" : "product"}{browseIds.length !== 1 ? "s" : ""} selected</span>
                            <button onClick={() => setBrowseIds([])} style={{ background: "none", border: "none", fontSize: "12px", color: "#E8242A", cursor: "pointer", fontWeight: 600 }}>Clear all</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Minimum Requirements */}
            <div style={sectionBox}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "13px", letterSpacing: ".1em", color: "#7A7880", marginBottom: "12px" }}>MINIMUM REQUIREMENTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(["none", "amount", "quantity"] as const).map(opt => (
                  <label key={opt} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: groupForm.min_req_type === opt ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${groupForm.min_req_type === opt ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                    <input type="radio" name="min_req" value={opt} checked={groupForm.min_req_type === opt} onChange={() => setGroupForm(f => ({ ...f, min_req_type: opt }))} style={{ accentColor: "#1A5CFF" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>
                        {opt === "none" ? "No minimum" : opt === "amount" ? "Minimum purchase amount" : "Minimum quantity of items"}
                      </div>
                    </div>
                    {groupForm.min_req_type === opt && opt !== "none" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {opt === "amount" && <span style={{ fontSize: "13px", color: "#7A7880" }}>$</span>}
                        <input type="number" value={groupForm.min_req_value} onChange={e => setGroupForm(f => ({ ...f, min_req_value: parseFloat(e.target.value) || 0 }))} style={{ width: "90px", padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "5px", fontSize: "13px", textAlign: "center" }} />
                        {opt === "quantity" && <span style={{ fontSize: "13px", color: "#7A7880" }}>units</span>}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Shipping Rate */}
            <div style={sectionBox}>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "13px", letterSpacing: ".1em", color: "#7A7880", marginBottom: "12px" }}>SHIPPING RATE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

                {/* Store Default */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: groupForm.shipping_type === "store_default" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${groupForm.shipping_type === "store_default" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                    <input type="radio" name="shipping_type" value="store_default" checked={groupForm.shipping_type === "store_default"} onChange={() => setGroupForm(f => ({ ...f, shipping_type: "store_default" }))} style={{ accentColor: "#1A5CFF" }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Store Default</div>
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>Flat shipping rate for this group</div>
                    </div>
                  </label>
                  {groupForm.shipping_type === "store_default" && (
                    <div style={{ marginTop: "10px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "14px 16px" }}>
                      <label style={labelStyle}>Shipping Amount</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", color: "#7A7880" }}>$</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={groupForm.shipping_amount}
                          onChange={e => setGroupForm(f => ({ ...f, shipping_amount: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          style={{ ...inputStyle, width: "130px" }}
                        />
                        {Number(groupForm.shipping_amount) === 0 && (
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669", background: "rgba(5,150,105,.1)", padding: "2px 8px", borderRadius: "4px" }}>FREE</span>
                        )}
                      </div>
                      <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "6px" }}>
                        Flat shipping cost for customers in this group. Set 0.00 for free shipping.
                      </p>
                    </div>
                  )}
                </div>

                {/* Flat Rate (full shipping tier UI) */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: groupForm.shipping_type === "flat_rate" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${groupForm.shipping_type === "flat_rate" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                    <input type="radio" name="shipping_type" value="flat_rate" checked={groupForm.shipping_type === "flat_rate"} onChange={() => setGroupForm(f => ({ ...f, shipping_type: "flat_rate" }))} style={{ accentColor: "#1A5CFF" }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Custom Shipping Rate</div>
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>Define bracket-based shipping rates for this group</div>
                    </div>
                  </label>

                  {groupForm.shipping_type === "flat_rate" && (
                    <div style={{ marginTop: "10px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "16px" }}>
                      {/* Calculation Type */}
                      <div style={{ marginBottom: "14px" }}>
                        <label style={labelStyle}>Calculation Type</label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {(["units", "order_value"] as const).map(t => (
                            <button key={t} type="button"
                              onClick={() => { setFlatCalcType(t); setFlatBrackets([]); }}
                              style={{
                                flex: 1, padding: "9px 12px", border: `2px solid ${flatCalcType === t ? "#1A5CFF" : "#E2E0DA"}`,
                                borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                                background: flatCalcType === t ? "rgba(26,92,255,.06)" : "#fff",
                                color: flatCalcType === t ? "#1A5CFF" : "#7A7880",
                              }}>
                              {t === "units" ? "📦 Per Unit Count" : "💰 Per Order Value"}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "5px" }}>
                          {flatCalcType === "units"
                            ? "Shipping cost based on total number of items in the order."
                            : "Shipping cost based on order dollar total. Set cost $0 for free shipping above a threshold."}
                        </div>
                      </div>

                      {/* Cutoff Time */}
                      <div style={{ marginBottom: "14px" }}>
                        <label style={labelStyle}>Order Cutoff Time</label>
                        <input
                          value={flatCutoffTime}
                          onChange={e => setFlatCutoffTime(e.target.value)}
                          placeholder="e.g. 12PM"
                          style={{ ...inputStyle, width: "130px" }}
                        />
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Shown to customers on checkout.</div>
                      </div>

                      {/* Pricing Brackets */}
                      <div>
                        <label style={{ ...labelStyle, marginBottom: "10px" }}>Pricing Brackets</label>
                        <BracketEditor
                          brackets={flatBrackets}
                          calcType={flatCalcType}
                          onChange={setFlatBrackets}
                        />
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>
                          {flatCalcType === "units"
                            ? "Each row covers a unit range. Leave Max blank on the last row to cover all quantities above."
                            : "Each row covers a dollar range. Set cost $0.00 to offer free shipping above a certain amount."}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Shippo Rates */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: groupForm.shipping_type === "live_shippo" ? "rgba(26,92,255,.06)" : "#fff", border: `1.5px solid ${groupForm.shipping_type === "live_shippo" ? "#1A5CFF" : "#E2E0DA"}`, borderRadius: "7px", cursor: "pointer" }}>
                    <input type="radio" name="shipping_type" value="live_shippo" checked={groupForm.shipping_type === "live_shippo"} onChange={() => setGroupForm(f => ({ ...f, shipping_type: "live_shippo" }))} style={{ accentColor: "#1A5CFF" }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#2A2830" }}>Live Shipping Rates (via Shippo)</div>
                      <div style={{ fontSize: "11px", color: "#7A7880" }}>Real-time carrier rates fetched at checkout for this group</div>
                    </div>
                  </label>
                  {groupForm.shipping_type === "live_shippo" && (
                    <div style={{ marginTop: "8px", marginLeft: "12px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", padding: "12px 14px" }}>
                      <p style={{ fontSize: "12px", color: "#2A2830", lineHeight: 1.6, margin: 0 }}>
                        Customers in this group will see live carrier rates (USPS, UPS, FedEx) at checkout and can select their preferred service.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowGroupModal(false)} style={{ padding: "11px 22px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Cancel</button>
              <button onClick={handleSaveGroup} disabled={savingGroup} style={{ padding: "11px 22px", background: savingGroup ? "#aaa" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: savingGroup ? "not-allowed" : "pointer" }}>
                {savingGroup ? "Saving…" : editingGroupId ? "Save Changes" : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
