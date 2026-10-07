"use client";

/**
 * StudioAssistant — a helper inside the gang sheet builder.
 *
 * The customer asks in English or Roman Urdu whether their designs fit, what a
 * bigger sheet would cost, what to do about a background. Every question goes
 * with the sheet as the builder sees it (see lib/studioContext): the fits and
 * prices are worked out here, with the builder's own nesting, and the model only
 * reads and explains them. It cannot change the sheet — it says which button to
 * press — so what is on the canvas is always what the customer put there.
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import type { StudioContext } from "@/lib/studioContext";

interface Turn { role: "user" | "assistant"; content: string }

// Fixed wording, in both languages, so the starting points never depend on a model.
const SUGGESTIONS = [
  "Will my designs fit on this sheet?",
  "Mere designs is sheet par aa jayenge?",
  "Do my designs have backgrounds?",
  "Konsi sheet sasti paray gi?",
];

const GREETING =
  "Hi! I can check whether your designs fit, suggest a better sheet size, and spot backgrounds or blurry files. " +
  "Assalam o alaikum — English ya Roman Urdu, jaise aap likhna chahein.";

export function StudioAssistant({ open, onClose, getContext }: {
  open: boolean;
  onClose: () => void;
  getContext: () => StudioContext | null;
}) {
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
      const res = await apiClient.post<{ reply: string }>("/api/v1/copilot/studio", {
        messages: next,
        context: getContext(),
      });
      setTurns([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      setTurns(turns);
      setDraft(q);
      // 503: no AI key on the platform. 403: this shop's plan does not include it.
      if (err?.status === 503 || err?.status === 403) setOff(true);
      setError(
        err?.status === 429
          ? "You've asked a lot today — please try again tomorrow, or use the builder's own tools."
          : err?.message || "Couldn't get an answer. Please try again.",
      );
    } finally {
      setAsking(false);
    }
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Sheet assistant" data-gs-assistant style={S.panel}>
      <div style={S.head}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={16} strokeWidth={2.2} aria-hidden />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>Sheet assistant</div>
            <div style={{ fontSize: "11px", color: "#6B6B6B" }}>Reads your sheet · English / Roman Urdu</div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close assistant" style={S.close}><X size={16} strokeWidth={2.3} /></button>
      </div>

      <div ref={scroller} style={S.log}>
        {turns.length === 0 && (
          <>
            <div style={S.bot}>{GREETING}</div>
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
        {asking && <div style={{ ...S.bot, color: "#6B6B6B" }}>Looking at your sheet…</div>}
      </div>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} style={S.form}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={asking || off}
          placeholder={off ? "The assistant isn't available right now" : "e.g. 12 designs 22x10 pe aa jayenge?"}
          maxLength={4000} style={S.input} />
        <button type="submit" disabled={asking || off || !draft.trim()}
          style={{ ...S.send, opacity: asking || off || !draft.trim() ? 0.45 : 1 }}>Send</button>
      </form>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: { position: "fixed", right: "16px", bottom: "16px", zIndex: 260, width: "min(380px, calc(100vw - 32px))", height: "min(540px, calc(100dvh - 96px))", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", overflow: "hidden", color: "#1A1A1A" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #EDEDEA" },
  close: { border: "none", background: "none", cursor: "pointer", color: "#6B6B6B", display: "inline-flex", padding: "2px" },
  log: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" },
  user: { alignSelf: "flex-end", maxWidth: "85%", background: "#1A1A1A", color: "#fff", padding: "8px 11px", borderRadius: "12px 12px 2px 12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "92%", background: "#F4F4F2", color: "#1A1A1A", padding: "8px 11px", borderRadius: "12px 12px 12px 2px", fontSize: "13px", lineHeight: 1.55 },
  chip: { padding: "6px 10px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", textAlign: "left" },
  error: { margin: "0 14px 6px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "7px 10px", fontSize: "12px" },
  form: { display: "flex", gap: "6px", padding: "10px 12px", borderTop: "1px solid #EDEDEA" },
  input: { flex: 1, minWidth: 0, padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none" },
  send: { padding: "9px 14px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
};
