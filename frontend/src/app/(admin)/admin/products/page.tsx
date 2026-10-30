"use client";

/**
 * Products: the catalog.
 *
 * Every row, the counts on the status tabs and what needs a look come from one
 * answer (GET /admin/catalog/products, services/product_catalog), so a count
 * never disagrees with the rows under it. The filters live in the address, so
 * a link, Back and a refresh all show the same list. Selecting rows offers the
 * actions the old list had: set a status, edit a few details, delete.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ask, tell } from "@/lib/dialog";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";
import { ImportProductsModal } from "@/components/admin/ImportProductsModal";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";
import { BULK_CHOICE, KIND_WORDS, PRODUCT_KINDS, STATUS_PILL, type ProductKind } from "@/lib/productKinds";

interface Row {
  id: string; slug: string; name: string; status: string; kind: ProductKind; image: string | null;
  /** A stocked product sold on the bulk order form. */
  bulk?: boolean;
  product_code: string | null; price_from: { amount: number; per: string } | null;
  stock: { label: string; tone: string }; attention: string[]; variants: number; updated_at: string | null;
}
interface Catalog {
  rows: Row[]; total: number;
  counts: { all: number; active: number; draft: number; archived: number };
  attention: number; kinds: Record<ProductKind, number>;
}

const PAGE_SIZE = 50;
const STATUSES: [string, string][] = [["", "All"], ["active", "Active"], ["draft", "Draft"], ["archived", "Archived"]];

function price(p: Row["price_from"]): string {
  if (!p) return "–";
  const digits = p.amount >= 0.1 ? 2 : 4;
  const amount = `$${p.amount.toFixed(digits).replace(/(\.\d\d\d*?)0+$/, "$1")}`;
  return p.per === "item" ? amount : `${amount} / ${p.per}`;
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading products…</div></div>}>
      <ProductsList />
    </Suspense>
  );
}

function ProductsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const kind = (params.get("kind") ?? "") as ProductKind | "";
  const attention = params.get("attention") === "1";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const here = params.toString();

  const [data, setData] = useState<Catalog | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [qText, setQText] = useState(q);
  const [pop, setPop] = useState<"status" | "kind" | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Record<string, { status: string; vendor: string; product_type: string }> | null>(null);
  const seq = useRef(0);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    if (!("page" in next)) p.delete("page");
    const s = p.toString();
    router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  // The search box writes the address a moment after typing stops.
  useEffect(() => { setQText(q); }, [q]);
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [qText, q, setParams]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (kind) qs.set("kind", kind);
    if (attention) qs.set("attention", "true");
    qs.set("page", String(page));
    qs.set("page_size", String(PAGE_SIZE));
    try {
      const d = await apiClient.get<Catalog>(`/api/v1/admin/catalog/products?${qs}`);
      if (mine !== seq.current) return;
      setData(d);
      setShownFor(here);
      setLoadError("");
    } catch (e) {
      if (mine !== seq.current) return;
      setLoadError(e instanceof Error ? e.message : "The products could not be loaded.");
      setShownFor(here);
    }
  }, [q, status, kind, attention, page, here]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPicked(new Set()); }, [here]);

  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".pc-pop-wrap")) setPop(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pop]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const chosen = rows.filter((r) => picked.has(r.id));
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));

  async function bulk(action: "active" | "draft" | "archived") {
    const one = chosen.length === 1;
    const words = { active: "active", draft: one ? "a draft" : "drafts", archived: "archived" }[action];
    setWorking(`Setting ${chosen.length}…`);
    try {
      await adminService.bulkAction(chosen.map((r) => r.id), action);
      setFlash({ text: `${one ? "1 product is" : `${chosen.length} products are`} now ${words}.` });
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : "That did not work. Nothing was changed.", bad: true });
    }
    setWorking("");
    setPicked(new Set());
    await load();
  }

  /** Only the products ticked, as the products file (Shopify's layout, as Export). */
  async function exportChosen() {
    setWorking("Exporting…");
    try {
      await adminService.exportProductsCsv(chosen.map((r) => r.id),
        chosen.length === 1 ? `${chosen[0]!.slug}.csv` : `products-export-${chosen.length}.csv`);
    } catch {
      setFlash({ text: "The export did not download. Try again.", bad: true });
    }
    setWorking("");
  }

  async function bulkDelete() {
    if (!await ask(`Delete ${chosen.length === 1 ? `"${chosen[0]!.name}"` : `${chosen.length} products`}? This cannot be undone. A product with orders on it is kept and archived instead.`, { title: "Delete products", ok: "Delete", danger: true })) return;
    setWorking("Deleting…");
    const results = await Promise.allSettled(chosen.map((r) => adminService.deleteProduct(r.id)));
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    setWorking("");
    setPicked(new Set());
    setFlash(failed.length
      ? { text: `${results.length - failed.length} deleted, ${failed.length} not: ${failed[0]!.reason instanceof Error ? failed[0]!.reason.message : "it may be on an order"}.`, bad: true }
      : { text: `${results.length === 1 ? "1 product" : `${results.length} products`} deleted.` });
    await load();
  }

  function openEdit() {
    setEditing(Object.fromEntries(chosen.map((r) => [r.id, { status: r.status, vendor: "", product_type: "" }])));
    // Vendor and type are not on the list: read them for the rows picked.
    void Promise.all(chosen.map((r) => adminService.getProduct(r.slug).then((p) => [r.id, p] as const).catch(() => null)))
      .then((found) => setEditing((cur) => {
        if (!cur) return cur;
        const next = { ...cur };
        for (const hit of found) if (hit && next[hit[0]]) next[hit[0]] = { ...next[hit[0]]!, vendor: hit[1]?.vendor ?? "", product_type: hit[1]?.product_type ?? "" };
        return next;
      }));
  }

  async function saveEdit() {
    if (!editing) return;
    setWorking("Saving…");
    try {
      await Promise.all(Object.entries(editing).map(([id, v]) => adminService.updateProduct(id, { status: v.status, vendor: v.vendor || null, product_type: v.product_type || null })));
      setFlash({ text: "Saved." });
      setEditing(null);
      setPicked(new Set());
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : "Not saved.", bad: true });
    }
    setWorking("");
    await load();
  }

  const counts = data?.counts;
  const statusLabel = STATUSES.find(([v]) => v === status)?.[1] ?? "All";
  const kindLabel = kind ? KIND_WORDS[kind] : "All";
  const loaded = shownFor === here;
  const first = (page - 1) * PAGE_SIZE + 1;

  return (
    <ProductsFrame
      active="catalog"
      count={counts?.all ?? null}
      actions={<>
        <button type="button" className="pc-btn" onClick={() => setImporting(true)}>Import</button>
        <button type="button" className="pc-btn" onClick={() => { void adminService.exportProductsCsv(); }}>Export</button>
        <Link href="/admin/products/new" className="pc-btn" data-kind="primary">+ Add product</Link>
      </>}
    >
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      <div className="pc-filters">
        <label className="pc-field" style={{ flex: "1 1 320px", maxWidth: "none" }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by name or SKU" aria-label="Search products" />
        </label>
        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "status"} onClick={() => setPop(pop === "status" ? null : "status")}>Status: {statusLabel}</button>
          {pop === "status" && (
            <div className="pc-pop" role="menu">
              {STATUSES.map(([value, label]) => (
                <button key={value} type="button" role="menuitemradio" aria-checked={status === value} className="pc-pop-item" data-on={status === value ? "" : undefined}
                  onClick={() => { setParams({ status: value || null }); setPop(null); }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="pc-pop-wrap">
          <button type="button" className="pc-btn" aria-haspopup="menu" aria-expanded={pop === "kind"} onClick={() => setPop(pop === "kind" ? null : "kind")}>Type: {kindLabel}</button>
          {pop === "kind" && (
            <div className="pc-pop" role="menu">
              <button type="button" role="menuitemradio" aria-checked={!kind} className="pc-pop-item" data-on={!kind ? "" : undefined}
                onClick={() => { setParams({ kind: null }); setPop(null); }}>All</button>
              {PRODUCT_KINDS.map(({ kind: k, title }) => (
                <button key={k} type="button" role="menuitemradio" aria-checked={kind === k} className="pc-pop-item" data-on={kind === k ? "" : undefined}
                  onClick={() => { setParams({ kind: k }); setPop(null); }}>
                  <span>{title}</span>{data && <span style={{ color: "var(--pc-muted)" }}>{data.kinds[k] ?? 0}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="pc-btn" aria-pressed={attention} data-on={attention ? "" : undefined}
          onClick={() => setParams({ attention: attention ? null : "1" })} data-attention-filter>
          Needs attention{data ? ` · ${data.attention}` : ""}
        </button>
      </div>

      <nav className="pc-tabs" aria-label="Status" style={{ marginBottom: "14px" }} data-status-tabs>
        {STATUSES.map(([value, label]) => {
          const n = counts ? (value ? counts[value as "active"] : counts.all) : null;
          return (
            <Link key={value || "all"} href={`${pathname}?${(() => { const p = new URLSearchParams(params.toString()); if (value) p.set("status", value); else p.delete("status"); p.delete("page"); return p.toString(); })()}`}
              className="pc-tab" data-on={status === value ? "" : undefined} aria-current={status === value ? "page" : undefined} data-status-tab={value || "all"} scroll={false}>
              {label}{n ? <span className="pc-tab-count">{n}</span> : null}
            </Link>
          );
        })}
      </nav>

      {(chosen.length > 0 || working) && (
        <div className="pc-bulk" role="toolbar" aria-label="Selected products">
          <span className="pc-bulk-n">{working || `${chosen.length} selected`}</span>
          <button type="button" disabled={!!working} onClick={() => bulk("active")}>Set active</button>
          <button type="button" disabled={!!working} onClick={() => bulk("draft")}>Set draft</button>
          <button type="button" disabled={!!working} onClick={() => bulk("archived")}>Archive</button>
          <button type="button" disabled={!!working} onClick={() => void exportChosen()}>Export</button>
          <button type="button" disabled={!!working} onClick={openEdit}>Edit details</button>
          <button type="button" disabled={!!working} onClick={bulkDelete}>Delete</button>
          <button type="button" className="pc-bulk-clear" disabled={!!working} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      <div className="pc-card" data-shown={shownFor ?? undefined} aria-busy={!loaded} data-catalog>
        {loadError ? (
          <div className="pc-empty">{loadError} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
        ) : !data ? (
          <div className="pc-empty">Loading products…</div>
        ) : rows.length === 0 ? (
          <div className="pc-empty">
            {q || kind || attention || status ? "No product matches these filters." : <>No products yet. <Link href="/admin/products/new" className="pc-link">Add your first product</Link></>}
          </div>
        ) : (
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "940px" }}>
              <thead>
                <tr>
                  <th className="pc-td-check"><input type="checkbox" className="pc-check" aria-label="Select all on this page" checked={allPicked}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                  <th>Product</th><th>Type</th><th>Status</th><th>Price from</th><th>Stock</th><th>Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [sLabel, sTone] = STATUS_PILL[r.status] ?? [r.status, ""];
                  return (
                    <tr key={r.id} data-href data-product={r.slug} data-selected={picked.has(r.id) ? "" : undefined}
                      onClick={() => router.push(`/admin/products/${r.slug}/edit`)}>
                      <td className="pc-td-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="pc-check" aria-label={`Select ${r.name}`} checked={picked.has(r.id)}
                          onChange={(e) => setPicked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                          {r.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={r.image} alt="" className="pc-thumb" style={{ width: "40px", height: "40px", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                            : <span className="pc-thumb" style={{ width: "40px", height: "40px", background: "#EEF1F5", display: "inline-block" }} aria-hidden />}
                          <span style={{ minWidth: 0 }}>
                            <Link href={`/admin/products/${r.slug}/edit`} className="pc-row-title" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                            {r.product_code && <span className="pc-sub-line" style={{ display: "block", fontSize: "12.5px", marginTop: "1px" }}>{r.product_code}</span>}
                          </span>
                        </div>
                      </td>
                      <td style={{ color: "var(--pc-ink-2, var(--pc-ink))" }}>{r.bulk ? BULK_CHOICE.title : KIND_WORDS[r.kind]}</td>
                      <td><span className="pc-pill" data-tone={sTone || undefined}>{sLabel}</span></td>
                      <td>{price(r.price_from)}</td>
                      <td>{r.stock.tone ? <span className="pc-pill" data-tone={r.stock.tone}>{r.stock.label}</span> : <span style={{ color: "var(--pc-muted)" }}>{r.stock.label}</span>}</td>
                      <td>
                        <span className="pc-pills">
                          {r.attention.slice(0, 2).map((a) => <span key={a} className="pc-pill" data-tone={a === "Draft" ? "amber" : "red"}>{a}</span>)}
                          {r.attention.length > 2 && <span className="pc-pill" title={r.attention.slice(2).join(", ")}>+{r.attention.length - 2}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="pc-table-foot" data-total={data.total}>
            <span>Showing {first}–{Math.min(first + rows.length - 1, data.total)} of {data.total}</span>
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="pc-btn" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
              <button type="button" className="pc-btn" disabled={first + rows.length - 1 >= data.total} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
            </span>
          </div>
        )}
      </div>

      {importing && (
        <ImportProductsModal onClose={() => setImporting(false)} onSuccess={() => { setImporting(false); void load(); }} />
      )}

      {editing && (
        <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !working) setEditing(null); }}>
          <div className="pc-modal" role="dialog" aria-label="Edit details" style={{ width: "min(860px, 100%)" }}>
            <div className="pc-panel-head">
              <div>
                <h2 className="pc-h2">Edit details</h2>
                <div className="pc-sub-line">{Object.keys(editing).length === 1 ? "1 product" : `${Object.keys(editing).length} products`}</div>
              </div>
              <button type="button" className="pc-x" aria-label="Close" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "640px" }}>
                <thead><tr><th>Product</th><th>Status</th><th>Vendor</th><th>Product type</th></tr></thead>
                <tbody>
                  {chosen.map((r) => {
                    const v = editing[r.id] ?? { status: r.status, vendor: "", product_type: "" };
                    const set = (k: "status" | "vendor" | "product_type", val: string) => setEditing((cur) => (cur ? { ...cur, [r.id]: { ...v, [k]: val } } : cur));
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td><select className="pc-input" value={v.status} onChange={(e) => set("status", e.target.value)} aria-label={`Status of ${r.name}`}>
                          <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
                        </select></td>
                        <td><input className="pc-input" value={v.vendor} onChange={(e) => set("vendor", e.target.value)} aria-label={`Vendor of ${r.name}`} /></td>
                        <td><input className="pc-input" value={v.product_type} onChange={(e) => set("product_type", e.target.value)} aria-label={`Product type of ${r.name}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "16px 20px" }}>
              <button type="button" className="pc-btn" onClick={() => setEditing(null)} disabled={!!working}>Cancel</button>
              <button type="button" className="pc-btn" data-kind="primary" onClick={saveEdit} disabled={!!working}>{working || "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </ProductsFrame>
  );
}
