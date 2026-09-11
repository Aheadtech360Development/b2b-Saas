"use client";

/**
 * ProductConfigurator — the buyer side of configurable products.
 *
 * Deliberately knows nothing about what the product is. It reads whatever option
 * groups the brand defined and renders each one by its declared input type, so a
 * brand can publish Yard Signs tomorrow — different fields, more or fewer than
 * Business Cards — with no front-end work at all.
 *
 * The price shown always comes from the server (`/products/{id}/price`), and the
 * cart re-prices on add, so the displayed figure and the charged figure are
 * produced by the same code path.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";

interface OptValue {
  id: string; label: string; price_delta: number; price_mode: string;
  image_url?: string | null; swatch_hex?: string | null; is_default: boolean;
}
interface Opt {
  id: string; name: string; input_type: string; required: boolean;
  help_text?: string | null; values: OptValue[];
}
interface Rule {
  when_value_id: string;
  action: "hide_option" | "disable_option" | "disable_value";
  target_option_id?: string | null;
  target_value_id?: string | null;
  note?: string | null;
}
interface Config {
  pricing_mode: string; base_price: number | null;
  options: Opt[]; qty_tiers: { min_qty: number; unit_price: number }[];
  rules?: Rule[];
  default_selections: Record<string, string>;
}
interface Priced { unit_price: number; total: number; setup_fees: number; quantity: number; }

/**
 * Mirror of `configurator_service.evaluate_rules`. Running it here keeps the form
 * reacting instantly; the server runs the same logic when pricing, so a buyer can
 * never push through a combination the rules forbid.
 */
function evaluateRules(rules: Rule[], sel: Record<string, string | string[]>) {
  const picked = new Set<string>();
  for (const v of Object.values(sel)) {
    if (Array.isArray(v)) v.forEach((x) => picked.add(x));
    else if (v) picked.add(v);
  }
  const hidden = new Set<string>();
  const disabledOptions = new Map<string, string>();
  const disabledValues = new Map<string, string>();
  for (const r of rules) {
    if (!picked.has(r.when_value_id)) continue;
    const note = r.note || "Not available with your current selection";
    if (r.action === "hide_option" && r.target_option_id) hidden.add(r.target_option_id);
    else if (r.action === "disable_option" && r.target_option_id) disabledOptions.set(r.target_option_id, note);
    else if (r.action === "disable_value" && r.target_value_id) disabledValues.set(r.target_value_id, note);
  }
  return { hidden, disabledOptions, disabledValues };
}

export function ProductConfigurator({ productId, productName }: { productId: string; productName: string }) {
  const { isAuthenticated } = useAuthStore();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [sel, setSel] = useState<Record<string, string | string[]>>({});
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<Priced | null>(null);
  const [pricing, setPricing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    apiClient.get<Config>(`/api/v1/products/${productId}/options`)
      .then((c) => {
        setCfg(c);
        setSel(c.default_selections ?? {});
        const firstTier = c.qty_tiers?.[0]?.min_qty;
        if (firstTier) setQty(firstTier);
      })
      .catch(() => setError("Could not load this product's options."));
  }, [productId]);

  // Re-price on every change — the server is the only authority.
  const repriceNow = useCallback(async (selections: Record<string, string | string[]>, quantity: number) => {
    const mine = ++seq.current;
    setPricing(true);
    try {
      const p = await apiClient.post<Priced>(`/api/v1/products/${productId}/price`, { selections, quantity });
      if (mine === seq.current) { setPrice(p); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError((e as { message?: string })?.message || "Couldn't price this combination.");
    } finally {
      if (mine === seq.current) setPricing(false);
    }
  }, [productId]);

  // A rule can forbid the choice that's currently selected (pick UV Coating and
  // the chosen Laminating becomes invalid). Move to the next allowed choice
  // before pricing, so the buyer never sees an error they didn't cause.
  useEffect(() => {
    if (!cfg?.rules?.length) return;
    const { disabledValues } = evaluateRules(cfg.rules, sel);
    if (!disabledValues.size) return;
    let changed = false;
    const next: Record<string, string | string[]> = { ...sel };
    for (const o of cfg.options) {
      const cur = next[o.id];
      if (Array.isArray(cur)) {
        const keep = cur.filter((id) => !disabledValues.has(id));
        if (keep.length !== cur.length) { next[o.id] = keep; changed = true; }
      } else if (cur && disabledValues.has(cur)) {
        const allowed = o.values.find((v) => !disabledValues.has(v.id));
        if (allowed) next[o.id] = allowed.id; else delete next[o.id];
        changed = true;
      }
    }
    if (changed) setSel(next);
  }, [cfg, sel]);

  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(() => repriceNow(sel, qty), 180); // debounce rapid changes
    return () => clearTimeout(t);
  }, [cfg, sel, qty, repriceNow]);

  function pick(optionId: string, valueId: string) { setSel((s) => ({ ...s, [optionId]: valueId })); }
  function toggle(optionId: string, valueId: string) {
    setSel((s) => {
      const cur = Array.isArray(s[optionId]) ? (s[optionId] as string[]) : [];
      return { ...s, [optionId]: cur.includes(valueId) ? cur.filter((v) => v !== valueId) : [...cur, valueId] };
    });
  }

  async function addToCart() {
    if (!isAuthenticated()) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setAdding(true); setError(null);
    try {
      await apiClient.post("/api/v1/cart/add-configured", { product_id: productId, selections: sel, quantity: qty });
      window.location.href = "/cart";
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not add to cart.");
      setAdding(false);
    }
  }

  if (!cfg) {
    return <div style={{ marginTop: "18px" }}>{[70, 50, 60].map((w, i) => (
      <div key={i} className="at-skel" style={{ height: "16px", width: `${w}%`, marginBottom: "12px" }} />
    ))}</div>;
  }

  const { hidden, disabledOptions, disabledValues } = evaluateRules(cfg.rules ?? [], sel);

  return (
    <div style={{ marginTop: "20px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Every option group the brand defined, in its configured order. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {cfg.options.map((o) => {
          if (hidden.has(o.id)) return null;               // a rule removed this field
          const offNote = disabledOptions.get(o.id);
          const chosen = sel[o.id];
          // Picture-led choices read better as tiles than as a dropdown.
          const asTiles = !offNote && o.input_type !== "checkbox" && o.input_type !== "swatch"
            && o.values.some((v) => v.image_url);
          return (
            <div key={o.id} style={offNote ? { opacity: 0.55 } : undefined}>
              <label style={LABEL}>
                {o.name}{o.required && !offNote && <span style={{ color: "#DC2626" }}> *</span>}
                {o.help_text && <span title={o.help_text} style={HELP}>?</span>}
              </label>

              {offNote ? (
                <div style={OFF_NOTE}>{offNote}</div>
              ) : asTiles ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "8px" }}>
                  {o.values.map((v) => {
                    const active = chosen === v.id;
                    const off = disabledValues.get(v.id);
                    return (
                      <button key={v.id} onClick={() => !off && pick(o.id, v.id)} disabled={!!off} title={off || v.label}
                        style={{ ...TILE, borderColor: active ? "#111" : "#E2E2DE", background: active ? "#FAFAFA" : "#fff",
                          opacity: off ? 0.4 : 1, cursor: off ? "not-allowed" : "pointer" }}>
                        {v.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={v.image_url} alt={v.label} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "5px", display: "block" }} />
                          : <div style={{ width: "100%", aspectRatio: "1", borderRadius: "5px", background: v.swatch_hex || "#EFEFEC" }} />}
                        <span style={{ display: "block", fontSize: "12px", fontWeight: 600, marginTop: "6px", lineHeight: 1.3 }}>{v.label}</span>
                        {v.price_delta !== 0 && <span style={{ ...DELTA, display: "block", fontWeight: 700 }}>{fmtDelta(v)}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : o.input_type === "swatch" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {o.values.map((v) => {
                    const active = chosen === v.id;
                    const off = disabledValues.get(v.id);
                    return (
                      <button key={v.id} onClick={() => !off && pick(o.id, v.id)} disabled={!!off} title={off || v.label}
                        style={{ width: "34px", height: "34px", borderRadius: "50%", cursor: off ? "not-allowed" : "pointer",
                          background: v.image_url ? `url(${v.image_url}) center/cover` : (v.swatch_hex || "#DDD"),
                          border: active ? "2px solid #111" : "1px solid #D6D3CC", opacity: off ? 0.35 : 1,
                          boxShadow: active ? "0 0 0 3px rgba(0,0,0,.08)" : "none" }} />
                    );
                  })}
                </div>
              ) : o.input_type === "radio" ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {o.values.map((v) => {
                    const active = chosen === v.id;
                    const off = disabledValues.get(v.id);
                    return (
                      <label key={v.id} title={off || undefined}
                        style={{ ...RADIO, borderColor: active ? "#111" : "#E2E2DE", background: active ? "#FAFAFA" : "#fff",
                          opacity: off ? 0.45 : 1, cursor: off ? "not-allowed" : "pointer" }}>
                        <input type="radio" name={o.id} checked={active} disabled={!!off} onChange={() => pick(o.id, v.id)} style={{ accentColor: "#111" }} />
                        {v.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.image_url} alt="" style={THUMB} />
                        )}
                        <span style={{ flex: 1 }}>{v.label}{off && <span style={OFF_TAG}>{off}</span>}</span>
                        {v.price_delta !== 0 && <span style={DELTA}>{fmtDelta(v)}</span>}
                      </label>
                    );
                  })}
                </div>
              ) : o.input_type === "checkbox" ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {o.values.map((v) => {
                    const on = Array.isArray(chosen) && chosen.includes(v.id);
                    const off = disabledValues.get(v.id);
                    return (
                      <label key={v.id} title={off || undefined}
                        style={{ ...RADIO, borderColor: on ? "#111" : "#E2E2DE", background: on ? "#FAFAFA" : "#fff",
                          opacity: off ? 0.45 : 1, cursor: off ? "not-allowed" : "pointer" }}>
                        <input type="checkbox" checked={on} disabled={!!off} onChange={() => toggle(o.id, v.id)} style={{ accentColor: "#111" }} />
                        {v.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.image_url} alt="" style={THUMB} />
                        )}
                        <span style={{ flex: 1 }}>{v.label}{off && <span style={OFF_TAG}>{off}</span>}</span>
                        {v.price_delta !== 0 && <span style={DELTA}>{fmtDelta(v)}</span>}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <select value={typeof chosen === "string" ? chosen : ""} onChange={(e) => pick(o.id, e.target.value)} style={SELECT}>
                  {!o.required && <option value="">None</option>}
                  {o.values.map((v) => (
                    <option key={v.id} value={v.id} disabled={disabledValues.has(v.id)}>
                      {v.label}{v.price_delta !== 0 ? `  (${fmtDelta(v)})` : ""}
                      {disabledValues.has(v.id) ? ` — ${disabledValues.get(v.id)}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}

        {/* Quantity — breaks are surfaced so the buyer can see the next saving. */}
        <div>
          <label style={LABEL}>Quantity</label>
          {cfg.qty_tiers.length > 0 ? (
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))} style={SELECT}>
              {cfg.qty_tiers.map((t) => (
                <option key={t.min_qty} value={t.min_qty}>{t.min_qty.toLocaleString()} — ${t.unit_price.toFixed(2)} ea</option>
              ))}
            </select>
          ) : (
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={SELECT} />
          )}
        </div>
      </div>

      {error && <div style={ERR}>{error}</div>}

      {/* Live, server-priced quote */}
      <div style={QUOTE}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".06em" }}>Instant quote</div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#111", lineHeight: 1.1, opacity: pricing ? 0.45 : 1, transition: "opacity .15s" }}>
            ${(price?.total ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
            {price ? <>unit ${price.unit_price.toFixed(2)} × {price.quantity.toLocaleString()}{price.setup_fees ? ` + $${price.setup_fees.toFixed(2)} one-off` : ""}</> : "Choose your options"}
          </div>
        </div>
        <button onClick={addToCart} disabled={adding || pricing || !!error} style={{ ...CTA, opacity: adding || pricing || error ? 0.6 : 1 }}>
          {adding ? "Adding…" : isAuthenticated() ? "ADD TO CART" : "SIGN IN TO ORDER"}
        </button>
      </div>
      <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "8px" }}>
        Price updates live as you configure {productName}. Final price is confirmed at checkout.
      </p>
    </div>
  );
}

function fmtDelta(v: OptValue) {
  const sign = v.price_delta > 0 ? "+" : "−";
  const n = Math.abs(v.price_delta);
  if (v.price_mode === "percent") return `${sign}${n}%`;
  return `${sign}$${n.toFixed(2)}${v.price_mode === "per_unit" ? "/ea" : ""}`;
}

const LABEL: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B6B6B", marginBottom: "6px" };
const HELP: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", border: "1px solid #C9C5BD", color: "#8A8A8A", fontSize: "9px", marginLeft: "6px", cursor: "help" };
const SELECT: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #D6D3CC", borderRadius: "8px", fontSize: "14px", background: "#fff" };
const RADIO: React.CSSProperties = { display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", border: "1px solid #E2E2DE", borderRadius: "8px", fontSize: "13px", cursor: "pointer" };
const DELTA: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#6B6B6B" };
const TILE: React.CSSProperties = { border: "1px solid #E2E2DE", borderRadius: "8px", padding: "7px", textAlign: "left", font: "inherit", color: "#111" };
const THUMB: React.CSSProperties = { width: "34px", height: "34px", objectFit: "cover", borderRadius: "5px", border: "1px solid #EFEFEC" };
const OFF_NOTE: React.CSSProperties = { padding: "11px 12px", border: "1px dashed #D6D3CC", borderRadius: "8px", fontSize: "12px", color: "#8A8A8A", background: "#FAFAF9" };
const OFF_TAG: React.CSSProperties = { display: "block", fontSize: "11px", color: "#9CA3AF", marginTop: "1px" };
const QUOTE: React.CSSProperties = { marginTop: "22px", padding: "18px 20px", background: "#F7F7F5", border: "1px solid #E2E2DE", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" };
const CTA: React.CSSProperties = { background: "#DC2626", color: "#fff", border: "none", borderRadius: "6px", padding: "15px 34px", fontSize: "15px", fontWeight: 800, letterSpacing: ".03em", cursor: "pointer" };
const ERR: React.CSSProperties = { marginTop: "14px", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" };
