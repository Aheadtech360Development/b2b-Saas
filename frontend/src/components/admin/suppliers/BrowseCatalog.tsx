"use client";

import { useEffect, useState } from "react";
import { suppliersService, type CatalogStyle, type FilterRule, type SupplierConfig } from "@/services/suppliers.service";
import { supplierCatalogService } from "@/services/supplierCatalog.service";
import { Badge, Btn, CARD, INPUT, MUTED, Pager, Spinner, errText } from "./ui";

/** Browse the supplier's whole catalogue and add products or brands to the import filters. */
export function BrowseCatalog({
  id, config, dataVersion, onSaved,
}: {
  id: string; config: SupplierConfig; dataVersion: number; onSaved: (c: SupplierConfig) => void;
}) {
  const [brands, setBrands] = useState<{ brand: string; styles: number }[]>([]);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: CatalogStyle[]; total: number; page: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    suppliersService.brands(id).then((r) => setBrands(r.brands)).catch((e) => setError(errText(e)));
  }, [id]);

  // Type, pause, search.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const filtersKey = JSON.stringify(config.filters);
  useEffect(() => {
    let live = true;
    setLoading(true);
    suppliersService.catalog(id, { q: query, brand, page })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(errText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, query, brand, page, filtersKey, dataVersion, refresh]);

  const rules = config.filters.rules;
  // With "match all", one more rule narrows the selection instead of widening it.
  const canAdd = config.filters.match === "any" || rules.length === 0;
  const addBlocked = "Your filters use “match all rules”. Switch to “any rule” in Products for Import to add products one by one.";

  const addRule = async (rule: FilterRule, what: string) => {
    if (rules.some((r) => r.field === rule.field && r.op === rule.op && r.value.toLowerCase() === rule.value.toLowerCase())) {
      setNotice(`${what} is already in your import filters.`);
      return;
    }
    setBusy(`${rule.field}:${rule.value}`);
    try {
      const { config: c } = await suppliersService.update(id, { filters: { match: config.filters.match, rules: [...rules, rule] } });
      onSaved(c);
      setNotice(`${what} added to your import filters. Import it from Products for Import.`);
    } catch (e) {
      setNotice(errText(e));
    }
    setBusy("");
  };

  const importNow = async (s: CatalogStyle) => {
    setBusy(`now:${s.style_id}`);
    try {
      const r = await supplierCatalogService.importProduct(s.style_id);
      setNotice(r.message || `${s.brand} ${s.style_name} imported.`);
      setRefresh((n) => n + 1);
    } catch (e) {
      setNotice(errText(e));
    }
    setBusy("");
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...CARD, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search style number, name or brand…"
          style={{ ...INPUT, flex: "1 1 240px" }} />
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} style={{ ...INPUT, flex: "0 1 240px" }}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.styles})</option>)}
        </select>
        {brand && (
          <Btn kind="ghost" disabled={!canAdd} title={canAdd ? undefined : addBlocked}
            busy={busy === `brand:${brand}`} onClick={() => addRule({ field: "brand", op: "equals", value: brand }, `Every ${brand} product`)}>
            Add all {brand} to import
          </Btn>
        )}
        <span style={MUTED}>{data ? `${data.total.toLocaleString()} products` : ""}</span>
      </div>

      {notice && (
        <div style={{ ...CARD, background: "#F6F9FF", borderColor: "#C9D8F5", fontSize: 13, display: "flex", gap: 10 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button onClick={() => setNotice("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A8A" }}>×</button>
        </div>
      )}
      {error && <div style={{ ...CARD, borderColor: "#F5C2C0", background: "#FFF5F5", color: "#B42318" }}>{error}</div>}

      {loading && !data ? (
        <div style={{ padding: 30, textAlign: "center" }}><Spinner /></div>
      ) : data && data.items.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center" }}><p style={MUTED}>No products found.</p></div>
      ) : data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12, opacity: loading ? 0.6 : 1 }}>
            {data.items.map((s) => {
              const styleRule: FilterRule = { field: "style", op: "equals", value: `${s.brand} ${s.style_name}`.trim() };
              return (
                <div key={s.style_id} style={{ ...CARD, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ aspectRatio: "1 / 1", background: "#F6F6F6", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {s.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.image} alt={s.title} loading="lazy" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      : <span style={{ fontSize: 12, color: "#B0B0B0" }}>No image</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8A8A" }}>{s.brand} · {s.style_name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, minHeight: 35 }}>{s.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 20 }}>
                    {s.is_imported && <Badge text="In your store" color="#16A34A" />}
                    {s.in_filters && !s.is_imported && <Badge text="In import filters" color="#2563EB" />}
                    {s.category && <Badge text={s.category.split(",")[0] ?? s.category} color="#6B6B6B" />}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", flexWrap: "wrap" }}>
                    {!s.in_filters && (
                      <Btn kind="ghost" disabled={!canAdd} title={canAdd ? "Import it with the next import or automatic sync" : addBlocked}
                        busy={busy === `style:${styleRule.value}`} onClick={() => addRule(styleRule, `${s.brand} ${s.style_name}`)}>
                        + Add to import
                      </Btn>
                    )}
                    {!s.is_imported && (
                      <Btn busy={busy === `now:${s.style_id}`} disabled={!!busy && busy !== `now:${s.style_id}`} onClick={() => importNow(s)}>
                        Import now
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
