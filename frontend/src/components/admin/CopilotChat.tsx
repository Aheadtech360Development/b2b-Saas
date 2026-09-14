"use client";

/**
 * CopilotChat — asking the store a question, and confirming what it prepares.
 *
 * The copilot cannot change anything itself. When the admin asks for a change,
 * the reply comes back with a prepared action, and it is the Confirm button here
 * — a separate request naming the action and its target — that actually runs it.
 * So the button is the authority, not the sentence above it.
 *
 * Used inline on the dashboard and inside the floating dock on every other admin
 * screen, so both behave identically.
 */
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import { useCopilotStore, type CopilotTurn as Turn, type PreparedAction } from "@/stores/copilot.store";

export const COPILOT_SUGGESTIONS = [
  "What should I do today?",
  "How were sales this week?",
  "Which print jobs are waiting?",
  "How many products do I have?",
];

export function CopilotChat({ compact = false }: { compact?: boolean }) {
  // The thread lives in the store, so opening an order from an answer and
  // coming back doesn't wipe the conversation.
  const turns = useCopilotStore((s) => s.turns);
  const setTurns = useCopilotStore((s) => s.setTurns);
  const action = useCopilotStore((s) => s.pending);
  const setAction = useCopilotStore((s) => s.setPending);
  const clearThread = useCopilotStore((s) => s.clear);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, asking, action]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setAsking(true);
    setError(null);
    setAction(null);
    try {
      const res = await apiClient.post<{ reply: string; action?: PreparedAction }>(
        "/api/v1/admin/copilot/chat", { messages: next },
      );
      setTurns([...next, { role: "assistant", content: res.reply }]);
      if (res.action) setAction(res.action);
    } catch (e) {
      // Take the unanswered question back off so a retry doesn't send it twice.
      setTurns(turns);
      setDraft(q);
      setError((e as { message?: string })?.message || "The copilot couldn't answer. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  async function confirm() {
    if (!action || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await apiClient.post<{ done: string }>("/api/v1/admin/copilot/act", {
        action: action.action, params: action.params,
      });
      setAction(null);
      setTurns([...turns, { role: "assistant", content: `✓ ${res.done}` }]);
    } catch (e) {
      setError((e as { message?: string })?.message || "That didn't go through.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      {turns.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
          <button onClick={() => { clearThread(); setError(null); }} style={S.clear}>Clear chat</button>
        </div>
      )}

      <div ref={scroller} style={{ ...S.log, maxHeight: compact ? "none" : "300px" }}>
        {turns.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {COPILOT_SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} disabled={asking} style={S.chip}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={t.role === "user" ? S.user : S.bot}>
            {t.role === "user" ? t.content : <ChatMarkdown text={t.content} />}
          </div>
        ))}
        {asking && (
          <div style={{ ...S.bot, color: "#6B6B6B" }}>
            <style>{`@keyframes cpDot{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
            Looking it up
            {[0, 1, 2].map((d) => <span key={d} style={{ animation: `cpDot 1.2s ${d * 0.2}s infinite` }}>.</span>)}
          </div>
        )}

        {action && (
          <div style={S.confirmCard}>
            <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#92400E" }}>
              Confirm this change
            </div>
            <div style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.5 }}>{action.summary}</div>
            {action.note && <div style={{ fontSize: "12px", color: "#78350F" }}>{action.note}</div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
              <button onClick={confirm} disabled={running} style={{ ...S.send, opacity: running ? 0.5 : 1 }}>
                {running ? "Working…" : "Confirm"}
              </button>
              <button onClick={() => setAction(null)} disabled={running} style={S.cancel}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Which orders are pending?"
          maxLength={4000}
          disabled={asking}
          style={S.input}
        />
        <button type="submit" disabled={asking || !draft.trim()} style={{ ...S.send, opacity: asking || !draft.trim() ? 0.45 : 1 }}>
          Ask
        </button>
      </form>
      <div style={S.foot}>Answers come from your store&apos;s data. Changes only happen when you confirm them.</div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  log: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "2px" },
  chip: { padding: "7px 12px", border: "1px solid #E3E3E3", background: "#F6F6F7", borderRadius: "20px", fontSize: "12px", fontWeight: 600, color: "#1A1A1A", cursor: "pointer" },
  user: { alignSelf: "flex-end", maxWidth: "85%", background: "#1A1A1A", color: "#fff", padding: "9px 12px", borderRadius: "12px 12px 2px 12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "92%", background: "#F4F4F2", color: "#1A1A1A", padding: "9px 12px", borderRadius: "12px 12px 12px 2px", fontSize: "13px", lineHeight: 1.55 },
  confirmCard: { alignSelf: "stretch", display: "grid", gap: "7px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 14px" },
  error: { marginTop: "8px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "8px 10px", fontSize: "12px" },
  input: { flex: 1, minWidth: 0, padding: "10px 12px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none" },
  send: { padding: "10px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  clear: { border: "none", background: "none", color: "#8A8A8A", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: "2px 4px" },
  cancel: { padding: "10px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  foot: { fontSize: "11px", color: "#9CA3AF", marginTop: "8px" },
};
