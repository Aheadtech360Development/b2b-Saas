"use client";

/**
 * CopilotChat — asking the store a question, and confirming what it prepares.
 *
 * The copilot cannot change anything itself. When the admin asks for a change,
 * the reply comes back with a prepared action, and it is the Confirm button here
 * — a separate request naming the action and its target — that actually runs it.
 * So the button is the authority, not the sentence above it.
 *
 * The screen the admin has open travels with each question (`page`), so "these
 * orders" can be understood. Links an answer gives to admin screens are also
 * shown as buttons under it.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import { useCopilotStore, type CopilotTurn as Turn, type PreparedAction } from "@/stores/copilot.store";

export const COPILOT_SUGGESTIONS = [
  "What should I do today?",
  "How were sales this week?",
  "Which print jobs are waiting?",
  "How many products do I have?",
];

/** Up to three admin screens an answer links to, as buttons. Only links the
 *  answer itself gave (the copilot is told to use tool links only). */
function screensIn(text: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const m of text.matchAll(/\[([^\]]{1,60})\]\((\/admin\/[^)\s]*)\)/g)) {
    if (!out.some((o) => o.href === m[2])) out.push({ label: m[1]!, href: m[2]! });
    if (out.length === 3) break;
  }
  return out;
}

export function CopilotChat({ page, chips = COPILOT_SUGGESTIONS.slice(0, 2) }: {
  /** Words for the screen that is open, sent with every question. */
  page?: () => string;
  /** The questions offered under the conversation. */
  chips?: string[];
}) {
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
        "/api/v1/admin/copilot/chat", { messages: next, page: page?.() || undefined },
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

  // An empty thread offers more to start from, the screen's own question first.
  const offered = turns.length === 0 ? Array.from(new Set([...chips, ...COPILOT_SUGGESTIONS])).slice(0, 4) : chips;

  return (
    <>
      <div ref={scroller} className="pc-cp-log" data-copilot-log>
        {turns.length === 0 && (
          <p className="pc-cp-hello">Ask about orders, sales, customers or print jobs. Answers come from your store&apos;s own data.</p>
        )}
        {turns.map((t, i) => {
          const links = t.role === "assistant" ? screensIn(t.content) : [];
          return t.role === "user" ? (
            <div key={i} className="pc-cp-you">{t.content}</div>
          ) : (
            <div key={i} className="pc-cp-bot">
              <ChatMarkdown text={t.content} />
              {links.length > 0 && (
                <div className="pc-cp-links">
                  {links.map((l) => <Link key={l.href} href={l.href} className="pc-btn">{l.label}</Link>)}
                </div>
              )}
            </div>
          );
        })}
        {asking && (
          <div className="pc-cp-bot" style={{ color: "var(--pc-muted)" }}>
            <style>{`@keyframes cpDot{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
            Looking it up
            {[0, 1, 2].map((d) => <span key={d} style={{ animation: `cpDot 1.2s ${d * 0.2}s infinite` }}>.</span>)}
          </div>
        )}

        {action && (
          <div className="pc-cp-confirm" data-copilot-confirm>
            <div className="pc-small-head" style={{ color: "#92400E" }}>Confirm this change</div>
            <div style={{ fontSize: "14px", lineHeight: 1.5 }}>{action.summary}</div>
            {action.note && <div style={{ fontSize: "12.5px", color: "#78350F" }}>{action.note}</div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
              <button type="button" className="pc-btn" data-kind="primary" onClick={confirm} disabled={running}>{running ? "Working…" : "Confirm"}</button>
              <button type="button" className="pc-btn" onClick={() => setAction(null)} disabled={running}>Cancel</button>
            </div>
          </div>
        )}
        {turns.length > 0 && (
          <button type="button" className="pc-link pc-cp-clear" onClick={() => { clearThread(); setError(null); }}>Clear chat</button>
        )}
      </div>

      <div className="pc-cp-foot">
        {error && <div className="pc-note" data-tone="red" role="alert" style={{ marginBottom: "10px" }}>{error}</div>}
        <div className="pc-cp-chips">
          {offered.map((s) => (
            <button key={s} type="button" className="pc-cp-chip" onClick={() => ask(s)} disabled={asking}>{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="pc-cp-ask">
          <input className="pc-input" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Ask the copilot"
            placeholder="Ask about orders, sales or print jobs" maxLength={4000} disabled={asking} />
          <button type="submit" className="pc-btn" data-kind="primary" disabled={asking || !draft.trim()}>Ask</button>
        </form>
        <div className="pc-cp-note">Changes are prepared for you. Nothing happens until you confirm.</div>
      </div>
    </>
  );
}
