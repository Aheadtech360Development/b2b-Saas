"use client";

/**
 * CopilotPanel — the owner's "what should I do today?" and a place to ask.
 *
 * The list on the left is computed on the server from the brand's own data, so
 * it shows even when the AI is switched off; every number on it matches the
 * screen its link opens. The chat on the right asks the copilot, which answers
 * only from lookups against the same data.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

type Severity = "urgent" | "attention" | "info";

interface BriefingItem {
  key: string;
  severity: Severity;
  count: number;
  amount?: number;
  title: string;
  detail: string;
  href: string;
}

interface Briefing {
  generated_at: string;
  ai_enabled: boolean;
  pulse: { orders_today: number; revenue_today: number; orders_7d: number; revenue_7d: number };
  items: BriefingItem[];
}

interface Turn { role: "user" | "assistant"; content: string }

const TONE: Record<Severity, { dot: string; label: string }> = {
  urgent: { dot: "#DC2626", label: "Urgent" },
  attention: { dot: "#D97706", label: "Needs attention" },
  info: { dot: "#6B7280", label: "Worth a look" },
};

const SUGGESTIONS = [
  "What should I do today?",
  "How were sales this week?",
  "Which print jobs are waiting?",
  "Who are my top customers this month?",
];

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CopilotPanel() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [briefError, setBriefError] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get<Briefing>("/api/v1/admin/copilot/briefing")
      .then(setBrief)
      .catch(() => setBriefError(true));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, asking]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setAsking(true);
    setChatError(null);
    try {
      const res = await apiClient.post<{ reply: string }>("/api/v1/admin/copilot/chat", { messages: next });
      setTurns([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      // Take the unanswered question back off so a retry doesn't send it twice.
      setTurns(turns);
      setDraft(q);
      setChatError((e as { message?: string })?.message || "The copilot couldn't answer. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={S.wrap}>
      {/* ── Today ─────────────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.head}>
          <div>
            <div style={S.kicker}>AI Copilot</div>
            <div style={S.title}>Today&apos;s priorities</div>
          </div>
          {brief && (
            <div style={S.pulse}>
              <span><strong>{brief.pulse.orders_today}</strong> orders today · {money(brief.pulse.revenue_today)}</span>
              <span style={{ color: "#8A8A8A" }}>7 days: {brief.pulse.orders_7d} · {money(brief.pulse.revenue_7d)}</span>
            </div>
          )}
        </div>

        {!brief && !briefError && (
          <div>{[88, 72, 80].map((w, i) => <div key={i} className="at-skel" style={{ height: "46px", width: `${w}%`, marginBottom: "10px", borderRadius: "8px" }} />)}</div>
        )}
        {briefError && <div style={S.muted}>Couldn&apos;t load today&apos;s priorities. Reload to try again.</div>}
        {brief && brief.items.length === 0 && (
          <div style={S.allClear}>
            <strong>Nothing needs you right now.</strong>
            <span style={{ color: "#6B6B6B" }}> No jobs waiting for review, no late or unpaid orders, and stock is fine.</span>
          </div>
        )}
        {brief && brief.items.length > 0 && (
          <div style={{ display: "grid", gap: "8px" }}>
            {brief.items.map((it) => (
              <Link key={it.key} href={it.href} style={S.item}>
                <span title={TONE[it.severity].label} style={{ ...S.dot, background: TONE[it.severity].dot }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={S.itemTitle}>{it.title}</span>
                  <span style={S.itemDetail}>{it.detail}</span>
                </span>
                <span style={S.go}>Open →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Ask ───────────────────────────────────────────────────────────── */}
      <div style={{ ...S.card, display: "flex", flexDirection: "column", minHeight: "340px" }}>
        <div style={S.kicker}>Ask your store</div>
        <div style={{ ...S.title, marginBottom: "10px" }}>Ask anything about orders, sales or print jobs</div>

        {brief && !brief.ai_enabled ? (
          <div style={S.muted}>
            The AI chat isn&apos;t switched on for this platform yet. Today&apos;s priorities still work without it.
          </div>
        ) : (
          <>
            <div ref={scroller} style={S.log}>
              {turns.length === 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} disabled={asking} style={S.chip}>{s}</button>
                  ))}
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} style={t.role === "user" ? S.userBubble : S.botBubble}>{t.content}</div>
              ))}
              {asking && (
                <div style={{ ...S.botBubble, color: "#6B6B6B" }}>
                  <style>{`@keyframes cpDot{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
                  Looking it up
                  {[0, 1, 2].map((d) => <span key={d} style={{ animation: `cpDot 1.2s ${d * 0.2}s infinite` }}>.</span>)}
                </div>
              )}
            </div>

            {chatError && <div style={S.error}>{chatError}</div>}

            <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Which unpaid orders are over $500?"
                maxLength={4000}
                disabled={asking}
                style={S.input}
              />
              <button type="submit" disabled={asking || !draft.trim()} style={{ ...S.send, opacity: asking || !draft.trim() ? 0.45 : 1 }}>
                Ask
              </button>
            </form>
            <div style={S.foot}>Answers come from your store&apos;s data. The copilot can look things up but can&apos;t change anything.</div>
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px", marginBottom: "24px" },
  card: { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px", padding: "18px 20px", minWidth: 0 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "14px" },
  kicker: { fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8A8A8A" },
  title: { fontSize: "16px", fontWeight: 700, color: "#1A1A1A", marginTop: "2px" },
  pulse: { display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "12px", color: "#1A1A1A", gap: "2px" },
  item: { display: "flex", alignItems: "center", gap: "12px", padding: "11px 12px", border: "1px solid #EDEDEA", borderRadius: "10px", textDecoration: "none", color: "inherit", background: "#FCFCFB" },
  dot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0 },
  itemTitle: { display: "block", fontSize: "13px", fontWeight: 700, color: "#1A1A1A" },
  itemDetail: { display: "block", fontSize: "12px", color: "#6B6B6B", marginTop: "2px", lineHeight: 1.45 },
  go: { fontSize: "12px", fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" },
  allClear: { background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "14px", fontSize: "13px", color: "#166534" },
  muted: { fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 },
  log: { flex: 1, overflowY: "auto", maxHeight: "300px", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "2px" },
  chip: { padding: "7px 12px", border: "1px solid #E3E3E3", background: "#F6F6F7", borderRadius: "20px", fontSize: "12px", fontWeight: 600, color: "#1A1A1A", cursor: "pointer" },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", background: "#1A1A1A", color: "#fff", padding: "9px 12px", borderRadius: "12px 12px 2px 12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  botBubble: { alignSelf: "flex-start", maxWidth: "92%", background: "#F4F4F2", color: "#1A1A1A", padding: "9px 12px", borderRadius: "12px 12px 12px 2px", fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap" },
  error: { marginTop: "8px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "8px 10px", fontSize: "12px" },
  input: { flex: 1, minWidth: 0, padding: "10px 12px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none" },
  send: { padding: "10px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  foot: { fontSize: "11px", color: "#9CA3AF", marginTop: "8px" },
};
