"use client";

/**
 * Buying shipping labels for several orders at once.
 *
 * Nothing is bought on opening it. Each order is quoted first (from its own
 * weight and address, on the shop's own carrier account), the cheapest rate is
 * picked and can be changed, and the total is shown on the button that spends
 * it. An order that could not be quoted is listed with the reason and left
 * out, so one bad address does not stop the rest.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";

export interface LabelTarget { id: string; order_number: string; customer: string; rate_id?: string | null; carrier?: string | null }

interface Rate { rate_id: string; carrier: string; service: string; cost: number; currency: string; days: number | null }
interface Quote { state: "loading" | "ready" | "failed" | "bought"; rates: Rate[]; chosen: string; error?: string; tracking?: string }
interface LabelResult { success?: boolean; tracking_number?: string; error?: string }

const money = (n: number) => `$${n.toFixed(2)}`;

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
  const [buying, setBuying] = useState(false);
  const [tell, setTell] = useState(notify);
  const boughtAny = useRef(false);
  const connected = carriers.length > 0;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setQuotes(Object.fromEntries(targets.map((t) => [t.id, { state: "loading", rates: [], chosen: "" } as Quote])));
    (async () => {
      // One after another: a carrier's rate service answers a burst of requests badly.
      for (const t of targets) {
        if (cancelled) return;
        let next: Quote;
        try {
          const r = await apiClient.post<{ rates: Rate[]; error?: string }>(`/api/v1/admin/orders/${t.id}/fetch-rates`, {});
          const rates = (r.rates ?? []).slice().sort((a, b) => a.cost - b.cost);
          next = rates.length
            ? { state: "ready", rates, chosen: rates[0]!.rate_id }
            : { state: "failed", rates: [], chosen: "", error: r.error || "No carrier offered a rate for this address." };
        } catch (e) {
          next = { state: "failed", rates: [], chosen: "", error: e instanceof Error ? e.message : "The rates could not be read." };
        }
        if (cancelled) return;
        setQuotes((q) => ({ ...q, [t.id]: next }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const ready = targets.filter((t) => quotes[t.id]?.state === "ready");
  const waiting = targets.some((t) => quotes[t.id]?.state === "loading");
  const total = ready.reduce((sum, t) => {
    const q = quotes[t.id]!;
    return sum + (q.rates.find((r) => r.rate_id === q.chosen)?.cost ?? 0);
  }, 0);

  async function buy() {
    setBuying(true);
    for (const t of ready) {
      const q = quotes[t.id]!;
      const rate = q.rates.find((r) => r.rate_id === q.chosen);
      if (!rate) continue;
      try {
        const r = await apiClient.post<LabelResult>(`/api/v1/admin/orders/${t.id}/generate-label-manual`, {
          rate_id: rate.rate_id, carrier: rate.carrier, service: rate.service, notify: tell,
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

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pc-modal" role="dialog" aria-label="Buy shipping labels">
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">Buy shipping labels</h2>
            <div className="pc-sub-line">{targets.length === 0 ? "Nothing to buy a label for" : `For ${targets.length} ${targets.length === 1 ? "order" : "orders"}`}</div>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={close}><X size={18} strokeWidth={2.2} /></button>
        </div>
        <div className="pc-panel-body">
          {targets.length === 0 ? (
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
              {targets.map((t) => {
                const q = quotes[t.id];
                return (
                  <div key={t.id} data-label-order={t.order_number}>
                    <div className="pc-kv" style={{ marginBottom: "8px" }}>
                      <span><b>{t.order_number}</b> · {t.customer}</span>
                      {q?.state === "bought" && <span className="pc-pill" data-tone="green">Label bought</span>}
                    </div>
                    {(!q || q.state === "loading") && <div className="pc-sub-line">Asking the carrier for rates…</div>}
                    {q?.state === "failed" && <div className="pc-note" data-tone="red">{q.error}</div>}
                    {q?.state === "bought" && q.tracking && <div className="pc-sub-line">Tracking {q.tracking}</div>}
                    {q?.state === "ready" && (
                      <select className="pc-input" value={q.chosen} disabled={buying} aria-label={`Rate for order ${t.order_number}`}
                        onChange={(e) => setQuotes((all) => ({ ...all, [t.id]: { ...q, chosen: e.target.value } }))}>
                        {q.rates.map((r) => (
                          <option key={r.rate_id} value={r.rate_id}>
                            {r.carrier} {r.service} · {money(r.cost)}{r.days != null ? ` · ${r.days} ${r.days === 1 ? "day" : "days"}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              <hr className="pc-rule" />
              <label className="pc-check-row">
                <input type="checkbox" className="pc-check" checked={tell} disabled={buying} onChange={(e) => setTell(e.target.checked)} />
                Email each customer when their order ships
              </label>
              <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="pc-btn" onClick={close} disabled={buying}>{boughtAny.current ? "Done" : "Cancel"}</button>
                <button type="button" className="pc-btn" data-kind="primary" disabled={buying || waiting || ready.length === 0} onClick={buy}>
                  {buying ? "Buying…" : waiting ? "Getting rates…" : ready.length === 0 ? "Nothing to buy" : `Buy ${ready.length} ${ready.length === 1 ? "label" : "labels"} · ${money(total)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
