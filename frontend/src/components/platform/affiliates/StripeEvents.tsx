"use client";

import { useEffect, useState } from "react";

import { Banner, Chip, Count, Empty, Icon, Skeleton, errorText, useToast, type Tone } from "@/components/partners/ui";
import { aff } from "./api";
import { ago } from "./Overview";

type Event = {
  id: number; stripe_event_id: string; event_type: string; received_at: string; result: string; detail: string | null;
  attempts: number; last_error: string | null; resolved_at: string | null; shop_name: string | null; retries_left: number | null;
};
type Data = {
  stats: { last_received: string | null; processed_24h: number; lines_24h: number; replays_24h: number; failed: number; retries_left: number | null };
  rows: Event[]; total: number; pages: number;
};

const RESULT: Record<string, { label: string; tone: Tone }> = {
  line_created: { label: "Line created", tone: "ok" },
  replay_ignored: { label: "Replay ignored", tone: "mut" },
  ignored: { label: "Ignored", tone: "mut" },
  failed: { label: "Failed", tone: "bad" },
  plan_updated: { label: "Plan updated", tone: "info" },
  clawback_created: { label: "Clawback created", tone: "warn" },
  referral_ended: { label: "Referral ended", tone: "mut" },
  payment_failed: { label: "Payment failed", tone: "warn" },
};

function when(at: string) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-2)}` : id;
}

export function StripeEvents({ onChanged }: { onChanged: () => void }) {
  // Null until the first answer says which mode the platform is in.
  const [mode, setMode] = useState<"live" | "test" | null>(null);
  const [result, setResult] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();

  const load = () => {
    const p = new URLSearchParams({ page: String(page) });
    if (mode) p.set("mode", mode);
    if (result) p.set("result", result);
    if (q.trim()) p.set("q", q.trim());
    return aff.get<Data & { mode: "live" | "test" }>(`/stripe-events?${p}`)
      .then((d) => { setData(d); if (!mode) setMode(d.mode); })
      .catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, result, q, page]);

  async function retry(id: number) {
    setBusy(id);
    try {
      const r = await aff.post<{ ok: boolean; detail: string }>(`/stripe-events/${id}/retry`);
      toast.show(r.ok ? `Done: ${r.detail}` : `Still failing: ${r.detail}`);
      onChanged();
      void load();
    } catch (e) { toast.show(errorText(e)); } finally { setBusy(null); }
  }

  const failed = data?.rows.filter((r) => r.result === "failed") ?? [];
  const first = failed[0];
  const s = data?.stats;
  return (
    <>
      <div className="ph">
        <div>
          <h1>Stripe events</h1>
          <p>What the commission handlers did with each event. Each line is keyed to its invoice, so a replay never pays twice.</p>
        </div>
        <div className="row">
          <button className={`pill${mode === "live" ? " on" : ""}`} aria-pressed={mode === "live"} onClick={() => { setMode("live"); setPage(1); }}>Live mode</button>
          <button className={`pill${mode === "test" ? " on" : ""}`} aria-pressed={mode === "test"} onClick={() => { setMode("test"); setPage(1); }}>Test mode</button>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <div className="g4">
        <div className="card tile"><span className="k">Processed, 24h</span><span className="v">{s?.processed_24h ?? 0}</span><span className="s">Last received {ago(s?.last_received ?? null)}</span></div>
        <div className="card tile"><span className="k">Lines created</span><span className="v">{s?.lines_24h ?? 0}</span><span className="s">Last 24 hours</span></div>
        <div className="card tile"><span className="k">Replays ignored</span><span className="v">{s?.replays_24h ?? 0}</span><span className="s">Last 24 hours</span></div>
        <div className="card tile"><span className="k">Failed</span><span className="v">{s?.failed ?? 0}</span><span className="s">{s?.failed ? `Retries left: ${s.retries_left ?? 0}` : "None"}</span></div>
      </div>
      {first ? (
        <Banner tone="bad" icon="alert" action={<button className="btn sm" disabled={busy === first.id} onClick={() => retry(first.id)}>Retry now</button>}>
          <b>{failed.length} event{failed.length === 1 ? "" : "s"} failed.</b> {first.event_type}{first.shop_name ? ` for ${first.shop_name}` : ""}: {first.last_error ?? "the handler failed"}. It retries on its own, or you can retry it now.
        </Banner>
      ) : null}
      <section className="card">
        <div className="filters">
          <div className="ig"><Icon name="search" />
            <input className="input" type="search" placeholder="Search event id or shop" aria-label="Search events" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          {([["", "All"], ["line_created", "Line created"], ["ignored", "Ignored"], ["failed", "Failed"]] as const).map(([k, label]) => (
            <button key={k} className={`pill${result === k ? " on" : ""}`} aria-pressed={result === k} onClick={() => { setResult(k); setPage(1); }}>
              {label}{k === "failed" ? <Count n={s?.failed ?? 0} tone="bad" /> : null}
            </button>
          ))}
        </div>
        {!data ? <div className="pad col">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
          : data.rows.length === 0 ? <div className="pad"><Empty icon="zap" title={`No ${mode} events yet`}>Events show here once Stripe sends the platform&apos;s billing events.</Empty></div>
            : (
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Received</th><th>Event</th><th>Stripe event id</th><th>Shop</th><th>Result</th><th>Detail</th><th /></tr></thead>
                  <tbody>{data.rows.map((e) => {
                    const r = RESULT[e.result] ?? { label: e.result, tone: "mut" as Tone };
                    return (
                      <tr key={e.id}>
                        <td>{when(e.received_at)}</td>
                        <td className="mono">{e.event_type}</td>
                        <td className="mono" title={e.stripe_event_id}>{shortId(e.stripe_event_id)}</td>
                        <td>{e.shop_name ?? ""}</td>
                        <td><Chip tone={r.tone}>{r.label}</Chip></td>
                        <td className="wrap" style={{ maxWidth: 300 }}>{e.result === "failed" ? `${e.last_error ?? ""}, try ${e.attempts} of 4` : e.detail ?? ""}</td>
                        <td className="tr">{e.result === "failed" ? <button className="btn sm" disabled={busy === e.id} onClick={() => retry(e.id)}>Retry</button> : null}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
        <div className="tfoot">
          <span>Showing {data?.rows.length ?? 0} of {data?.total ?? 0}</span>
          <span>Handled: invoice paid, payment failed, charge refunded, dispute created, subscription updated or deleted</span>
        </div>
      </section>
      {toast.node}
    </>
  );
}
