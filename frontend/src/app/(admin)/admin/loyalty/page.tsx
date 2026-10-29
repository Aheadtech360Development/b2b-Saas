"use client";

/**
 * Loyalty (backend api/v1/loyalty.py, Retail launch package 5): the shop's
 * rules (points per dollar, rewards, expiry, referral rewards), every buyer's
 * points with their history, adjustments with a reason, and referrals with
 * the self-referral ones flagged.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Search, Settings2, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { askText } from "@/lib/dialog";
import { MarketingFrame } from "@/components/admin/marketing/MarketingFrame";

interface Conf {
  enabled: boolean; program_name: string; points_name: string; points_per_dollar: number;
  tiers: { points: number; reward: number }[]; expiry_months: number;
  referral_enabled: boolean; referrer_points: number; friend_points: number;
}
interface Account { id: string; email: string; name: string; balance: number; lifetime_earned: number; referral_code: string }
interface Row { id: string; kind_words: string; points: number; balance_after: number; reason: string | null; actor_name: string | null; created_at: string | null }
interface Referral { id: string; status: string; flagged: boolean; block_reason: string | null; referrer_email: string; friend_email: string | null; created_at: string | null }

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const newRequest = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export default function LoyaltyPage() {
  return <Suspense fallback={null}><Loyalty /></Suspense>;
}

function Loyalty() {
  const [conf, setConf] = useState<Conf | null>(null);
  const [list, setList] = useState<{ items: Account[]; total: number; outstanding: number; earned: number } | null>(null);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [qText, setQText] = useState("");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<null | "settings" | Account>(null);
  const [flash, setFlash] = useState("");
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    const params = new URLSearchParams(q ? { q } : {});
    const [l, r] = await Promise.all([
      apiClient.get<{ items: Account[]; total: number; outstanding: number; earned: number }>(`/api/v1/admin/loyalty/accounts?${params}`).catch(() => null),
      apiClient.get<{ items: Referral[] }>("/api/v1/admin/loyalty/referrals").catch(() => ({ items: [] })),
    ]);
    if (mine !== asked.current) return;
    setList(l); setRefs(r.items);
  }, [q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiClient.get<Conf>("/api/v1/admin/loyalty/settings").then(setConf).catch(() => setConf(null)); }, []);
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qText.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qText]);

  const flagged = refs.filter((r) => r.flagged).length;
  return (
    <MarketingFrame active="loyalty" title="Loyalty" sub="Points for every paid order, rewards to spend them on, and referrals."
      actions={<button type="button" className="pc-btn" onClick={() => setPanel("settings")}><Settings2 size={17} strokeWidth={2.2} /> Settings</button>}>
      {flash && (
        <div className="pc-flash" role="status"><span>{flash}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash("")} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}
      {conf && !conf.enabled && (
        <div className="pc-note" data-tone="blue" style={{ marginBottom: 14 }}>
          Rewards are off: no points are earned.{" "}
          <button type="button" className="pc-link" onClick={() => setPanel("settings")}>Turn them on</button>
        </div>
      )}
      {list && (
        <div className="pc-stats2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: 14 }} data-loyalty-report>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{list.total}</div><div className="pc-stat4-l">Members</div></div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{list.outstanding.toLocaleString()}</div><div className="pc-stat4-l">{conf?.points_name ?? "Points"} unspent</div></div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{list.earned.toLocaleString()}</div><div className="pc-stat4-l">Earned in all</div></div>
          <div className="pc-card pc-stat4"><div className="pc-stat4-v">{flagged}</div><div className="pc-stat4-l">Referrals flagged</div>
            <div className="pc-stat4-s">Self referrals, blocked</div></div>
        </div>
      )}
      <div className="pc-filters">
        <label className="pc-field" style={{ flex: 1 }}>
          <Search size={17} strokeWidth={2} />
          <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search by email, name or referral code" aria-label="Search members" />
        </label>
      </div>
      <div className="pc-list" data-panel={panel ? "" : undefined}>
        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <div className="pc-card pc-scroll-x" aria-busy={!list} data-members={list?.items.length}>
            <table className="pc-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Member</th><th>Balance</th><th>Earned</th><th>Referral code</th></tr></thead>
              <tbody>
                {list && list.items.length === 0 && <tr><td colSpan={4} className="pc-empty">{q ? "No member matches." : "No members yet. Buyers join with their first paid order."}</td></tr>}
                {list?.items.map((a) => (
                  <tr key={a.id} data-href tabIndex={0} data-member={a.email} onClick={() => setPanel(a)} onKeyDown={(e) => { if (e.key === "Enter") setPanel(a); }}>
                    <td>{a.name}<div className="pc-sub-line" style={{ fontSize: 12.5 }}>{a.email}</div></td>
                    <td>{a.balance.toLocaleString()}</td>
                    <td>{a.lifetime_earned.toLocaleString()}</td>
                    <td style={{ letterSpacing: ".04em" }}>{a.referral_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pc-card pc-scroll-x" data-referrals={refs.length}>
            <div className="pc-card-head" style={{ padding: "14px 16px" }}><h2 className="pc-h2" style={{ margin: 0 }}>Referrals</h2></div>
            <table className="pc-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Referred by</th><th>Friend</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {refs.length === 0 && <tr><td colSpan={4} className="pc-empty">No referrals yet.</td></tr>}
                {refs.map((r) => (
                  <tr key={r.id} data-referral={r.status}>
                    <td>{r.referrer_email}</td>
                    <td>{r.friend_email}</td>
                    <td><span className="pc-pill" data-tone={r.flagged ? "red" : r.status === "rewarded" ? "green" : "amber"} style={{ textTransform: "none" }}>
                      {r.flagged ? "Flagged" : r.status === "rewarded" ? "Rewarded" : "Waiting for a first order"}</span>
                      {r.block_reason && <div className="pc-sub-line" style={{ fontSize: 12.5 }}>{r.block_reason}</div>}
                    </td>
                    <td>{day(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {panel === "settings" && conf && (
          <SettingsPanel conf={conf} onClose={() => setPanel(null)} onSaved={(c) => { setConf(c); setFlash(c.enabled ? "Rewards are on." : "Rewards are off."); }} />
        )}
        {panel && panel !== "settings" && (
          <MemberPanel account={panel} pointsName={conf?.points_name ?? "points"} onClose={() => setPanel(null)}
            onChanged={(msg) => { setFlash(msg); load(); }} />
        )}
      </div>
    </MarketingFrame>
  );
}

function MemberPanel({ account, pointsName, onClose, onChanged }: { account: Account; pointsName: string; onClose: () => void; onChanged: (m: string) => void }) {
  const [d, setD] = useState<{ balance: number; history: Row[]; ledger_matches: boolean } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    apiClient.get<{ balance: number; history: Row[]; ledger_matches: boolean }>(`/api/v1/admin/loyalty/accounts/${account.id}`)
      .then(setD).catch(() => setError("This member could not be loaded."));
  }, [account.id]);
  useEffect(() => { setD(null); load(); }, [load]);

  async function adjust() {
    const raw = await askText(`How many ${pointsName} to add? Use a minus to take off, for example -50.`, "", { title: "Adjust points", ok: "Next", placeholder: "50" });
    if (raw == null) return;
    const points = Math.trunc(Number(raw));
    if (!Number.isFinite(points) || points === 0) { setError("Enter whole points, like 50 or -50."); return; }
    const reason = await askText("Why? It is kept in the member's history.", "", { title: "Reason", ok: points > 0 ? `Add ${points}` : `Take off ${-points}`, placeholder: "Goodwill, a mistake…" });
    if (!reason?.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/loyalty/accounts/${account.id}/adjust`, { points, reason: reason.trim(), request_id: newRequest() });
      load(); onChanged(points > 0 ? `Added ${points} ${pointsName}.` : `Took off ${-points} ${pointsName}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
  }

  return (
    <aside className="pc-panel" aria-label={`Member ${account.email}`} data-member-panel>
      <div className="pc-panel-head">
        <div style={{ minWidth: 0 }}><h2 className="pc-h2">{account.name}</h2><div className="pc-sub-line">{account.email}</div></div>
        <button type="button" className="pc-x" aria-label="Close the panel" onClick={onClose}><X size={19} strokeWidth={2.2} /></button>
      </div>
      <div className="pc-panel-body">
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        {!d ? <div className="at-skel" style={{ height: 100, borderRadius: 8 }} /> : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700 }} data-balance>{d.balance.toLocaleString()} {pointsName}</div>
            {!d.ledger_matches && <div className="pc-note" data-tone="red">This member&apos;s history does not add up to their balance. Tell support.</div>}
            <button type="button" className="pc-btn" data-block="" onClick={adjust}>Adjust points</button>
            <div>
              <div className="pc-label" style={{ marginBottom: 8 }}>History</div>
              {d.history.map((h) => (
                <div key={h.id} style={{ borderBottom: "1px solid var(--pc-line, #E3E8EF)", padding: "6px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong style={{ fontSize: 14 }}>{h.kind_words}</strong>
                    <span style={{ fontWeight: 600 }}>{h.points > 0 ? `+${h.points}` : h.points}</span>
                  </div>
                  <div className="pc-sub-line" style={{ fontSize: 12.5 }}>{day(h.created_at)} · balance {h.balance_after}{h.actor_name ? ` · ${h.actor_name}` : ""}</div>
                  {h.reason && <div className="pc-sub-line" style={{ fontSize: 12.5 }}>{h.reason}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function SettingsPanel({ conf, onClose, onSaved }: { conf: Conf; onClose: () => void; onSaved: (c: Conf) => void }) {
  const [c, setC] = useState<Conf>(conf);
  const [tiers, setTiers] = useState(conf.tiers.map((t) => `${t.points}=${t.reward}`).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Conf, v: unknown) => setC({ ...c, [k]: v } as Conf);

  async function save() {
    const parsed = tiers.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const [p, r] = s.split("=").map((x) => x.trim().replace(/^\$/, ""));
      return { points: Number(p), reward: Number(r) };
    });
    if (!parsed.length || parsed.some((t) => !Number.isInteger(t.points) || t.points < 1 || !(t.reward > 0))) {
      setError("Write each reward as points=dollars, for example 100=5, 250=15."); return;
    }
    setBusy(true); setError("");
    try {
      const saved = await apiClient.put<Conf>("/api/v1/admin/loyalty/settings", { ...c, tiers: parsed });
      onSaved(saved); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "The settings could not be saved."); }
    setBusy(false);
  }

  return (
    <aside className="pc-panel" aria-label="Loyalty settings" data-loyalty-settings>
      <div className="pc-panel-head">
        <div><h2 className="pc-h2">Loyalty settings</h2><div className="pc-sub-line">Buyers with an account earn on every paid order.</div></div>
        <button type="button" className="pc-x" aria-label="Close the panel" onClick={onClose}><X size={19} strokeWidth={2.2} /></button>
      </div>
      <form className="pc-panel-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
        <div className="pc-switch-row">
          <span>Rewards on</span>
          <button type="button" className="pc-switch" role="switch" aria-label="Rewards on" aria-checked={c.enabled} data-on={c.enabled ? "" : undefined} onClick={() => set("enabled", !c.enabled)} />
        </div>
        <div className="pc-form2">
          <div><label className="pc-label" htmlFor="lo-name">Program name</label>
            <input id="lo-name" className="pc-input" value={c.program_name} maxLength={40} onChange={(e) => set("program_name", e.target.value)} /></div>
          <div><label className="pc-label" htmlFor="lo-points">Points are called</label>
            <input id="lo-points" className="pc-input" value={c.points_name} maxLength={20} onChange={(e) => set("points_name", e.target.value)} /></div>
        </div>
        <div><label className="pc-label" htmlFor="lo-rate">Points per dollar</label>
          <input id="lo-rate" className="pc-input" type="number" min={1} max={100} value={c.points_per_dollar} onChange={(e) => set("points_per_dollar", Math.trunc(Number(e.target.value) || 0))} />
          <div className="pc-sub-line" style={{ fontSize: 12.5, marginTop: 6 }}>On what goods cost: not shipping, tax or gift cards bought.</div></div>
        <div><label className="pc-label" htmlFor="lo-tiers">Rewards (points=dollars off)</label>
          <input id="lo-tiers" className="pc-input" value={tiers} onChange={(e) => setTiers(e.target.value)} placeholder="100=5, 250=15" /></div>
        <div><label className="pc-label" htmlFor="lo-exp">Points expire after (months, 0 for never)</label>
          <input id="lo-exp" className="pc-input" type="number" min={0} max={60} value={c.expiry_months} onChange={(e) => set("expiry_months", Math.trunc(Number(e.target.value) || 0))} /></div>
        <div className="pc-switch-row">
          <span>Referral rewards<div className="pc-sub-line" style={{ fontSize: 12.5, fontWeight: 400 }}>Both earn after the friend&apos;s first paid order.</div></span>
          <button type="button" className="pc-switch" role="switch" aria-label="Referral rewards" aria-checked={c.referral_enabled} data-on={c.referral_enabled ? "" : undefined} onClick={() => set("referral_enabled", !c.referral_enabled)} />
        </div>
        {c.referral_enabled && (
          <div className="pc-form2">
            <div><label className="pc-label" htmlFor="lo-ref1">The buyer who shares</label>
              <input id="lo-ref1" className="pc-input" type="number" min={0} value={c.referrer_points} onChange={(e) => set("referrer_points", Math.trunc(Number(e.target.value) || 0))} /></div>
            <div><label className="pc-label" htmlFor="lo-ref2">The friend</label>
              <input id="lo-ref2" className="pc-input" type="number" min={0} value={c.friend_points} onChange={(e) => set("friend_points", Math.trunc(Number(e.target.value) || 0))} /></div>
          </div>
        )}
        <button type="submit" className="pc-btn" data-kind="primary" data-block="" disabled={busy} style={{ height: 46 }}>{busy ? "Saving…" : "Save"}</button>
      </form>
    </aside>
  );
}
