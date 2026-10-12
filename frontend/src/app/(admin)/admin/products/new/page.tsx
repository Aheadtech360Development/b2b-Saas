"use client";

/**
 * Add a product: what it is first, then the rest in four short steps.
 *
 * The type decides which fields come after it (lib/productKinds). The product
 * is made as a draft once its basics are in, so its pricing and images are
 * saved on it as they are entered, by the same parts its own page uses; the
 * address then names it (?p=<slug>&step=N), so a refresh carries on where it
 * was instead of making a second one. Publish puts it on the store.
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";
import { productsService } from "@/services/products.service";
import { gangSheetsService } from "@/services/gangSheets.service";
import { ProductOptionsBuilder } from "@/components/admin/ProductOptionsBuilder";
import { VariantOptionsEditor, type ColorOption } from "@/components/admin/VariantOptionsEditor";
import { GangSheetProductEditor } from "@/components/admin/GangSheetProductEditor";
import { KIND_WORDS, PRODUCT_KINDS, kindFields, kindOf, type ProductKind } from "@/lib/productKinds";
import type { Category, ProductDetail, ProductVariant } from "@/types/product.types";

const RichTextEditor = dynamic(
  () => import("@/components/admin/RichTextEditor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="pc-input" style={{ minHeight: "150px", color: "var(--pc-muted)" }}>Loading the editor…</div> },
);

const STEPS = ["Type", "Basics", "Pricing", "Images", "Publish"] as const;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

interface CatalogRow { id: string; price_from: { amount: number; per: string } | null; attention: string[] }

export default function AddProductPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading…</div></div>}>
      <AddProduct />
    </Suspense>
  );
}

function AddProduct() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const slug = params.get("p");
  const step = Math.min(5, Math.max(1, Number(params.get("step")) || 1));

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [kind, setKind] = useState<ProductKind | null>(null);
  const [basics, setBasics] = useState({ name: "", description: "", category_id: "", product_code: "" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loadingProduct, setLoadingProduct] = useState(!!slug);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = useCallback((n: number, p: string | null = slug) => {
    const q = new URLSearchParams();
    if (p) q.set("p", p);
    if (n > 1) q.set("step", String(n));
    setError("");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: true });
  }, [pathname, router, slug]);

  const reload = useCallback(async (s: string) => {
    const p = await adminService.getProduct(s);
    setProduct(p);
    setKind(kindOf(p));
    return p;
  }, []);

  useEffect(() => { productsService.getCategories().then((c) => setCategories(c ?? [])).catch(() => setCategories([])); }, []);

  // Carrying on with a product already made (a refresh, or Back).
  useEffect(() => {
    if (!slug) { setLoadingProduct(false); return; }
    if (product?.slug === slug) return;
    setLoadingProduct(true);
    reload(slug)
      .then((p) => setBasics({
        name: p.name, description: p.description ?? "", category_id: p.categories?.[0]?.id ?? "",
        product_code: (p as { product_code?: string | null }).product_code ?? "",
      }))
      .catch((e) => setError(errorText(e, "That product could not be opened.")))
      .finally(() => setLoadingProduct(false));
  }, [slug, product?.slug, reload]);

  // ── Step 2: the product is made here ───────────────────────────────────────
  async function saveBasics() {
    if (!kind) { go(1); return; }
    const name = basics.name.trim();
    if (!name) { setError("Give the product a name."); return; }
    setBusy("basics");
    setError("");
    try {
      const fields = {
        name, description: basics.description || null, product_code: basics.product_code.trim() || null,
        category_ids: basics.category_id ? [basics.category_id] : [],
      };
      let made = product;
      if (!made) {
        const { pricing_mode, gang_sheet_type } = kindFields(kind);
        const base = slugify(name);
        // The address must be the shop's own: when it is taken, the next free one.
        for (let attempt = 0; attempt < 4 && !made; attempt++) {
          const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
          try {
            made = await adminService.createProduct({ ...fields, slug: candidate, status: "draft", pricing_mode });
          } catch (e) {
            if (!/slug|exists|unique|taken/i.test(errorText(e, ""))) throw e;
          }
        }
        if (!made) throw new Error("No free web address could be found for that name. Change the name a little.");
        if (gang_sheet_type) await gangSheetsService.adminUpdateProduct(made.id, { gang_sheet_enabled: true, gang_sheet_type });
        const fresh = await reload(made.slug);
        go(3, fresh.slug);
      } else {
        await adminService.updateProduct(made.id, fields);
        await reload(made.slug);
        go(3);
      }
    } catch (e) {
      setError(errorText(e, "The product could not be saved."));
    }
    setBusy("");
  }

  // ── Step 3, stocked: colours × sizes become variants ───────────────────────
  async function addVariants(colors: ColorOption[], sizes: string[], priceStr: string) {
    if (!product) return;
    setBusy("variants");
    setError("");
    try {
      const code = (product as { product_code?: string | null }).product_code || product.name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase();
      const price = parseFloat(priceStr) || 0;
      const have = new Set(product.variants.map((v) => `${(v.color ?? "").toLowerCase()}|${(v.size ?? "").toLowerCase()}`));
      for (const color of colors) {
        for (const size of sizes) {
          if (have.has(`${color.name.toLowerCase()}|${size.toLowerCase()}`)) continue;
          await apiClient.post<ProductVariant>(`/api/v1/admin/products/${product.id}/variants`, {
            sku: `${code}-${color.name.slice(0, 3).toUpperCase()}-${size.toUpperCase().replace(/\//g, "")}-${Date.now().toString(36).toUpperCase()}`,
            color: color.name, color_hex: color.hex || null, size, retail_price: price, status: "active",
          });
        }
      }
      await reload(product.slug);
    } catch (e) {
      setError(errorText(e, "Some variants could not be made."));
    }
    setBusy("");
  }

  // ── Step 4: images ─────────────────────────────────────────────────────────
  async function addImages(files: FileList | null) {
    if (!product || !files?.length) return;
    setBusy("images");
    setError("");
    try {
      for (const file of Array.from(files)) await adminService.uploadImage(product.id, file);
      await reload(product.slug);
    } catch (e) {
      setError(errorText(e, "An image could not be uploaded."));
    }
    setBusy("");
    if (fileInput.current) fileInput.current.value = "";
  }
  async function removeImage(id: string) {
    if (!product) return;
    await adminService.deleteImage(product.id, id).catch(() => {});
    await reload(product.slug);
  }
  async function makeFirst(id: string) {
    if (!product) return;
    await adminService.reorderImages(product.id, [id, ...product.images.filter((i) => i.id !== id).map((i) => i.id)]).catch(() => {});
    await reload(product.slug);
  }

  // ── Step 5: what is missing, from the catalog's own answer ─────────────────
  const [check, setCheck] = useState<CatalogRow | null>(null);
  useEffect(() => {
    if (step !== 5 || !product) return;
    apiClient.get<{ rows: CatalogRow[] }>(`/api/v1/admin/catalog/products?q=${encodeURIComponent(product.name)}&page_size=200`)
      .then((d) => setCheck(d.rows.find((r) => r.id === product.id) ?? null))
      .catch(() => setCheck(null));
  }, [step, product]);

  async function finish(publish: boolean) {
    if (!product) return;
    setBusy(publish ? "publish" : "draft");
    try {
      if (publish) await adminService.updateProduct(product.id, { status: "active" });
      router.push(`/admin/products/${product.slug}/edit${publish ? "?published=1" : ""}`);
    } catch (e) {
      setError(errorText(e, "The product could not be published."));
      setBusy("");
    }
  }

  // ── Words for the step ─────────────────────────────────────────────────────
  const heading: Record<number, [string, string]> = {
    1: ["What are you selling?", "Pick a type first. It decides which fields you see."],
    2: ["The basics", "A name and a few words. Every other detail can be added on the product later."],
    3: kind === "stocked" ? ["Colours, sizes and price", "Each colour and size becomes its own item, with its own SKU and stock."]
      : kind === "made" ? ["Price and questions", "A base price, the questions the customer answers, and price breaks."]
      : kind === "upload_by_size" ? ["Price by area", "Buyers pick any size; the price comes from its area."]
      : ["Sheet sizes and prices", "The sheet sizes buyers choose from, and what each costs."],
    4: ["Images", "The first image is the one shoppers see first."],
    5: ["Ready to publish?", "Publish to put it on your store now, or keep it as a draft and finish it later."],
  };
  const [title, sub] = heading[step]!;
  const reachable = (n: number) => n === 1 || (n === 2 && !!kind) || !!product;
  const nonDraft = (check?.attention ?? []).filter((a) => a !== "Draft");

  if (loadingProduct) return <div className="pc-page"><div className="pc-card pc-empty">Opening the product…</div></div>;

  return (
    <div className="pc-page" style={{ maxWidth: "1100px" }} data-add-product data-step={step}>
      <Link href="/admin/products" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Products</Link>
      <div className="pc-head" style={{ marginBottom: "18px" }}>
        <div>
          <div className="pc-eyebrow">Add product{product ? ` · ${product.name}` : ""}</div>
          <h1 className="pc-h1">{title}</h1>
          <p className="pc-sub-line">{sub}</p>
        </div>
      </div>

      <ol className="pc-card pc-stepper" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === step ? "current" : n < step && reachable(n) ? "done" : "todo";
          return (
            <li key={label} data-state={state}>
              <button type="button" disabled={!reachable(n) || n === step} onClick={() => go(n)} aria-current={n === step ? "step" : undefined}>
                <span className="pc-stepper-n">{state === "done" ? <Check size={13} strokeWidth={3} /> : n}</span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="pc-flash" data-bad role="alert" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{error}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}

      {step === 1 && (
        <>
          <div className="pc-kinds" role="radiogroup" aria-label="What are you selling?">
            {PRODUCT_KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="pc-kind" data-on={kind === k.kind ? "" : undefined}
                disabled={!!product && kind !== k.kind} onClick={() => setKind(k.kind)} data-kind-card={k.kind}>
                <span className="pc-kind-title">{k.title}</span>
                <span className="pc-kind-blurb">{k.blurb}</span>
              </button>
            ))}
          </div>
          {product && <p className="pc-sub-line" style={{ marginTop: "12px" }}>The type is set for this product. It can be changed later on its Pricing tab.</p>}
          <div className="pc-wizard-foot">
            <Link href="/admin/products" className="pc-btn">Cancel</Link>
            <button type="button" className="pc-btn" data-kind="primary" disabled={!kind} onClick={() => go(2)}>Continue</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <section className="pc-card pc-pad" style={{ display: "grid", gap: "16px" }}>
            <div>
              <label className="pc-label" htmlFor="p-name">Name</label>
              <input id="p-name" className="pc-input" value={basics.name} autoFocus onChange={(e) => setBasics((b) => ({ ...b, name: e.target.value }))}
                placeholder={kind === "stocked" ? "e.g. Classic Cotton Tee" : kind === "made" ? "e.g. Business Cards" : "e.g. DTF Gang Sheet"} />
              {basics.name.trim() && !product && <p className="pc-sub-line" style={{ fontSize: "12.5px" }}>Web address: /products/{slugify(basics.name)}</p>}
            </div>
            <div>
              <label className="pc-label">Description</label>
              <RichTextEditor value={basics.description} onChange={(v: string) => setBasics((b) => ({ ...b, description: v }))} placeholder="What it is, what it is made of, what it is good for…" />
            </div>
            <div className="pc-grid-2">
              <div>
                <label className="pc-label" htmlFor="p-cat">Category</label>
                <select id="p-cat" className="pc-input" value={basics.category_id} onChange={(e) => setBasics((b) => ({ ...b, category_id: e.target.value }))}>
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="pc-label" htmlFor="p-code">Product code (optional)</label>
                <input id="p-code" className="pc-input" value={basics.product_code} onChange={(e) => setBasics((b) => ({ ...b, product_code: e.target.value }))} placeholder="e.g. G5000" />
              </div>
            </div>
          </section>
          <div className="pc-wizard-foot">
            <button type="button" className="pc-btn" onClick={() => go(1)}>Back</button>
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy === "basics"} onClick={saveBasics}>
              {busy === "basics" ? "Saving…" : product ? "Continue" : "Save and continue"}
            </button>
          </div>
        </>
      )}

      {step === 3 && product && (
        <>
          {kind === "stocked" && (
            <div className="pc-stack" style={{ gap: "16px" }}>
              <section className="pc-card pc-pad" data-variant-maker>
                <h2 className="pc-h2">Make the variants</h2>
                <p className="pc-sub-line" style={{ margin: "4px 0 14px" }}>Add the colours and sizes, and the price they start at. Each combination becomes an item; prices and stock can be set one by one on the product later.</p>
                <VariantOptionsEditor busy={busy === "variants"} onAdd={addVariants} />
              </section>
              <section className="pc-card" data-variant-list>
                <div className="pc-card-head"><h2 className="pc-h2">{product.variants.length === 1 ? "1 variant" : `${product.variants.length} variants`}</h2></div>
                {product.variants.length === 0 ? <div className="pc-empty">None yet.</div> : (
                  <div className="pc-scroll-x">
                    <table className="pc-table" style={{ minWidth: "480px" }}>
                      <thead><tr><th>Colour</th><th>Size</th><th>SKU</th><th className="pc-num">Price</th></tr></thead>
                      <tbody>{product.variants.slice(0, 60).map((v) => (
                        <tr key={v.id}><td>{v.color ?? "–"}</td><td>{v.size ?? "–"}</td><td style={{ color: "var(--pc-muted)" }}>{v.sku}</td><td className="pc-num">${Number(v.retail_price ?? 0).toFixed(2)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
          {kind === "made" && <ProductOptionsBuilder productId={product.id} />}
          {(kind === "gang_sheet" || kind === "upload_by_size" || kind === "upload_own") && (
            <GangSheetProductEditor productId={product.id} productName={product.name} kind={kind} config={product.gang_sheet_config ?? null} fixedKind
              onSaved={() => { void reload(product.slug); }} />
          )}
          <div className="pc-wizard-foot">
            <button type="button" className="pc-btn" onClick={() => go(2)}>Back</button>
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => go(4)}>Continue</button>
          </div>
        </>
      )}

      {step === 4 && product && (
        <>
          <section className="pc-card pc-pad" data-image-step>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => void addImages(e.target.files)} />
            <button type="button" className="pc-drop" onClick={() => fileInput.current?.click()} disabled={busy === "images"}>
              {busy === "images" ? "Uploading…" : "Choose images to upload"}
              <span className="pc-sub-line" style={{ margin: 0 }}>PNG, JPG or WebP. Several at once is fine.</span>
            </button>
            {product.images.length > 0 && (
              <div className="pc-image-grid" style={{ marginTop: "16px" }}>
                {product.images.map((img, i) => (
                  <figure key={img.id} className="pc-image-tile" data-image>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url_medium} alt={img.alt_text ?? ""} />
                    <figcaption>
                      {i === 0 ? <span className="pc-pill" data-tone="blue">First</span> : <button type="button" className="pc-link" style={{ fontSize: "13px" }} onClick={() => void makeFirst(img.id)}>Make first</button>}
                      <button type="button" className="pc-link" style={{ fontSize: "13px", color: "var(--pc-red)" }} onClick={() => void removeImage(img.id)}>Remove</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
          <div className="pc-wizard-foot">
            <button type="button" className="pc-btn" onClick={() => go(3)}>Back</button>
            <button type="button" className="pc-btn" data-kind="primary" onClick={() => go(5)}>Continue</button>
          </div>
        </>
      )}

      {step === 5 && product && (
        <>
          <section className="pc-card pc-pad" data-publish-step>
            <div className="pc-kv"><span>Type</span><b>{kind ? KIND_WORDS[kind] : "–"}</b></div>
            <div className="pc-kv"><span>Name</span><b>{product.name}</b></div>
            <div className="pc-kv"><span>Web address</span><b>/products/{product.slug}</b></div>
            <div className="pc-kv"><span>Price from</span><b>{check?.price_from ? `$${check.price_from.amount.toFixed(check.price_from.amount < 0.1 ? 4 : 2)}${check.price_from.per === "item" ? "" : ` / ${check.price_from.per}`}` : "Not set"}</b></div>
            <div className="pc-kv"><span>Images</span><b>{product.images.length}</b></div>
            <div style={{ marginTop: "14px" }} data-publish-check>
              {check === null ? (
                <div className="pc-note">Checking what the product still needs…</div>
              ) : nonDraft.length ? (
                <div className="pc-note">Before it sells: {nonDraft.join(", ").toLowerCase()}. You can publish now and finish on the product&apos;s page.</div>
              ) : (
                <div className="pc-note" data-tone="green">Everything a shopper needs is there.</div>
              )}
            </div>
          </section>
          <div className="pc-wizard-foot">
            <button type="button" className="pc-btn" onClick={() => go(4)}>Back</button>
            <span style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void finish(false)}>{busy === "draft" ? "Opening…" : "Keep as draft"}</button>
              <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => void finish(true)} data-publish>{busy === "publish" ? "Publishing…" : "Publish product"}</button>
            </span>
          </div>
        </>
      )}

      {step >= 3 && !product && (
        <div className="pc-card pc-empty">This step needs the product made first. <button type="button" className="pc-link" onClick={() => go(kind ? 2 : 1)}>Go back</button></div>
      )}
    </div>
  );
}
