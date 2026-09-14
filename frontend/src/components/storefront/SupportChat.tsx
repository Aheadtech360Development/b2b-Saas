"use client";

/**
 * SupportChat — "where is my order?" answered from the customer's real orders.
 *
 * A small button in the corner of My Account opens a chat that can look up only
 * this customer's own orders and print jobs. It reads; it cannot cancel, refund
 * or change anything, and it says so.
 */
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";

interface Turn { role: "user" | "assistant"; content: string }

const SUGGESTIONS = ["Where is my latest order?", "Is my artwork approved?", "How much for 50?"];

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, asking, open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setAsking(true);
    setError(null);
    try {
      const res = await apiClient.post<{ reply: string }>("/api/v1/copilot/support", { messages: next });
      setTurns([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      setTurns(turns);
      setDraft(q);
      if (err?.status === 503) setOff(true);
      setError(err?.message || "Couldn't get an answer. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Ask a question" style={S.fab}>
        <span aria-hidden style={{ fontSize: "16px" }}>💬</span> Ask a question
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="Order help" style={S.panel}>
      <div style={S.head}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>Ask us</div>
          <div style={{ fontSize: "11px", color: "#6B6B6B" }}>Your orders and your prices</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close" style={S.close}>✕</button>
      </div>

      <div ref={scroller} style={S.log}>
        {turns.length === 0 && (
          <>
            <div style={S.bot}>Hi! Ask me about your orders, your print jobs, or what something costs at your prices.</div>
            {!off && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} style={S.chip}>{s}</button>)}
              </div>
            )}
          </>
        )}
        {turns.map((t, i) => (
          <div key={i} style={t.role === "user" ? S.user : S.bot}>
            {t.role === "user" ? t.content : <ChatMarkdown text={t.content} />}
          </div>
        ))}
        {asking && <div style={{ ...S.bot, color: "#6B6B6B" }}>Checking your orders…</div>}
      </div>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} style={S.form}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={asking || off}
          placeholder={off ? "Help isn't available right now" : "e.g. How much for 50 hoodies?"}
          maxLength={4000} style={S.input} />
        <button type="submit" disabled={asking || off || !draft.trim()}
          style={{ ...S.send, opacity: asking || off || !draft.trim() ? 0.45 : 1 }}>Send</button>
      </form>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  fab: { position: "fixed", right: "20px", bottom: "20px", zIndex: 60, display: "flex", alignItems: "center", gap: "8px", padding: "11px 16px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "999px", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.18)" },
  panel: { position: "fixed", right: "16px", bottom: "16px", zIndex: 60, width: "min(380px, calc(100vw - 32px))", height: "min(520px, calc(100vh - 32px))", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #EDEDEA" },
  close: { border: "none", background: "none", fontSize: "15px", cursor: "pointer", color: "#6B6B6B" },
  log: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" },
  user: { alignSelf: "flex-end", maxWidth: "85%", background: "#1A1A1A", color: "#fff", padding: "8px 11px", borderRadius: "12px 12px 2px 12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "90%", background: "#F4F4F2", color: "#1A1A1A", padding: "8px 11px", borderRadius: "12px 12px 12px 2px", fontSize: "13px", lineHeight: 1.55 },
  chip: { padding: "6px 10px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" },
  error: { margin: "0 14px 6px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "7px 10px", fontSize: "12px" },
  form: { display: "flex", gap: "6px", padding: "10px 12px", borderTop: "1px solid #EDEDEA" },
  input: { flex: 1, minWidth: 0, padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none" },
  send: { padding: "9px 14px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
};
