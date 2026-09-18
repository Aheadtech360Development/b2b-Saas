"use client";

import { useEffect, useState } from "react";
import {
  suppliersService, type CatalogStyle, type Filters, type SupplierConfig, type SupplierJob,
} from "@/services/suppliers.service";
import { FilterEditor, cleanFilters, sameFilters } from "./FilterEditor";
import { Badge, Btn, CARD, MUTED, Pager, Spinner, Thumb, errText } from "./ui";

type Preview = { products: number; already_imported: number; items: CatalogStyle[]; page: number; pages: number };

/** Auto-count variants below this many products; above it the count waits for a click. */
const AUTO_COUNT = 50;

export function ProductsForImport({
  id, config, running, dataVersion, onSaved, onJobStarted, onBrowse,
}: {
  id: string; config: SupplierConfig; running: boolean; dataVersion: number;
  onSaved: (c: SupplierConfig) => void; onJobStarted: (j: SupplierJob) => void; onBrowse: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(config.filters);
  const [lists, setLists] = useState<{ brands: string[]; categories: string[] }>({ brands: [], categories: [] });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<{ variants: number | null; note?: string } | null>(null);
  const [counting, setCounting] = useState(false);
  const [starting, setStarting] = useState(false);

  const saved = config.filters;
  const dirty = !sameFilters(draft, saved);
  const hasRules = saved.rules.length > 0;

  // Keep the editor in step when the saved filters change elsewhere (Browse tab).
  useEffect(() => { setDraft(config.filters); }, [config.filters]);

  useEffect(() => {
    suppliersService.brands(id)
      .then((r) => setLists({ brands: r.brands.map((b) => b.brand), categories: r.categories }))
      .catch(() => { /* suggestions only */ });
  }, [id]);

  // What the saved filters select.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (!hasRules) { setPreview(null); setCount(null); return; }
    let live = true;
    setLoading(true);
    setError("");
    suppliersService.preview(id, page)
      .then((p) => { if (live) setPreview(p); })
      .catch((e) => { if (live) { setError(errText(e)); setPreview(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, savedKey, page, dataVersion]);

  const loadCount = async () => {
    setCounting(true);
    try {
      const c = await suppliersService.previewCount(id);
      setCount({ variants: c.variants, note: c.note });
    } catch (e) {
      setCount({ variants: null, note: errText(e) });
    }
    setCounting(false);
  };

  // New selection → new variant total; small selections count themselves.
  useEffect(() => {
    setCount(null);
    if (hasRules && preview && preview.products > 0 && preview.products <= AUTO_COUNT) loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, preview?.products]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { config: c } = await suppliersService.update(id, { filters: cleanFilters(draft) });
      onSaved(c);
      setPage(1);
    } catch (e) {
      setError(errText(e));
    }
    setSaving(false);
  };

  const startImport = async () => {
    setStarting(true);
    setError("");
    try {
      const { job } = await suppliersService.startImport(id);
      onJobStarted(job);
    } catch (e) {
      setError(errText(e));
    }
    setStarting(false);
  };

  const toImport = preview ? preview.products - preview.already_imported : 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Import filters</div>
            <p style={MUTED}>Choose which products to bring into your store. Not sure what to pick? <a onClick={onBrowse} style={{ color: "#2563EB", cursor: "pointer" }}>Browse the catalog</a>.</p>
          </div>
        </div>
        <FilterEditor value={draft} onChange={setDraft} brands={lists.brands} categories={lists.categories} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          {dirty && <Btn kind="ghost" onClick={() => setDraft(saved)}>Discard</Btn>}
          <Btn onClick={save} disabled={!dirty} busy={saving}>Save filters</Btn>
        </div>
      </div>

      {error && <div style={{ ...CARD, borderColor: "#F5C2C0", background: "#FFF5F5", color: "#B42318" }}>{error}</div>}

      {hasRules && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          <Stat label="Products selected" value={preview?.products} loading={loading && !preview} />
          <Stat label="Already in your store" value={preview?.already_imported} loading={loading && !preview} />
          <Stat label="Ready to import" value={preview ? toImport : undefined} loading={loading && !preview} />
          <div style={CARD}>
            <div style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 4 }}>Variants (colour × size)</div>
            {counting ? <Spinner size={16} /> : count?.variants != null ? (
              <div style={{ fontSize: 22, fontWeight: 700 }}>{count.variants.toLocaleString()}</div>
            ) : count?.note ? (
              <div style={{ fontSize: 12, color: "#8A8A8A" }}>{count.note}</div>
            ) : (
              <Btn kind="ghost" onClick={loadCount} disabled={!preview?.products}>Count variants</Btn>
            )}
          </div>
        </div>
      )}

      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Products for import</div>
          {loading && preview && <Spinner size={14} />}
          <div style={{ flex: 1 }} />
          <Btn onClick={startImport} busy={starting}
            disabled={!hasRules || dirty || running || !preview || toImport <= 0}
            title={dirty ? "Save your filters first" : running ? "A job is already running" : toImport <= 0 ? "Everything selected is already imported" : undefined}>
            {toImport > 0 ? `Import ${toImport.toLocaleString()} product${toImport === 1 ? "" : "s"}` : "Import products"}
          </Btn>
        </div>
        {dirty && <p style={{ ...MUTED, marginBottom: 10, color: "#B45309" }}>You have unsaved filter changes — save them to update this list.</p>}
        {toImport > 500 && <p style={{ ...MUTED, marginBottom: 10 }}>Up to 500 products are imported per run; run it again (or let automatic sync with auto import do it) for the rest.</p>}

        {!hasRules ? (
          <p style={MUTED}>Add at least one filter rule and save to see which products will be imported.</p>
        ) : loading && !preview ? (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
        ) : !preview || preview.items.length === 0 ? (
          <p style={MUTED}>No products match these filters. Try a different brand or use “contains”.</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6B6B6B" }}>
                    {["", "Style", "Brand", "Title", "Sizes", "Colours", "Variants", "Status"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid #EEE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((s) => (
                    <tr key={s.style_id} style={{ borderBottom: "1px solid #F4F4F4" }}>
                      <td style={{ padding: "8px 10px" }}><Thumb src={s.image} alt={s.title} /></td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{s.style_name || s.part_number}</td>
                      <td style={{ padding: "8px 10px" }}>{s.brand}</td>
                      <td style={{ padding: "8px 10px", maxWidth: 280 }}>
                        <div>{s.title}</div>
                        {s.description && <div style={{ fontSize: 12, color: "#8A8A8A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{s.description}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#4A4A4A" }}>{sizeRange(s.sizes)}</td>
                      <td style={{ padding: "8px 10px" }}>{s.colors ?? "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{s.variants ?? "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {s.is_imported ? <Badge text="Imported" color="#16A34A" /> : <Badge text="New" color="#2563EB" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={preview.page} pages={preview.pages} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value?: number; loading?: boolean }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 4 }}>{label}</div>
      {loading ? <Spinner size={16} /> : <div style={{ fontSize: 22, fontWeight: 700 }}>{value == null ? "—" : value.toLocaleString()}</div>}
    </div>
  );
}

function sizeRange(sizes?: string[]) {
  if (!sizes || sizes.length === 0) return "—";
  return sizes.length <= 2 ? sizes.join(", ") : `${sizes[0]} – ${sizes[sizes.length - 1]}`;
}
