"use client";

/**
 * New order (design 32): a phone or counter order in three steps.
 *
 * 1 Customer: an account found by name or email, a new one made here, or a
 *   guest by name and email. Continue makes the draft, and the address names
 *   it from then on (?order=<id>&step=N), so a refresh carries on instead of
 *   starting another.
 * 2 Items: products found by name or SKU, or a pasted list of SKUs. Each line
 *   is charged this customer's own price (their tier and discount group, or
 *   the guest price), worked out on the server (services/draft_orders).
 * 3 Payment: where it goes (shipped, or collected), then an invoice, a payment
 *   link, or paid at the counter. Placing it gives it the shop's next order
 *   number and opens its order page.
 *
 * Save as draft keeps it on the Drafts tab, to finish later from there.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ClipboardPaste, Search, Trash2, X } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { tell } from "@/lib/dialog";
import { useBranding } from "@/components/providers/BrandingProvider";
import { adminService } from "@/services/admin.service";
import { customersService } from "@/services/customers.service";

const STEPS = ["Customer", "Items", "Payment"] as const;

interface Address {
  full_name?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country?: string | null;
  phone?: string | null;
}

interface Line {
  id: string;
  product: string;
  label: string;
  sku: string;
  options: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  configured: boolean;
}

export interface Draft {
  id: string;
  order_number: string;
  draft: boolean;
  status: string;
  payment_status: string;
  customer: {
    kind: "account" | "guest";
    company_id: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    tier: string | null;
    discount_percent: number;
    tax_exempt: boolean;
    suggested_address: Address | null;
  };
  delivery: { method: "ship" | "will_call"; address: Address | null };
  items: Line[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  po_number: string | null;
  notes: string | null;
  payment_terms: string | null;
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** One row of a search result list: a customer, or a product. */
const RESULT_ROW: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--pc-line-soft, #EEF1F5)",
};
const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading…</div></div>}>
      <NewOrder />
    </Suspense>
  );
}

function NewOrder() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const orderId = params.get("order");
  const step = orderId ? Math.min(3, Math.max(1, Number(params.get("step")) || 2)) : 1;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(!!orderId);
  const [error, setError] = useState("");

  const go = useCallback((n: number, id: string | null = orderId) => {
    const q = new URLSearchParams();
    if (id) q.set("order", id);
    if (id && n > 1) q.set("step", String(n));
    setError("");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: true });
  }, [orderId, pathname, router]);

  const reload = useCallback(async () => {
    if (!orderId) { setDraft(null); return null; }
    try {
      const d = await apiClient.get<Draft>(`/api/v1/admin/orders/${orderId}/wizard`);
      setDraft(d);
      return d;
    } catch (e) {
      setError(errorText(e, "This order could not be opened."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void reload(); }, [reload]);

  const reachable = (n: number) => n === 1 || (!!draft && (n === 2 || draft.items.length > 0));

  if (loading) return <div className="pc-page"><div className="pc-card pc-empty">Opening the order…</div></div>;

  if (draft && !draft.draft) {
    return (
      <div className="pc-page" style={{ maxWidth: "1100px" }}>
        <Link href="/admin/orders" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Orders</Link>
        <div className="pc-card pc-empty">
          Order {draft.order_number} is already placed. <Link className="pc-link" href={`/admin/orders/${draft.id}`}>Open its page</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-page" style={{ maxWidth: "1100px" }} data-new-order data-step={step}>
      <Link href="/admin/orders" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Orders</Link>
      <div className="pc-head" style={{ marginBottom: "18px" }}>
        <div>
          <div className="pc-eyebrow">Orders{draft ? ` · ${draft.order_number}` : ""}</div>
          <h1 className="pc-h1">New order</h1>
          <p className="pc-sub-line">For phone and counter orders.</p>
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
        <CustomerStep draft={draft} onStarted={(id) => go(2, id)} onNext={() => go(2)}
          // Opened from a customer's page or the Inbox: that customer, chosen.
          preset={params.get("company") ? { id: params.get("company")!, name: params.get("company_name") ?? "", email: null } : null} />
      )}
      {step === 2 && draft && (
        <ItemsStep draft={draft} onChange={setDraft} onNext={() => go(3)} onSaved={() => router.push("/admin/orders/drafts")} />
      )}
      {step === 3 && draft && (
        <PaymentStep draft={draft} onChange={setDraft} onBack={() => go(2)} onSaved={() => router.push("/admin/orders/drafts")}
          onPlaced={() => router.push(`/admin/orders/${draft.id}`)} />
      )}

      <p className="pc-sub-line" style={{ marginTop: "18px" }}>
        Step 1 lets you pick a customer, create one inline, or choose guest. Step 3: send an invoice, send a payment link, or mark paid.
      </p>
    </div>
  );
}

// ── Step 1: Customer ────────────────────────────────────────────────────────

type Mode = "find" | "new" | "guest";

function CustomerStep({ draft, preset, onStarted, onNext }: {
  draft: Draft | null;
  preset: { id: string; name: string; email: string | null } | null;
  onStarted: (id: string) => void;
  onNext: () => void;
}) {
  const [mode, setMode] = useState<Mode>("find");
  const [q, setQ] = useState(preset?.name ?? "");
  const [found, setFound] = useState<{ id: string; kind: string; name: string; email: string | null }[] | null>(null);
  const [picked, setPicked] = useState<{ id: string; name: string; email: string | null } | null>(preset);
  const [person, setPerson] = useState({ name: "", email: "", phone: "" });
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (mode !== "find" || draft) return;
    const t = window.setTimeout(() => {
      customersService.list({ q: q.trim() || undefined, page_size: 8, sort: "name" })
        .then((d) => setFound(d.items.map((r) => ({ id: r.id, kind: r.kind, name: r.name, email: r.email }))))
        .catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, mode, draft]);

  if (draft) {
    const c = draft.customer;
    return (
      <>
        <section className="pc-card pc-pad" style={{ display: "grid", gap: "8px" }} data-customer-chosen>
          <h2 className="pc-h2">Customer</h2>
          <div><b>{c.name || "Guest"}</b>{c.kind === "guest" ? " (guest)" : ""}{c.email ? <span className="pc-sub-line" style={{ marginLeft: 8 }}>{c.email}</span> : null}</div>
          {c.tier && <div className="pc-sub-line">Pricing tier: {c.tier}</div>}
          <p className="pc-sub-line">The customer is set for this order. For someone else, <Link className="pc-link" href="/admin/orders/new">start a new order</Link>; this one stays on the Drafts tab.</p>
        </section>
        <div className="pc-wizard-foot">
          <Link href="/admin/orders" className="pc-btn">Cancel</Link>
          <button type="button" className="pc-btn" data-kind="primary" onClick={onNext}>Continue</button>
        </div>
      </>
    );
  }

  const ready = mode === "find" ? !!picked
    : mode === "new" ? !!person.name.trim()
    : !!person.name.trim() && /\S+@\S+\.\S+/.test(person.email.trim());

  async function start() {
    setBusy(true);
    setProblem("");
    try {
      let body: Record<string, unknown>;
      if (mode === "find" && picked) {
        body = { company_id: picked.id };
      } else if (mode === "new") {
        const made = await customersService.add({
          kind: "retail", name: person.name.trim(), email: person.email.trim() || undefined,
          phone: person.phone.trim() || undefined, send_invite: invite && !!person.email.trim(),
        });
        body = { company_id: made.id };
      } else {
        body = { guest_name: person.name.trim(), guest_email: person.email.trim(), guest_phone: person.phone.trim() || undefined };
      }
      const made = await apiClient.post<{ id: string }>("/api/v1/admin/orders/draft", body);
      onStarted(made.id);
    } catch (e) {
      setProblem(errorText(e, "The order could not be started. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const choose = (c: { id: string; kind: string; name: string; email: string | null }) => {
    if (c.kind === "guest") {
      // Somebody who bought as a guest before: a guest order again, under
      // the name and email they used.
      setMode("guest");
      setPerson({ name: c.name, email: c.email ?? c.id.replace(/^guest:/, ""), phone: "" });
      setPicked(null);
    } else {
      setPicked({ id: c.id, name: c.name, email: c.email });
    }
  };

  return (
    <>
      <div className="pc-kinds" role="radiogroup" aria-label="Who is the order for?">
        {([
          ["find", "Find a customer", "Someone with an account, or who bought before."],
          ["new", "New customer", "Make their account here, then take the order."],
          ["guest", "Guest", "No account: a name and an email for the receipt."],
        ] as [Mode, string, string][]).map(([key, title, blurb]) => (
          <button key={key} type="button" role="radio" aria-checked={mode === key} className="pc-kind"
            data-on={mode === key ? "" : undefined} data-mode={key} onClick={() => { setMode(key); setProblem(""); }}>
            <span className="pc-kind-title">{title}</span>
            <span className="pc-kind-blurb">{blurb}</span>
          </button>
        ))}
      </div>

      <section className="pc-card pc-pad" style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
        {mode === "find" && (
          <>
            <label className="pc-field" style={{ maxWidth: "none" }}>
              <Search size={16} />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search by name or email" aria-label="Search customers" />
            </label>
            {picked ? (
              <div data-picked>
                <b>{picked.name}</b>{picked.email ? <span className="pc-sub-line" style={{ marginLeft: 8 }}>{picked.email}</span> : null}
                <button type="button" className="pc-link" style={{ background: "none", border: 0, marginLeft: 10 }} onClick={() => setPicked(null)}>Change</button>
              </div>
            ) : found && (found.length ? (
              <div className="pc-card" style={{ boxShadow: "none" }}>
                {found.map((c) => (
                  <button key={c.id} type="button" className="pc-pop-item" style={RESULT_ROW} onClick={() => choose(c)}>
                    <b>{c.name}</b>
                    {c.email ? <span className="pc-sub-line" style={{ marginLeft: 8 }}>{c.email}</span> : null}
                    <span className="pc-sub-line" style={{ marginLeft: 8 }}>{c.kind === "guest" ? "Guest" : c.kind === "wholesale" ? "Wholesale" : "Retail"}</span>
                  </button>
                ))}
              </div>
            ) : <p className="pc-sub-line">Nobody matches. Make them a <button type="button" className="pc-link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => setMode("new")}>new customer</button>, or take it as a guest order.</p>)}
          </>
        )}

        {(mode === "new" || mode === "guest") && (
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label><span className="pc-label">{mode === "new" ? "Name (person or company)" : "Name"}</span>
              <input className="pc-input" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} autoComplete="off" /></label>
            <label><span className="pc-label">Email{mode === "new" ? " (optional)" : ""}</span>
              <input className="pc-input" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} autoComplete="off" /></label>
            <label><span className="pc-label">Phone (optional)</span>
              <input className="pc-input" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} autoComplete="off" /></label>
          </div>
        )}
        {mode === "new" && (
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="checkbox" checked={invite} disabled={!person.email.trim()} onChange={(e) => setInvite(e.target.checked)} />
            <span>Email them a link to set a password and sign in</span>
          </label>
        )}
        {mode === "guest" && <p className="pc-sub-line">The receipt and any invoice or payment link go to this email.</p>}
        {problem && <p role="alert" style={{ color: "var(--pc-red, #B42318)", margin: 0 }}>{problem}</p>}
      </section>

      <div className="pc-wizard-foot">
        <Link href="/admin/orders" className="pc-btn">Cancel</Link>
        <button type="button" className="pc-btn" data-kind="primary" disabled={!ready || busy} onClick={start}>{busy ? "Starting…" : "Continue"}</button>
      </div>
    </>
  );
}

// ── Step 2: Items ───────────────────────────────────────────────────────────

interface FoundProduct {
  id: string;
  name: string;
  slug: string;
  pricing_mode?: string;
  gang_sheet_enabled?: boolean;
  variants?: { id: string; sku: string; color: string | null; size: string | null; retail_price: string; status?: string }[];
}

function ItemsStep({ draft, onChange, onNext, onSaved }: {
  draft: Draft; onChange: (d: Draft) => void; onNext: () => void; onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<FoundProduct[] | null>(null);
  const [chosen, setChosen] = useState<FoundProduct | null>(null);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!q.trim()) { setProducts(null); return; }
    const t = window.setTimeout(() => {
      adminService.listProducts({ q: q.trim() })
        .then((res: unknown) => {
          const r = res as { items?: FoundProduct[] } | FoundProduct[] | null;
          setProducts((Array.isArray(r) ? r : r?.items ?? []).filter((p) => !p.gang_sheet_enabled));
        })
        .catch(() => setProducts([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const refresh = async () => onChange(await apiClient.get<Draft>(`/api/v1/admin/orders/${draft.id}/wizard`));

  async function remove(line: Line) {
    setBusy(line.id);
    try {
      await apiClient.delete(`/api/v1/admin/orders/${draft.id}/items/${line.id}`);
      await refresh();
    } catch (e) {
      tell(errorText(e, "The line could not be removed."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="pc-cols" style={{ alignItems: "start" }}>
      <section className="pc-card pc-pad" style={{ display: "grid", gap: "12px" }} data-items>
        <h2 className="pc-h2">Add items</h2>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label className="pc-field" style={{ maxWidth: "none", flex: "1 1 260px" }}>
            <Search size={16} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setChosen(null); }} placeholder="Search products or SKUs" aria-label="Search products or SKUs" />
          </label>
          <button type="button" className="pc-btn" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
            <ClipboardPaste size={16} /> Paste SKUs
          </button>
        </div>

        {pasting && <PasteSkus orderId={draft.id} onDone={(d, finished) => { onChange(d); if (finished) setPasting(false); }} />}

        {chosen ? (
          <AddRow draft={draft} product={chosen} onAdded={async () => { setChosen(null); setQ(""); setProducts(null); await refresh(); }} onCancel={() => setChosen(null)} />
        ) : products && (products.length ? (
          <div className="pc-card" style={{ boxShadow: "none", maxHeight: 260, overflowY: "auto" }}>
            {products.map((p) => (
              <button key={p.id} type="button" className="pc-pop-item" style={RESULT_ROW} onClick={() => setChosen(p)}>
                <b>{p.name}</b>
                <span className="pc-sub-line" style={{ marginLeft: 8 }}>
                  {p.pricing_mode === "configurable" ? "Built from options" : `${(p.variants ?? []).length} sizes and colours`}
                </span>
              </button>
            ))}
          </div>
        ) : <p className="pc-sub-line">No product matches. Gang sheets are ordered in their builder, not here.</p>)}

        <div className="pc-card" style={{ boxShadow: "none", overflowX: "auto" }}>
          <table className="pc-table" data-lines>
            <thead>
              <tr><th>Product</th><th>Options</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Price (tier)</th><th style={{ textAlign: "right" }}>Total</th><th aria-label="Remove" /></tr>
            </thead>
            <tbody>
              {draft.items.length === 0 ? (
                <tr><td colSpan={6} className="pc-sub-line" style={{ textAlign: "center", padding: "18px" }}>No items yet. Search above, or paste a list of SKUs.</td></tr>
              ) : draft.items.map((line) => (
                <tr key={line.id} data-line={line.sku}>
                  <td><b>{line.product}</b><div className="pc-sub-line">{line.sku}</div></td>
                  <td>{line.options || "—"}</td>
                  <td style={{ textAlign: "right" }}>{line.quantity}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(line.unit_price)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(line.line_total)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="pc-x" aria-label={`Remove ${line.product}`} disabled={busy === line.id} onClick={() => remove(line)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Summary draft={draft}>
        <button type="button" className="pc-btn" data-kind="primary" style={{ width: "100%", justifyContent: "center" }} disabled={!draft.items.length} onClick={onNext}>Continue</button>
        <button type="button" className="pc-btn" style={{ width: "100%", justifyContent: "center" }} onClick={async () => { await tell(`Saved as draft ${draft.order_number}. It is on the Drafts tab.`); onSaved(); }}>Save as draft</button>
      </Summary>
    </div>
  );
}

/** One product's colour and size (or its options), a quantity, and Add. */
function AddRow({ draft, product, onAdded, onCancel }: { draft: Draft; product: FoundProduct; onAdded: () => void; onCancel: () => void }) {
  const configured = product.pricing_mode === "configurable";
  const variants = useMemo(() => (product.variants ?? []).filter((v) => !v.status || v.status === "active"), [product]);
  const colours = useMemo(() => Array.from(new Set(variants.map((v) => v.color || ""))), [variants]);
  const [colour, setColour] = useState(colours[0] ?? "");
  const sizes = useMemo(() => variants.filter((v) => (v.color || "") === colour), [variants, colour]);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string; required: boolean; values: { id: string; label: string }[] }[] | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setVariantId(sizes.length === 1 ? sizes[0]!.id : ""); }, [sizes]);
  useEffect(() => {
    if (!configured) return;
    apiClient.get<{ options: { id: string; name: string; required: boolean; values: { id: string; label: string }[] }[]; default_selections?: Record<string, string> }>(`/api/v1/products/${product.id}/options`)
      .then((r) => { setOptions(r.options ?? []); setPicks({ ...(r.default_selections ?? {}) }); })
      .catch(() => setOptions([]));
  }, [configured, product.id]);

  const quantity = Math.max(1, Math.round(Number(qty) || 1));
  const missing = configured ? (options ?? []).find((o) => o.required && !picks[o.id]) : null;
  const ready = configured ? !!options && !missing : !!variantId;

  async function add() {
    setBusy(true);
    try {
      const body = configured
        ? { product_id: product.id, selections: picks, quantity }
        : { variant_id: variantId, quantity, ...(price.trim() ? { unit_price: Number(price) } : {}) };
      await apiClient.post(`/api/v1/admin/orders/${draft.id}/items`, body);
      onAdded();
    } catch (e) {
      tell(errorText(e, "The item could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pc-card" style={{ boxShadow: "none", padding: "14px", display: "grid", gap: "10px" }} data-add-row>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <b>{product.name}</b>
        <button type="button" className="pc-link" style={{ background: "none", border: 0 }} onClick={onCancel}>Change</button>
      </div>
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }}>
        {configured ? (options ?? []).map((o) => (
          <label key={o.id}><span className="pc-label">{o.name}{o.required ? "" : " (optional)"}</span>
            <select className="pc-input" value={picks[o.id] ?? ""} onChange={(e) => setPicks({ ...picks, [o.id]: e.target.value })}>
              <option value="">Choose…</option>
              {o.values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
        )) : (
          <>
            {colours.length > 1 || colours[0] ? (
              <label><span className="pc-label">Colour</span>
                <select className="pc-input" value={colour} onChange={(e) => setColour(e.target.value)}>
                  {colours.map((c) => <option key={c} value={c}>{c || "—"}</option>)}
                </select>
              </label>
            ) : null}
            <label><span className="pc-label">Size</span>
              <select className="pc-input" value={variantId} onChange={(e) => setVariantId(e.target.value)} aria-label="Size">
                <option value="">Choose…</option>
                {sizes.map((v) => <option key={v.id} value={v.id}>{v.size || v.sku}</option>)}
              </select>
            </label>
          </>
        )}
        <label><span className="pc-label">Qty</span>
          <input className="pc-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" /></label>
        {!configured && (
          <label><span className="pc-label">Price each (optional)</span>
            <input className="pc-input" inputMode="decimal" placeholder="Their price" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        )}
        <button type="button" className="pc-btn" data-kind="primary" disabled={!ready || busy} onClick={add}>{busy ? "Adding…" : "Add"}</button>
      </div>
      <p className="pc-sub-line" style={{ margin: 0 }}>
        {configured ? "Priced from the options chosen, as the shop prices it." : `Left empty, the price is ${draft.customer.kind === "guest" ? "the guest price" : "this customer's own, with their tier and discounts"}.`}
      </p>
    </div>
  );
}

/** Lines of "SKU quantity". What was not found stays in the box, with a note,
 *  to correct and add again; when everything was added the box closes. */
function PasteSkus({ orderId, onDone }: { orderId: string; onDone: (d: Draft, finished: boolean) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function add() {
    setBusy(true);
    setNote("");
    try {
      const r = await apiClient.post<Draft & { added: { sku: string; quantity: number }[]; not_found: string[] }>(
        `/api/v1/admin/orders/${orderId}/items/paste`, { text });
      const added = r.added.length;
      if (r.not_found.length) {
        setNote(`Added ${added}. Not found: ${r.not_found.join(", ")}.`);
        setText(r.not_found.filter((s) => !s.endsWith("(no quantity)")).join("\n"));
        onDone(r, false);
        return;
      }
      await tell(`Added ${added} SKU${added === 1 ? "" : "s"}.`);
      onDone(r, true);
    } catch (e) {
      setNote(errorText(e, "Those SKUs could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pc-card" style={{ boxShadow: "none", padding: "14px", display: "grid", gap: "8px" }} data-paste>
      <label className="pc-label" htmlFor="paste-skus">One SKU per line, with its quantity after it</label>
      <textarea id="paste-skus" className="pc-input" rows={5} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"TEE-BLK-L 12\nTEE-BLK-M 6"} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="pc-btn" data-kind="primary" disabled={!text.trim() || busy} onClick={add}>{busy ? "Adding…" : "Add these"}</button>
        {note && <span className="pc-sub-line" role="status">{note}</span>}
      </div>
    </div>
  );
}

// ── Step 3: Payment ─────────────────────────────────────────────────────────

type Pay = "invoice" | "link" | "paid";

function PaymentStep({ draft, onChange, onBack, onSaved, onPlaced }: {
  draft: Draft; onChange: (d: Draft) => void; onBack: () => void; onSaved: () => void; onPlaced: () => void;
}) {
  const { pickup_enabled } = useBranding();
  const pickupOffered = pickup_enabled !== false;
  const start = draft.delivery.address ?? draft.customer.suggested_address ?? null;
  const [method, setMethod] = useState<"ship" | "will_call">(draft.delivery.method === "will_call" && pickupOffered ? "will_call" : "ship");
  const [addr, setAddr] = useState<Address>({
    full_name: start?.full_name ?? draft.customer.name ?? "", line1: start?.line1 ?? "", line2: start?.line2 ?? "",
    city: start?.city ?? "", state: start?.state ?? "", postal_code: start?.postal_code ?? "",
    country: start?.country || "US", phone: start?.phone ?? draft.customer.phone ?? "",
  });
  const [shipping, setShipping] = useState(draft.shipping ? String(draft.shipping) : "");
  const [po, setPo] = useState(draft.po_number ?? "");
  const [note, setNote] = useState(draft.notes ?? "");
  const [pay, setPay] = useState<Pay>("invoice");
  const [terms, setTerms] = useState(draft.payment_terms && draft.payment_terms !== "net_30" ? draft.payment_terms : draft.customer.kind === "guest" ? "due_on_receipt" : "net_30");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");

  const complete = method === "will_call" || (!!addr.line1.trim() && !!addr.city.trim() && !!addr.state.trim() && !!addr.postal_code.trim());

  async function save(): Promise<Draft | null> {
    if (!complete) { setProblem("Add the address it ships to, or choose pickup."); return null; }
    const d = await apiClient.patch<Draft>(`/api/v1/admin/orders/${draft.id}/draft`, {
      shipping_method: method === "will_call" ? "will_call" : "standard",
      ...(method === "ship" ? { shipping_address: { ...addr, country: (addr.country || "US").toUpperCase().slice(0, 2) } } : {}),
      shipping_cost: method === "ship" ? Math.max(0, Number(shipping) || 0) : 0,
      po_number: po, notes: note,
    });
    onChange(d);
    return d;
  }

  async function update() {
    setBusy("save");
    setProblem("");
    try { await save(); } catch (e) { setProblem(errorText(e, "The delivery could not be saved.")); }
    finally { setBusy(""); }
  }

  async function place() {
    setBusy("place");
    setProblem("");
    try {
      const saved = await save();
      if (!saved) return;
      await apiClient.patch(`/api/v1/admin/orders/${draft.id}`, { status: "confirmed" });
      const placed = await apiClient.get<Draft>(`/api/v1/admin/orders/${draft.id}/wizard`);
      const who = placed.customer.email ?? "the customer";
      try {
        if (pay === "paid") {
          await apiClient.post(`/api/v1/admin/orders/${draft.id}/mark-paid`, {});
          await tell(`Order ${placed.order_number} is placed and marked paid.`);
        } else if (pay === "invoice") {
          await apiClient.post(`/api/v1/admin/orders/${draft.id}/send-invoice`, { payment_terms: terms });
          await tell(`Order ${placed.order_number} is placed. The invoice went to ${who}.`);
        } else {
          await apiClient.post(`/api/v1/admin/orders/${draft.id}/send-invoice`, { payment_terms: "due_on_receipt" });
          const link = await apiClient.get<{ url: string }>(`/api/v1/admin/orders/${draft.id}/payment-link`);
          let copied = false;
          try { await navigator.clipboard.writeText(link.url); copied = true; } catch { /* shown below instead */ }
          await tell(`Order ${placed.order_number} is placed. The payment link went to ${who}${copied ? " and is copied, to text it too" : ""}.\n\n${link.url}`);
        }
      } catch (e) {
        // Placed either way: say what did not happen, and open the order,
        // where it can be done again.
        await tell(`Order ${placed.order_number} is placed, but ${errorText(e, "that last step did not go through")}. Do it again from the order page.`);
      }
      onPlaced();
    } catch (e) {
      setProblem(errorText(e, "The order could not be placed. Try again."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="pc-cols" style={{ alignItems: "start" }}>
      <div style={{ display: "grid", gap: "14px" }}>
        <section className="pc-card pc-pad" style={{ display: "grid", gap: "12px" }} data-delivery>
          <h2 className="pc-h2">Delivery</h2>
          <div className="pc-seg" role="group" aria-label="Delivery" style={{ justifySelf: "start" }}>
            <button type="button" aria-pressed={method === "ship"} onClick={() => setMethod("ship")}>Ship it</button>
            {pickupOffered && <button type="button" aria-pressed={method === "will_call"} onClick={() => setMethod("will_call")}>Pickup at the shop</button>}
          </div>
          {method === "ship" ? (
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <label style={{ gridColumn: "1 / -1" }}><span className="pc-label">Name</span><input className="pc-input" value={addr.full_name ?? ""} onChange={(e) => setAddr({ ...addr, full_name: e.target.value })} /></label>
              <label style={{ gridColumn: "1 / -1" }}><span className="pc-label">Address</span><input className="pc-input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} /></label>
              <label style={{ gridColumn: "1 / -1" }}><span className="pc-label">Apartment, suite (optional)</span><input className="pc-input" value={addr.line2 ?? ""} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} /></label>
              <label><span className="pc-label">City</span><input className="pc-input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></label>
              <label><span className="pc-label">State</span><input className="pc-input" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} /></label>
              <label><span className="pc-label">ZIP</span><input className="pc-input" value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} /></label>
              <label><span className="pc-label">Phone (optional)</span><input className="pc-input" value={addr.phone ?? ""} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} /></label>
              <label><span className="pc-label">Shipping charge ($)</span><input className="pc-input" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0.00" /></label>
            </div>
          ) : <p className="pc-sub-line">The customer collects it. No shipping is charged, and tax is worked out on the shop&apos;s pickup address.</p>}
          <div>
            <button type="button" className="pc-btn" disabled={busy !== ""} onClick={update}>{busy === "save" ? "Working out…" : "Update total"}</button>
            <span className="pc-sub-line" style={{ marginLeft: 10 }}>Tax is worked out on {method === "ship" ? "this address" : "the pickup address"}{draft.customer.tax_exempt ? " (this customer is tax exempt)" : ""}.</span>
          </div>
        </section>

        <section className="pc-card pc-pad" style={{ display: "grid", gap: "12px" }} data-payment>
          <h2 className="pc-h2">Payment</h2>
          <div className="pc-kinds" role="radiogroup" aria-label="How it is paid">
            {([
              ["invoice", "Send an invoice", "Emailed with the PDF and a Pay now link, due on its terms."],
              ["link", "Send a payment link", "A link to pay by card now, emailed and copied to text."],
              ["paid", "Mark paid", "Paid already: cash, check, or a card at the counter."],
            ] as [Pay, string, string][]).map(([key, title, blurb]) => (
              <button key={key} type="button" role="radio" aria-checked={pay === key} className="pc-kind" data-on={pay === key ? "" : undefined} data-pay={key} onClick={() => setPay(key)}>
                <span className="pc-kind-title">{title}</span>
                <span className="pc-kind-blurb">{blurb}</span>
              </button>
            ))}
          </div>
          {pay === "invoice" && (
            <label style={{ maxWidth: "260px" }}><span className="pc-label">Terms</span>
              <select className="pc-input" value={terms} onChange={(e) => setTerms(e.target.value)}>
                <option value="due_on_receipt">Due on receipt</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
              </select>
            </label>
          )}
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label><span className="pc-label">PO number (optional)</span><input className="pc-input" value={po} onChange={(e) => setPo(e.target.value)} /></label>
            <label><span className="pc-label">Note on the order (optional)</span><input className="pc-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          {problem && <p role="alert" style={{ color: "var(--pc-red, #B42318)", margin: 0 }}>{problem}</p>}
        </section>
      </div>

      <Summary draft={draft} full>
        <button type="button" className="pc-btn" data-kind="primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy !== "" || !draft.items.length} onClick={place}>
          {busy === "place" ? "Placing…" : "Place order"}
        </button>
        <button type="button" className="pc-btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy !== ""}
          onClick={async () => { try { await save(); } catch { /* the draft keeps what it had */ } await tell(`Saved as draft ${draft.order_number}. It is on the Drafts tab.`); onSaved(); }}>
          Save as draft
        </button>
        <button type="button" className="pc-link" style={{ background: "none", border: 0 }} onClick={onBack}>Back to items</button>
      </Summary>
    </div>
  );
}

// ── The order, beside every step ────────────────────────────────────────────

function Summary({ draft, full = false, children }: { draft: Draft; full?: boolean; children: React.ReactNode }) {
  const c = draft.customer;
  return (
    <aside className="pc-panel" data-order-summary>
      <div className="pc-panel-head"><h2 className="pc-h2">Order</h2></div>
      <div className="pc-panel-body">
        <div style={{ display: "grid", gap: "4px" }}>
          <div>Customer: <b>{c.name || "Guest"}</b>{c.kind === "guest" ? " (guest)" : ""}</div>
          <div>Tier: {c.kind === "guest" ? "Guest price" : c.tier ?? "Standard price"}</div>
        </div>
        <div style={{ borderTop: "1px solid var(--pc-line)", paddingTop: "12px", display: "grid", gap: "6px" }}>
          {full && (
            <>
              <Row label="Items" value={money(draft.subtotal)} />
              <Row label="Shipping" value={money(draft.shipping)} />
              <Row label="Tax" value={money(draft.tax)} />
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "16px" }} data-total>
            <span>Total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(full ? draft.total : draft.subtotal)}</span>
          </div>
          {!full && <span className="pc-sub-line">Shipping and tax are added at Payment.</span>}
        </div>
        <div style={{ display: "grid", gap: "8px" }}>{children}</div>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between" }}><span className="pc-sub-line">{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span></div>;
}
