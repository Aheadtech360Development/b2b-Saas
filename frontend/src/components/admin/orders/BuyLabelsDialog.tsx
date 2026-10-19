"use client";

/**
 * Buy labels for several orders at once (design 33).
 *
 * Nothing is bought on opening it. Each order is quoted first, one after
 * another, from its own weight and address on the shop's own carrier account.
 * Then one carrier and one service are chosen for the batch, the cheapest that
 * reaches the most of them to begin with:
 * - every order shows its own rate for that service, with where it goes and
 *   what it weighs;
 * - the total is what the batch costs;
 * - an order the service does not reach, or that could not be quoted, is named
 *   and left out, so one bad address does not stop the rest.
 * Tracking goes on each order, and the customer is emailed when `notify` is on.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";

export interface LabelTarget { id: string; order_number: string; customer: string; rate_id?: string | null; carrier?: string | null }

interface Rate { rate_id: string; carrier: string; service: string; cost: number; currency: string; days: number | null }
interface Quote {
  state: "loading" | "ready" | "failed" | "bought";
  rates: Rate[];
  error?: string;
  tracking?: string;
  to?: { city: string; state: string } | null;
  weight?: number | null;
}
interface QuoteAnswer { rates: Rate[]; error?: string; to?: { city: string; state: string }; weight_lbs?: number }
interface LabelResult { success?: boolean; tracking_number?: string; error?: string }

const money = (n: number) => `$${n.toFixed(2)}`;

/** The choice that reaches the most orders, then costs the least in all. */
function best(keys: string[], ready: Quote[], pick: (q: Quote, key: string) => Rate | undefined): string {
  let chosen = "";
  let reach = -1;
  let cost = Infinity;
  for (const key of keys) {
    const rates = ready.map((q) => pick(q, key)).filter((r): r is Rate => !!r);
    const total = rates.reduce((s, r) => s + r.cost, 0);
    if (rates.length > reach || (rates.length === reach && total < cost)) {
      chosen = key; reach = rates.length; cost = total;
    }
  }
  return chosen;
}

export function BuyLabelsDialog({
  targets, carriers, notify, onClose, onBought,
}: {
  targets: LabelTarget[];
  carriers: string[];
  /** Whether each customer is emailed that their order has shipped. */
  notify: boolean;
  onClose: () => void;
  onBought: () => void;
}) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [carrier, setCarrier] = useState("");
  const [service, setService] = useState("");
  const [buying, setBuying] = useState(false);
  const boughtAny = useRef(false);
  const connected = carriers.length > 0;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setQuotes(Object.fromEntries(targets.map((t) => [t.id, { state: "loading", rates: [] } as Quote])));
    (async () => {
      // One after another: a carrier's rate service answers a burst of requests badly.
      for (const t of targets) {
        if (cancelled) return;
        let next: Quote;
        try {
          const r = await apiClient.post<QuoteAnswer>(`/api/v1/admin/orders/${t.id}/fetch-rates`, {});
          const rates = (r.rates ?? []).slice().sort((a, b) => a.cost - b.cost);
          next = rates.length
            ? { state: "ready", rates, to: r.to ?? null, weight: r.weight_lbs ?? null }
            : { state: "failed", rates: [], to: r.to ?? null, weight: r.weight_lbs ?? null, error: r.error || "No carrier offered a rate for this address." };
        } catch (e) {
          next = { state: "failed", rates: [], error: e instanceof Error ? e.message : "The rates could not be read." };
        }
        if (cancelled) return;
        setQuotes((q) => ({ ...q, [t.id]: next }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const ready = useMemo(() => targets.map((t) => quotes[t.id]).filter((q): q is Quote => q?.state === "ready"), [targets, quotes]);
  const waiting = targets.some((t) => !quotes[t.id] || quotes[t.id]!.state === "loading");
  const carrierNames = useMemo(() => Array.from(new Set(ready.flatMap((q) => q.rates.map((r) => r.carrier)))).sort(), [ready]);
  const serviceNames = useMemo(
    () => Array.from(new Set(ready.flatMap((q) => q.rates.filter((r) => r.carrier === carrier).map((r) => r.service)))),
    [ready, carrier],
  );

  // The first choice, once every order has its quote: the carrier and then the
  // service that reach the most orders for the least. Changed by hand after.
  useEffect(() => {
    if (waiting || !ready.length) return;
    if (!carrier || !carrierNames.includes(carrier)) {
      setCarrier(best(carrierNames, ready, (q, c) => q.rates.find((r) => r.carrier === c)));
    }
  }, [waiting, ready, carrier, carrierNames]);
  useEffect(() => {
    if (!carrier) return;
    if (!service || !serviceNames.includes(service)) {
      setService(best(serviceNames, ready, (q, s) => q.rates.find((r) => r.carrier === carrier && r.service === s)));
    }
  }, [carrier, service, serviceNames, ready]);

  const rateFor = (q: Quote | undefined) => q?.rates.find((r) => r.carrier === carrier && r.service === service);
  const buyable = targets.filter((t) => quotes[t.id]?.state === "ready" && rateFor(quotes[t.id]));
  const total = buyable.reduce((sum, t) => sum + (rateFor(quotes[t.id])?.cost ?? 0), 0);

  async function buy() {
    setBuying(true);
    for (const t of buyable) {
      const q = quotes[t.id]!;
      const rate = rateFor(q);
      if (!rate) continue;
      try {
        const r = await apiClient.post<LabelResult>(`/api/v1/admin/orders/${t.id}/generate-label-manual`, {
          rate_id: rate.rate_id, carrier: rate.carrier, service: rate.service, notify,
        });
        if (r.success) {
          boughtAny.current = true;
          setQuotes((all) => ({ ...all, [t.id]: { ...q, state: "bought", tracking: r.tracking_number } }));
        } else {
          setQuotes((all) => ({ ...all, [t.id]: { ...q, state: "failed", error: r.error || "The label was not bought." } }));
        }
      } catch (e) {
        setQuotes((all) => ({ ...all, [t.id]: { ...q, state: "failed", error: e instanceof Error ? e.message : "The label was not bought." } }));
      }
    }
    setBuying(false);
    if (boughtAny.current) onBought();
  }

  function close() {
    if (buying) return;
    onClose();
  }

  const n = targets.length;
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pc-modal" role="dialog" aria-label="Buy labels" data-buy-labels style={{ maxWidth: "560px" }}>
        <div className="pc-panel-head">
          <h2 className="pc-h2">{n === 0 ? "Buy labels" : `Buy labels for ${n} ${n === 1 ? "order" : "orders"}`}</h2>
          <button type="button" className="pc-x" aria-label="Close" onClick={close}><X size={18} strokeWidth={2.2} /></button>
        </div>
        <div className="pc-panel-body">
          {n === 0 ? (
            <div className="pc-note" data-tone="blue">
              None of the selected orders can have a label bought. An order has to be confirmed, not shipped yet, not a pickup, and its artwork approved.
            </div>
          ) : !connected ? (
            <div className="pc-note">
              No carrier is connected yet, so rates can&apos;t load and no label can be bought.{" "}
              <Link href="/admin/standard-shipping">Connect a carrier</Link>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label><span className="pc-label">Carrier</span>
                  <select className="pc-input" value={carrier} disabled={buying || !carrierNames.length} onChange={(e) => { setCarrier(e.target.value); setService(""); }} aria-label="Carrier">
                    {!carrierNames.length && <option value="">{waiting ? "Getting rates…" : "No rates"}</option>}
                    {carrierNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label><span className="pc-label">Service</span>
                  <select className="pc-input" value={service} disabled={buying || !serviceNames.length} onChange={(e) => setService(e.target.value)} aria-label="Service">
                    {!serviceNames.length && <option value="">{waiting ? "Getting rates…" : "—"}</option>}
                    {serviceNames.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <div className="pc-card" style={{ boxShadow: "none", overflowX: "auto" }}>
                <table className="pc-table">
                  <thead>
                    <tr><th>Order</th><th>To</th><th style={{ textAlign: "right" }}>Weight</th><th style={{ textAlign: "right" }}>Rate</th></tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => {
                      const q = quotes[t.id];
                      const rate = rateFor(q);
                      return (
                        <tr key={t.id} data-label-order={t.order_number}>
                          <td style={{ fontWeight: 600 }}>{t.order_number}</td>
                          <td>{q?.to ? `${q.to.city}, ${q.to.state}` : "—"}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{q?.weight != null ? `${q.weight} lb` : "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {!q || q.state === "loading" ? <span className="pc-sub-line">Getting rate…</span>
                              : q.state === "bought" ? <span className="pc-pill" data-tone="green" style={{ textTransform: "none" }}>Bought{q.tracking ? ` · ${q.tracking}` : ""}</span>
                              : q.state === "failed" ? <span style={{ color: "var(--pc-red, #B42318)" }} title={q.error}>{q.error && q.error.length < 60 ? q.error : "No rate"}</span>
                              : rate ? money(rate.cost)
                              // Until a service is chosen nothing is "not offered" yet.
                              : !carrier || !service ? <span className="pc-sub-line">—</span>
                              : <span className="pc-sub-line">Not offered</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <b data-labels-total>Total {money(total)}</b>
                <div className="pc-row-actions">
                  <button type="button" className="pc-btn" onClick={close} disabled={buying}>{boughtAny.current ? "Done" : "Cancel"}</button>
                  <button type="button" className="pc-btn" data-kind="primary" disabled={buying || waiting || buyable.length === 0} onClick={buy}>
                    {buying ? "Buying…" : waiting ? "Getting rates…" : buyable.length === n ? "Buy labels" : `Buy ${buyable.length} ${buyable.length === 1 ? "label" : "labels"}`}
                  </button>
                </div>
              </div>
              <p className="pc-sub-line" style={{ margin: 0 }}>
                Tracking is saved on each order{notify ? " and emailed to the customer" : ""}.
                {buyable.length < n && !waiting ? " Orders this service does not reach are left out." : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
