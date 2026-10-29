"use client";

/**
 * The buyer's rewards (backend services/loyalty, Retail launch package 5):
 * points to spend, rewards to turn them into (a single use code that only
 * this buyer can use), the history of every change, and the link to share
 * with a friend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { day } from "@/lib/customerWords";
import { Banner, Loading, PageHead } from "@/components/portal/ui";

interface Rewards {
  enabled: boolean;
  program_name?: string;
  points_name?: string;
  points_per_dollar?: number;
  expiry_months?: number;
  balance?: number;
  lifetime_earned?: number;
  tiers?: { points: number; reward: number }[];
  history?: { id: string; kind_words: string; points: number; balance_after: number; reason: string | null;
    expires_at: string | null; created_at: string | null }[];
  codes?: { code: string; value: number; expires_at: string | null }[];
  referral?: { code: string; link: string; you_get: number; friend_gets: number; rewarded: number; pending: number } | null;
}

const newRequest = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export default function RewardsPage() {
  const [r, setR] = useState<Rewards | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ code: string; value: number } | null>(null);
  const [copied, setCopied] = useState("");
  const request = useRef<Record<number, string>>({});

  const load = useCallback(() => {
    apiClient.get<Rewards>("/api/v1/account/rewards").then((x) => { setR(x); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function redeem(points: number) {
    setBusy(points); setError(null);
    // One per reward pressed: a double click makes one code.
    request.current[points] ??= newRequest();
    try {
      const out = await apiClient.post<{ code: string; value: number }>("/api/v1/account/rewards/redeem",
        { points, request_id: request.current[points] });
      setMade(out);
      delete request.current[points];
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That reward could not be made. Try again.");
    }
    setBusy(null);
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); } catch { setCopied(""); }
  }

  if (failed) return <><PageHead title="Rewards" /><Banner tone="bad" onRetry={load}>Your rewards could not be loaded.</Banner></>;
  if (!r) return <><PageHead title="Rewards" /><Loading /></>;
  if (!r.enabled) {
    return (
      <>
        <PageHead title="Rewards" />
        <Banner>This shop doesn&apos;t have a rewards program right now.</Banner>
      </>
    );
  }
  const name = r.points_name ?? "points";

  return (
    <>
      <PageHead eyebrow={r.program_name} title="Rewards"
        sub={`${r.points_per_dollar} ${name} for every dollar you spend on goods.${r.expiry_months ? ` They last ${r.expiry_months} months.` : ""}`} />
      <div className="cp-cols" data-rewards>
        <div className="cp-col-main cp-stack-sm" style={{ gap: 16 }}>
          {error && <Banner tone="bad">{error}</Banner>}
          {made && (
            <Banner tone="ok">
              Your code <strong data-reward-code>{made.code}</strong> takes ${made.value} off your next order. Enter it at checkout.
            </Banner>
          )}
          <section className="cp-card cp-pad">
            <div className="cp-muted">You have</div>
            <div style={{ fontSize: 34, fontWeight: 700 }} data-balance>{(r.balance ?? 0).toLocaleString()} {name}</div>
            <div className="cp-note">{(r.lifetime_earned ?? 0).toLocaleString()} earned in all</div>
          </section>
          <section className="cp-card cp-pad cp-stack-sm">
            <h2 className="cp-h3">Rewards</h2>
            {(r.tiers ?? []).map((t) => {
              const short = t.points - (r.balance ?? 0);
              return (
                <div key={t.points} data-tier={t.points} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--cp-line, #E8E6E1)" }}>
                  <span><strong>${t.reward} off</strong> <span className="cp-muted">for {t.points.toLocaleString()} {name}</span></span>
                  {short > 0
                    ? <span className="cp-muted">{short.toLocaleString()} more</span>
                    : <button type="button" className="cp-btn cp-btn-p" disabled={busy !== null} onClick={() => redeem(t.points)}>
                        {busy === t.points ? "Making…" : "Get code"}
                      </button>}
                </div>
              );
            })}
          </section>
          {(r.codes ?? []).length > 0 && (
            <section className="cp-card cp-pad cp-stack-sm" data-codes>
              <h2 className="cp-h3">Your codes</h2>
              {r.codes!.map((c) => (
                <div key={c.code} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span><strong style={{ letterSpacing: ".04em" }}>{c.code}</strong> <span className="cp-muted">${c.value} off{c.expires_at ? `, until ${day(c.expires_at)}` : ""}</span></span>
                  <button type="button" className="cp-btn" onClick={() => copy(c.code)}>{copied === c.code ? "Copied" : "Copy"}</button>
                </div>
              ))}
            </section>
          )}
          <section className="cp-card cp-pad cp-stack-sm">
            <h2 className="cp-h3">History</h2>
            {(r.history ?? []).length === 0 ? <p className="cp-note" style={{ margin: 0 }}>Nothing yet. Your first paid order earns {name}.</p> : (
              <div className="cp-tbl-wrap">
                <table className="cp-tbl">
                  <thead><tr><th>When</th><th>What</th><th className="cp-num">Points</th><th className="cp-num">Balance</th></tr></thead>
                  <tbody>
                    {r.history!.map((h) => (
                      <tr key={h.id}>
                        <td>{h.created_at ? day(h.created_at) : ""}</td>
                        <td>{h.kind_words}{h.reason ? <span className="cp-muted"> · {h.reason}</span> : null}</td>
                        <td className="cp-num" style={{ color: h.points < 0 ? "var(--cp-bad, #B42318)" : undefined }}>{h.points > 0 ? `+${h.points}` : h.points}</td>
                        <td className="cp-num">{h.balance_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        {r.referral && (
          <aside className="cp-col-side">
            <section className="cp-card cp-pad cp-stack-sm" data-referral>
              <h2 className="cp-h3">Give {r.referral.friend_gets} {name}, get {r.referral.you_get}</h2>
              <p className="cp-note" style={{ margin: 0 }}>
                Share your link. When a friend makes their first order, you both earn.
              </p>
              <input className="cp-input" readOnly value={r.referral.link} aria-label="Your referral link" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="cp-btn cp-btn-p" onClick={() => copy(r.referral!.link)}>
                {copied === r.referral.link ? "Copied" : "Copy link"}
              </button>
              <p className="cp-note" style={{ margin: 0 }}>{r.referral.rewarded} friends rewarded · {r.referral.pending} waiting for a first order</p>
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
