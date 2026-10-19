"use client";

/**
 * One collection (design 36): /admin/products/collections/<id>, or /new.
 *
 * - Collection: its name and its link (/collections/<handle>).
 * - How products get in: "I choose them" (picked by hand, in the order they
 *   are put: add, remove, move up or down) or "Conditions decide" (rules from
 *   services/collection_rules: a product joins or leaves as it changes). The
 *   number of products that match is worked out as the conditions are typed.
 * - Show on storefront: shown or hidden, the order products are listed in,
 *   and the page design (the Website builder template; that choice goes into
 *   the website's draft, live at its next publish).
 * - Description, picture and search listing, folded away; and Delete.
 *
 * Save keeps everything but the products picked by hand and the page design,
 * which are saved as they are changed.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { adminService } from "@/services/admin.service";
import { WebsiteTemplateField } from "@/components/admin/WebsiteTemplateField";

interface Rule { field: string; operator: string; value: string | null }
interface FieldOption { key: string; label: string; kind: string; choices: string[]; operators: { key: string; label: string }[] }
interface Saved {
  id: string; name: string; slug: string; description: string | null; image_url: string | null;
  match_type: "manual" | "automatic"; rules_match: "all" | "any"; rules: Rule[];
  sort_by: string; is_active: boolean; seo_title: string | null; seo_description: string | null;
  product_count: number | null;
}
interface Member { id: string; name: string; slug: string; status: string }
interface Form {
  name: string; slug: string; description: string; image_url: string;
  match_type: "manual" | "automatic"; rules_match: "all" | "any"; rules: Rule[];
  sort_by: string; is_active: boolean; seo_title: string; seo_description: string;
}

const SORTS: [string, string][] = [
  ["manual", "The order I put them in"], ["best_selling", "Best selling"], ["title_asc", "Name, A to Z"],
  ["title_desc", "Name, Z to A"], ["price_asc", "Price, low to high"], ["price_desc", "Price, high to low"],
  ["created_desc", "Newest first"], ["created_asc", "Oldest first"],
];
const BLANK: Form = {
  name: "", slug: "", description: "", image_url: "", match_type: "manual", rules_match: "all", rules: [],
  sort_by: "manual", is_active: true, seo_title: "", seo_description: "",
};
const VALUELESS = new Set(["is_set", "is_not_set"]);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const errText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);
const formOf = (c: Saved): Form => ({
  name: c.name, slug: c.slug, description: c.description ?? "", image_url: c.image_url ?? "",
  match_type: c.match_type, rules_match: c.rules_match, rules: c.rules ?? [], sort_by: c.sort_by,
  is_active: c.is_active, seo_title: c.seo_title ?? "", seo_description: c.seo_description ?? "",
});
const CHOICE: React.CSSProperties = { height: "42px", borderRadius: "8px", font: "600 14px var(--pc-sans)", cursor: "pointer", color: "var(--pc-ink)" };

export default function CollectionEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  const [saved, setSaved] = useState<Saved | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [slugTouched, setSlugTouched] = useState(false);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [preview, setPreview] = useState<{ total: number; products: Member[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMembers = useCallback(async (id: string) => {
    const r = await apiClient.get<{ items: Member[] }>(`/api/v1/admin/collections/${id}/products?page_size=200`);
    setMembers(r.items ?? []);
  }, []);

  useEffect(() => {
    apiClient.get<{ fields: FieldOption[] }>("/api/v1/admin/collections/rule-options").then((r) => setFields(r.fields ?? [])).catch(() => setFields([]));
    if (isNew) return;
    apiClient.get<Saved>(`/api/v1/admin/collections/${params.id}`)
      .then((c) => {
        setSaved(c);
        setForm(formOf(c));
        setSlugTouched(true);
        if (c.match_type === "manual") void loadMembers(c.id).catch(() => setMembers([]));
      })
      .catch((e) => setLoadError(errText(e, "That collection was not found.")));
  }, [isNew, params.id, loadMembers]);

  // What the conditions would hold, a moment after typing stops.
  const ready = useMemo(() => form.rules.filter((r) => r.field && r.operator && (VALUELESS.has(r.operator) || (r.value ?? "").trim())), [form.rules]);
  useEffect(() => {
    if (form.match_type !== "automatic") { setPreview(null); return; }
    if (!ready.length) { setPreview({ total: 0, products: [] }); return; }
    let live = true;
    const t = window.setTimeout(() => {
      apiClient.post<{ total: number; products: Member[] }>("/api/v1/admin/collections/preview",
        { match_type: "automatic", rules_match: form.rules_match, rules: ready })
        .then((p) => { if (live) setPreview(p); })
        .catch((e) => { if (live) { setPreview(null); setFlash({ text: errText(e, "Those conditions could not be read."), bad: true }); } });
    }, 350);
    return () => { live = false; window.clearTimeout(t); };
  }, [form.match_type, form.rules_match, ready]);

  const dirty = isNew ? !!form.name.trim() : !!saved && JSON.stringify(form) !== JSON.stringify(formOf(saved));
  const count = form.match_type === "automatic" ? preview?.total ?? saved?.product_count ?? 0 : members.length;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const fieldFor = (key: string) => fields.find((f) => f.key === key);

  function setName(name: string) {
    set(slugTouched ? { name } : { name, slug: slugify(name) });
  }

  function setMatch(match_type: "manual" | "automatic") {
    // A collection filled by conditions is not in an order somebody put it in.
    set({ match_type, sort_by: match_type === "automatic" && form.sort_by === "manual" ? "best_selling" : form.sort_by });
  }

  function addRule() {
    const first = fields.find((f) => f.key === "product_type") ?? fields[0];
    set({ rules: [...form.rules, { field: first?.key ?? "title", operator: first?.operators[0]?.key ?? "equals", value: "" }] });
  }
  function patchRule(i: number, patch: Partial<Rule>) {
    set({
      rules: form.rules.map((r, k) => {
        if (k !== i) return r;
        const next = { ...r, ...patch };
        if (patch.field) {
          const meta = fieldFor(patch.field);
          if (meta && !meta.operators.some((o) => o.key === next.operator)) next.operator = meta.operators[0]?.key ?? "equals";
          next.value = "";
        }
        return next;
      }),
    });
  }

  async function save() {
    if (!form.name.trim()) { setFlash({ text: "Give the collection a name.", bad: true }); return; }
    setBusy("save");
    setFlash(null);
    const body = {
      name: form.name.trim(), slug: form.slug.trim() || slugify(form.name), description: form.description.trim() || null,
      image_url: form.image_url.trim() || null, match_type: form.match_type, rules_match: form.rules_match,
      rules: form.match_type === "automatic" ? ready : form.rules, sort_by: form.sort_by, is_active: form.is_active,
      seo_title: form.seo_title.trim() || null, seo_description: form.seo_description.trim() || null,
    };
    try {
      if (isNew) {
        const made = await apiClient.post<Saved>("/api/v1/admin/collections", body);
        router.replace(`/admin/products/collections/${made.id}?made=1`);
        return;
      }
      const next = await apiClient.patch<Saved>(`/api/v1/admin/collections/${saved!.id}`, body);
      setSaved(next);
      setForm(formOf(next));
      if (next.match_type === "manual") await loadMembers(next.id).catch(() => {});
      setFlash({ text: "Saved." });
    } catch (e) {
      setFlash({ text: errText(e, "It could not be saved."), bad: true });
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!saved || !(await ask(`Delete "${saved.name}"? The products in it are not deleted.`, { ok: "Delete", danger: true }))) return;
    setBusy("delete");
    try {
      await apiClient.delete(`/api/v1/admin/collections/${saved.id}`);
      router.push("/admin/products/collections");
    } catch (e) {
      setFlash({ text: errText(e, "It could not be deleted."), bad: true });
      setBusy("");
    }
  }

  async function changeMembers(run: () => Promise<unknown>, done: string) {
    if (!saved) return;
    setBusy("members");
    try { await run(); await loadMembers(saved.id); setFlash({ text: done }); }
    catch (e) { setFlash({ text: errText(e, "The products could not be changed."), bad: true }); }
    finally { setBusy(""); }
  }
  const move = (i: number, by: number) => {
    const ids = members.map((m) => m.id);
    const [one] = ids.splice(i, 1);
    ids.splice(i + by, 0, one!);
    void changeMembers(() => apiClient.patch(`/api/v1/admin/collections/${saved!.id}/reorder`, { product_ids: ids }), "Order saved.");
    if (form.sort_by !== "manual") set({ sort_by: "manual" });
  };

  async function upload(file: File) {
    setBusy("image");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiClient.postForm<{ url: string }>("/api/v1/admin/products/upload-image", fd);
      set({ image_url: r.url });
    } catch {
      setFlash({ text: "That picture could not be uploaded.", bad: true });
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("made")) setFlash({ text: "Collection made. Add its products below." });
  }, []);

  if (loadError) {
    return (
      <div className="pc-page">
        <Link href="/admin/products/collections" className="pc-back">← Products</Link>
        <div className="pc-card pc-empty" style={{ marginTop: "16px" }}>{loadError}</div>
      </div>
    );
  }
  if (!isNew && !saved) return <div className="pc-page"><div className="pc-card pc-empty">Loading the collection…</div></div>;

  const auto = form.match_type === "automatic";
  return (
    <div className="pc-page" data-collection-editor={isNew ? "new" : saved?.slug}>
      <Link href="/admin/products/collections" className="pc-back">← Products</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Collection</div>
          <h1 className="pc-h1">{form.name.trim() || (isNew ? "New collection" : saved?.name)}</h1>
          <p className="pc-sub-line" data-count>{count} {count === 1 ? "product" : "products"}</p>
        </div>
        <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy || !dirty} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </div>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      <div className="pc-cols" style={{ marginTop: "8px" }}>
        <div className="pc-stack" style={{ gap: "18px" }}>
          <section className="pc-card pc-pad" data-card="collection">
            <h2 className="pc-h2" style={{ marginBottom: "12px" }}>Collection</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Name</span>
                <input className="pc-input" value={form.name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Summer sale, Best sellers, Under $30" />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Link</span>
                <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--pc-line)", borderRadius: "8px", background: "#fff", overflow: "hidden" }}>
                  <span style={{ padding: "0 4px 0 12px", color: "var(--pc-muted)", fontSize: "14px", whiteSpace: "nowrap" }}>/collections/</span>
                  <input className="pc-input" aria-label="Link" value={form.slug} maxLength={200} style={{ border: 0, paddingLeft: 0, boxShadow: "none" }}
                    onChange={(e) => { setSlugTouched(true); set({ slug: slugify(e.target.value) || e.target.value.toLowerCase() }); }} />
                </div>
              </label>
            </div>
          </section>

          <section className="pc-card pc-pad" data-card="how" style={{ display: "grid", gap: "14px" }}>
            <h2 className="pc-h2">How products get in</h2>
            <div role="radiogroup" aria-label="How products get in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {([["manual", "I choose them"], ["automatic", "Conditions decide"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={form.match_type === k} data-match={k} onClick={() => setMatch(k)}
                  style={{ ...CHOICE, background: form.match_type === k ? "#EDF3FE" : "#fff", border: form.match_type === k ? "1.5px solid var(--pc-blue)" : "1px solid var(--pc-line)" }}>
                  {label}
                </button>
              ))}
            </div>

            {auto ? (
              <>
                {form.rules.map((r, i) => {
                  const meta = fieldFor(r.field);
                  return (
                    <div key={i} data-rule={i} style={{ display: "grid", gap: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                        <select className="pc-input" aria-label="Field" value={r.field} onChange={(e) => patchRule(i, { field: e.target.value })}>
                          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        <select className="pc-input" aria-label="Condition" value={r.operator} onChange={(e) => patchRule(i, { operator: e.target.value })}>
                          {(meta?.operators ?? []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                        {VALUELESS.has(r.operator) ? <span /> : meta?.kind === "choice" ? (
                          <select className="pc-input" aria-label="Value" value={r.value ?? ""} onChange={(e) => patchRule(i, { value: e.target.value })}>
                            <option value="">Choose…</option>
                            {meta.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <input className="pc-input" aria-label="Value" value={r.value ?? ""} inputMode={["money", "number", "stock"].includes(meta?.kind ?? "") ? "decimal" : undefined}
                            onChange={(e) => patchRule(i, { value: e.target.value })} placeholder={meta?.kind === "money" ? "0.00" : meta?.kind === "tag" ? "Tag" : "Value"} />
                        )}
                      </div>
                      <div><button type="button" className="pc-btn" onClick={() => set({ rules: form.rules.filter((_, k) => k !== i) })}>Remove</button></div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="pc-btn" disabled={!fields.length} onClick={addRule}>+ Add condition</button>
                  {form.rules.length > 1 && (
                    <select className="pc-input" aria-label="Match" value={form.rules_match} style={{ width: "auto" }} onChange={(e) => set({ rules_match: e.target.value as "all" | "any" })}>
                      <option value="all">Products must match every condition</option>
                      <option value="any">Products may match any condition</option>
                    </select>
                  )}
                </div>
                <p className="pc-sub-line" style={{ margin: 0 }} data-matching>
                  Products that match: <b style={{ color: "var(--pc-ink)" }}>{preview ? preview.total : "…"}</b>
                  {preview && preview.products.length > 0 && <> ({preview.products.slice(0, 4).map((p) => p.name).join(", ")}{preview.total > 4 ? ", …" : ""})</>}
                </p>
              </>
            ) : isNew ? (
              <p className="pc-sub-line" style={{ margin: 0 }}>Save the collection, then pick its products here.</p>
            ) : (
              <>
                {members.length === 0 ? <p className="pc-sub-line" style={{ margin: 0 }}>No products in it yet.</p> : (
                  <table className="pc-table" data-members><tbody>
                    {members.map((m, i) => (
                      <tr key={m.id} data-member={m.slug}>
                        <td><Link href={`/admin/products/${m.slug}/edit`} className="pc-row-title">{m.name}</Link>
                          {m.status !== "active" && <span className="pc-pill" style={{ textTransform: "none", marginLeft: "8px" }}>{m.status}</span>}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button type="button" className="pc-x" aria-label={`Move ${m.name} up`} disabled={!!busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                          <button type="button" className="pc-x" aria-label={`Move ${m.name} down`} disabled={!!busy || i === members.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                          <button type="button" className="pc-x" style={{ color: "var(--pc-red)" }} aria-label={`Take ${m.name} out`} disabled={!!busy}
                            onClick={() => void changeMembers(() => apiClient.delete(`/api/v1/admin/collections/${saved!.id}/products`,
                              // DELETE with a body: the client takes RequestInit, so it goes in serialised.
                              { body: JSON.stringify({ product_ids: [m.id] }), headers: { "Content-Type": "application/json" } }), `${m.name} taken out.`)}><X size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
                <div><button type="button" className="pc-btn" disabled={!!busy || saved?.match_type !== "manual"} onClick={() => setPicking(true)}>+ Add products</button>
                  {saved?.match_type !== "manual" && <span className="pc-sub-line" style={{ marginLeft: "10px" }}>Save first: it is still filled by conditions.</span>}</div>
              </>
            )}
          </section>

          <details className="pc-card pc-details" data-card="more">
            <summary><h2 className="pc-h2">Description, picture and search listing</h2><span className="pc-link pc-details-more" aria-hidden /></summary>
            <div style={{ padding: "0 20px 20px", display: "grid", gap: "14px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Description</span>
                <textarea className="pc-input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} style={{ height: "auto", padding: "10px 14px", resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                {form.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={form.image_url} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--pc-line)" }} />
                  : <span className="pc-sub-line" style={{ margin: 0 }}>No picture.</span>}
                <button type="button" className="pc-btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "image" ? "Uploading…" : form.image_url ? "Replace picture" : "Add a picture"}</button>
                {form.image_url && <button type="button" className="pc-btn" onClick={() => set({ image_url: "" })}>Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              </div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Search listing title</span>
                <input className="pc-input" value={form.seo_title} maxLength={255} onChange={(e) => set({ seo_title: e.target.value })} placeholder={form.name} />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span className="pc-label">Search listing description</span>
                <textarea className="pc-input" rows={2} value={form.seo_description} maxLength={500} onChange={(e) => set({ seo_description: e.target.value })} style={{ height: "auto", padding: "10px 14px", resize: "vertical" }} />
              </label>
            </div>
          </details>

          {!isNew && (
            <div><button type="button" className="pc-btn" data-kind="danger" disabled={!!busy} onClick={() => void remove()}>{busy === "delete" ? "Deleting…" : "Delete collection"}</button></div>
          )}
        </div>

        <section className="pc-card pc-pad" data-card="storefront" style={{ display: "grid", gap: "14px" }}>
          <h2 className="pc-h2">Show on storefront</h2>
          <div className="pc-switch-row">
            <span>Show this collection</span>
            <button type="button" className="pc-switch" role="switch" aria-checked={form.is_active} aria-label="Show this collection"
              data-on={form.is_active ? "" : undefined} onClick={() => set({ is_active: !form.is_active })} />
          </div>
          <label style={{ display: "grid", gap: "6px" }}>
            <span className="pc-label">Order products by</span>
            <select className="pc-input" value={form.sort_by} onChange={(e) => set({ sort_by: e.target.value })}>
              {SORTS.filter(([k]) => !(auto && k === "manual")).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {isNew ? (
            <p className="pc-sub-line" style={{ margin: 0 }}>The page design can be chosen once the collection is saved.</p>
          ) : (
            <WebsiteTemplateField kind="collection" recordId={saved!.id}
              selectStyle={{ width: "100%", height: "42px", border: "1px solid var(--pc-line)", borderRadius: "8px", padding: "0 12px", font: "400 14px var(--pc-sans)", background: "#fff" }}
              wrap={(body) => (
                <div style={{ display: "grid", gap: "6px" }} data-website-template="collection">
                  <span className="pc-label">Page design</span>
                  {body}
                </div>
              )} />
          )}
        </section>
      </div>

      {picking && saved && (
        <ProductPicker exclude={members.map((m) => m.id)} onClose={() => setPicking(false)}
          onAdd={(ids) => { setPicking(false); void changeMembers(() => apiClient.post(`/api/v1/admin/collections/${saved.id}/products`, { product_ids: ids }), `${ids.length} ${ids.length === 1 ? "product" : "products"} added.`); }} />
      )}
    </div>
  );
}

/** Products to put in a collection by hand, found by name. */
function ProductPicker({ exclude, onAdd, onClose }: { exclude: string[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      adminService.listProducts({ q: q.trim() || undefined })
        .then((r) => { if (live) setRows((Array.isArray(r) ? r : []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: String(p.status) }))); })
        .catch(() => { if (live) setRows([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);
  const shown = (rows ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label="Add products" data-product-picker style={{ maxWidth: "520px" }}>
        <div className="pc-panel-head"><h2 className="pc-h2">Add products</h2>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="pc-panel-body">
          <input className="pc-input" autoFocus placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid var(--pc-line)", borderRadius: "8px" }}>
            {!rows ? <div className="pc-empty">Searching…</div> : shown.length === 0 ? <div className="pc-empty">No products to add.</div> : shown.map((p) => (
              <label key={p.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--pc-line-soft)", cursor: "pointer" }}>
                <input type="checkbox" checked={chosen.has(p.id)} onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                <span style={{ fontWeight: 500 }}>{p.name}</span>
              </label>
            ))}
          </div>
          <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="pc-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={!chosen.size} onClick={() => onAdd([...chosen])}>
              Add {chosen.size || ""} {chosen.size === 1 ? "product" : "products"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
