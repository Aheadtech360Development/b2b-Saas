"use client";

/**
 * StudioAssistant — get a gang sheet made by talking.
 *
 * Built for somebody who has never used a builder: they drop their files in
 * here, say what they want ("8 of the logo, 4 inches wide, on a 22x10"), and
 * the assistant asks for anything missing — how many, how big,
 * whether to take a background off — then proposes a plan.
 *
 * A plan arrives as a card. The card is worked out by the builder, not the
 * model: the same nesting as Auto Nest lays it out, and the shop's own prices
 * price it, so what it says is what will happen. Nothing changes until the
 * buyer presses its button; one undo puts the sheet back.
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip, Sparkles, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import type { StudioContext } from "@/lib/studioContext";
import type { AssistantPlan, PlanPreview, PlanRun } from "@/lib/studioBuild";

type Refs = Record<string, string>;
type CardState = "ready" | "running" | "done" | "failed" | "old";

/** A design just uploaded, as the upload card asks about it. */
export interface UploadedDesign {
  uid: string;
  name: string;
  /** Read from the file: a picture with no transparency. */
  background: boolean;
}

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant"; content: string;
      plan?: AssistantPlan; refs?: Refs; preview?: PlanPreview; state?: CardState; result?: string;
    }
  | { role: "note"; content: string; tone: "ok" | "bad"; cartOffer?: boolean }
  | {
      role: "uploads"; designs: UploadedDesign[];
      /** The two questions, null until answered. */
      removeBg: boolean | null; place: boolean | null;
      state: "asking" | "running" | "done";
    };

// Fixed wording, so the starting points never depend on a model.
const SUGGESTIONS = [
  "Build my sheet for me",
  "Will my designs fit on this sheet?",
  "Which sheet is cheapest for my designs?",
  "Remove the backgrounds",
];

const GREETING =
  "Hi! Tell me what you want on your sheet — for example \"8 of my logo, 4 inches wide, on a 22x10\" — and I'll build it for you. " +
  "Add your designs with the 📎 button.";

const money = (n: number) => `$${n.toFixed(2)}`;
const settle = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(done, 40))));

export function StudioAssistant({ open, onClose, getContext, preview, run, upload, inbox, accept, uploading }: {
  open: boolean;
  onClose: () => void;
  getContext: () => { context: StudioContext; refs: Refs } | null;
  preview: (plan: AssistantPlan, refs: Refs, sizeId?: string) => PlanPreview;
  run: (plan: AssistantPlan, refs: Refs, sizeId?: string) => Promise<PlanRun>;
  upload: (files: File[]) => Promise<UploadedDesign[]>;
  /** Designs uploaded outside the chat (the Upload panel, a drop on the
   *  canvas) while it was open, to ask about. A new id is a new batch. */
  inbox?: { id: number; designs: UploadedDesign[] } | null;
  accept: string;
  uploading: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read at the moment of use: an answer or an upload finishes several renders
  // after it started, and must see the sheet and the chat as they are then.
  const live = useRef({ turns, getContext, preview });
  live.current = { turns, getContext, preview };

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, asking, open]);

  /** The conversation as the model is shown it, with what became of each plan. */
  function forModel(list: Turn[]) {
    return list.flatMap((t) => {
      if (t.role === "note" || t.role === "uploads") return [];
      if (t.role === "user" || !t.plan) return [{ role: t.role, content: t.content }];
      const what =
        t.state === "done" ? `[The customer pressed the button. Done: ${t.result ?? ""}]`
        : t.state === "failed" ? `[The customer pressed the button, but it could not be done: ${t.result ?? ""}]`
        : "[The customer has not pressed the button for this plan.]";
      return [{ role: t.role, content: `${t.content}\n\n${what}`.slice(0, 3900) }];
    });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    const before = live.current.turns;
    const next: Turn[] = [...before, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setAsking(true);
    setError(null);
    const sheet = live.current.getContext();
    try {
      const res = await apiClient.post<{ reply: string; plan?: AssistantPlan }>("/api/v1/copilot/studio", {
        messages: forModel(next),
        context: sheet?.context ?? null,
      });
      const refs = sheet?.refs ?? {};
      const answer: Turn = res.plan
        ? { role: "assistant", content: res.reply, plan: res.plan, refs, preview: live.current.preview(res.plan, refs), state: "ready" }
        : { role: "assistant", content: res.reply };
      // A new plan replaces any earlier one still waiting: one thing to press.
      setTurns((cur) => [
        ...cur.map((t) => (t.role === "assistant" && t.state === "ready" && res.plan ? { ...t, state: "old" as const } : t)),
        answer,
      ]);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      setTurns(before);
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

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const designs = await upload(files);
    if (designs.length) received(designs);
  }

  /** New designs: ask about them before anything is done with them. */
  function received(designs: UploadedDesign[]) {
    const anyBg = designs.some((d) => d.background);
    setTurns((cur) => [...cur, { role: "uploads", designs, removeBg: anyBg ? null : false, place: null, state: "asking" }]);
  }
  const seenInbox = useRef<number | null>(null);
  useEffect(() => {
    if (!inbox || inbox.id === seenInbox.current) return;
    seenInbox.current = inbox.id;
    received(inbox.designs);
  }, [inbox]);

  /**
   * One of the upload card's questions answered. Once both are, it is done —
   * backgrounds off if they said so, onto the sheet if they said so — and the
   * assistant is told what was uploaded and what became of it, so it can ask
   * what is left: how many, and how big.
   */
  async function answerUploads(index: number, answer: { removeBg?: boolean; place?: boolean }) {
    const t = live.current.turns[index];
    if (!t || t.role !== "uploads" || t.state !== "asking") return;
    const next = { ...t, ...answer };
    const complete = next.removeBg !== null && next.place !== null;
    setTurns((cur) => cur.map((x, i) => (i === index ? { ...next, state: complete ? "running" as const : "asking" as const } : x)));
    if (!complete) return;

    const withBg = next.designs.filter((d) => d.background);
    const ids = Object.fromEntries(next.designs.map((d) => [d.uid, d.uid]));
    let out: PlanRun = { ok: true, message: "" };
    if (next.removeBg || next.place) {
      try {
        out = await run({
          label: "Your uploads",
          remove_background: next.removeBg ? withBg.map((d) => d.uid) : undefined,
          place: next.place ? next.designs.map((d) => d.uid) : undefined,
        }, ids);
      } catch {
        out = { ok: false, message: "Something went wrong with the uploads." };
      }
    }
    setTurns((cur) => cur.map((x, i) => (i === index && x.role === "uploads" ? { ...x, state: "done" as const } : x)));

    const names = next.designs.map((d) => d.name).join(", ");
    const parts = [`📎 Uploaded ${names}.`];
    if (withBg.length) parts.push(next.removeBg ? `Remove the background from ${withBg.map((d) => d.name).join(", ")}.` : "Keep the backgrounds.");
    parts.push(next.place ? "Put on the sheet." : "Not on the sheet yet.");
    if (out.message && !out.ok) parts.push(`(${out.message})`);
    // Let the builder take the designs in before the assistant is told the sheet.
    await settle();
    await ask(parts.join(" "));
  }

  async function press(index: number, sizeId?: string) {
    const t = turns[index];
    if (!t || t.role !== "assistant" || !t.plan || t.state !== "ready") return;
    const plan = t.plan, refs = t.refs ?? {};
    setTurns((cur) => cur.map((x, i) => (i === index && x.role === "assistant" ? { ...x, state: "running" as const } : x)));
    let out: PlanRun;
    try {
      out = await run(plan, refs, sizeId);
    } catch {
      out = { ok: false, message: "Something went wrong — nothing more was changed." };
    }
    setTurns((cur) => {
      const marked = cur.map((x, i) => (i === index && x.role === "assistant" ? { ...x, state: (out.ok ? "done" : "failed") as CardState, result: out.message } : x));
      // Built but not yet in the cart: the obvious next step is one tap away.
      const offerCart = out.ok && !!plan.build && !plan.add_to_cart;
      return [...marked, {
        role: "note" as const, tone: out.ok ? "ok" as const : "bad" as const, cartOffer: offerCart,
        content: out.ok
          ? "✓ Done — your sheet is updated. Not right? Press Undo (Ctrl+Z), or tell me what to change."
          : `✗ ${out.message}`,
      }];
    });
  }

  async function addToCart(index: number) {
    setTurns((cur) => cur.map((x, i) => (i === index && x.role === "note" ? { ...x, cartOffer: false } : x)));
    const out = await run({ label: "Add to cart", add_to_cart: true }, {});
    if (!out.ok) setTurns((cur) => [...cur, { role: "note", tone: "bad", content: `✗ ${out.message}` }]);
  }

  if (!open) return null;
  const busy = asking || uploading;

  return (
    <div role="dialog" aria-label="Sheet assistant" data-gs-assistant style={S.panel}>
      <div style={S.head}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={S.headIcon}><Sparkles size={15} strokeWidth={2.3} aria-hidden /></span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>Build with AI</div>
            <div style={{ fontSize: "11px", color: "#6B6B6B" }}>Tell me what you need</div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close assistant" style={S.close}><X size={16} strokeWidth={2.3} /></button>
      </div>

      <div ref={scroller} style={S.log}>
        {turns.length === 0 && (
          <>
            <div style={{ ...S.bot, whiteSpace: "pre-wrap" }}>{GREETING}</div>
            {!off && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <button onClick={() => fileRef.current?.click()} style={{ ...S.chip, borderColor: "#C7C4F5", color: "#3B33C4" }}>📎 Upload designs</button>
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => void ask(s)} style={S.chip}>{s}</button>)}
              </div>
            )}
          </>
        )}
        {turns.map((t, i) => {
          if (t.role === "user") return <div key={i} style={S.user}>{t.content}</div>;
          if (t.role === "uploads") {
            return <UploadCard key={i} turn={t} onAnswer={(a) => void answerUploads(i, a)} />;
          }
          if (t.role === "note") {
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px", alignSelf: "stretch" }}>
                <div style={t.tone === "ok" ? S.noteOk : S.noteBad}>{t.content}</div>
                {t.cartOffer && (
                  <button onClick={() => void addToCart(i)} style={S.cartBtn}>🛒 Add to cart</button>
                )}
              </div>
            );
          }
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px", alignSelf: "stretch" }}>
              <div style={S.bot}><ChatMarkdown text={t.content} /></div>
              {t.plan && t.preview && (
                <PlanCard plan={t.plan} preview={t.preview} state={t.state ?? "ready"} result={t.result}
                  onDo={() => void press(i)} onAlt={(id) => void press(i, id)} />
              )}
            </div>
          );
        })}
        {asking && <div style={{ ...S.bot, color: "#6B6B6B" }}>Looking at your sheet…</div>}
        {uploading && !asking && <div style={{ ...S.bot, color: "#6B6B6B" }}>Uploading your designs…</div>}
      </div>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} style={S.form}>
        <input ref={fileRef} type="file" multiple accept={accept} onChange={(e) => void onFiles(e.target.files)} style={{ display: "none" }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || off}
          aria-label="Upload designs" title="Upload designs" style={{ ...S.clip, opacity: busy || off ? 0.45 : 1 }}>
          <Paperclip size={16} strokeWidth={2.2} />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy || off}
          placeholder={off ? "The assistant isn't available right now" : "e.g. 10 of my logo, 4 inches wide, on a 22x10"}
          maxLength={4000} style={S.input} />
        <button type="submit" disabled={busy || off || !draft.trim()}
          style={{ ...S.send, opacity: busy || off || !draft.trim() ? 0.45 : 1 }}>Send</button>
      </form>
    </div>
  );
}

/** Just uploaded: take the background off? Put it on the sheet? Nothing is
 *  done with the designs until both are answered. */
function UploadCard({ turn, onAnswer }: {
  turn: Extract<Turn, { role: "uploads" }>;
  onAnswer: (a: { removeBg?: boolean; place?: boolean }) => void;
}) {
  const withBg = turn.designs.filter((d) => d.background);
  const one = turn.designs.length === 1;
  const asking = turn.state === "asking";
  const choice = (picked: boolean | null, label: string, value: boolean, pick: () => void) => (
    <button onClick={pick} disabled={!asking || picked !== null}
      style={{ ...(value ? S.yesBtn : S.noBtn), ...(picked === value ? S.picked : {}), opacity: picked !== null && picked !== value ? 0.4 : 1 }}
      aria-pressed={picked === value}>
      {label}
    </button>
  );
  return (
    <div style={S.card} data-upload-card>
      <div style={{ fontSize: "13px", fontWeight: 800 }}>📎 {one ? "Uploaded" : `${turn.designs.length} designs uploaded`}: {turn.designs.map((d) => d.name).join(", ")}</div>
      {withBg.length > 0 && (
        <div style={S.question}>
          <div>Background found on {withBg.map((d) => d.name).join(", ")} — it would print as a solid box. Remove it?</div>
          <div style={S.choices}>
            {choice(turn.removeBg, "Yes, remove it", true, () => onAnswer({ removeBg: true }))}
            {choice(turn.removeBg, "No, keep it", false, () => onAnswer({ removeBg: false }))}
          </div>
        </div>
      )}
      <div style={S.question}>
        <div>Put {one ? "it" : "them"} on the sheet now?</div>
        <div style={S.choices}>
          {choice(turn.place, "Yes, put it on", true, () => onAnswer({ place: true }))}
          {choice(turn.place, "Not yet", false, () => onAnswer({ place: false }))}
        </div>
      </div>
      {turn.state === "running" && <div style={S.cardStatus}>Working on it…</div>}
    </div>
  );
}

/** The plan, as the builder worked it out, and the button that makes it. */
function PlanCard({ plan, preview, state, result, onDo, onAlt }: {
  plan: AssistantPlan; preview: PlanPreview; state: CardState; result?: string;
  onDo: () => void; onAlt: (sizeId: string) => void;
}) {
  const b = preview.build;
  const ready = state === "ready";
  return (
    <div style={{ ...S.card, opacity: state === "old" ? 0.55 : 1 }}>
      <div style={{ fontSize: "13px", fontWeight: 800, color: "#1A1A1A" }}>{plan.label}</div>
      <ul style={S.steps}>
        {preview.backgrounds.length > 0 && <li>✂️ Remove background: {preview.backgrounds.join(", ")}</li>}
        {preview.place.length > 0 && <li>➕ Put on the sheet: {preview.place.join(", ")}</li>}
        {b?.fills.map((f) => <li key={f.name}>▦ Fill the sheet: {f.copies} × {f.name}</li>)}
        {b?.gap != null && <li>↔ Space between designs: {b.gap}″</li>}
        {b && (
          <li>
            ▦ {b.copies} design{b.copies === 1 ? "" : "s"} on {b.sheets === 1 ? "1" : b.sheets} × {b.sizeName}
            {b.roll && b.lengths.length ? ` (${b.lengths.map((l) => `${l}″`).join(", ")} long)` : ""}
            {" — "}<strong>{money(b.price * b.qty)}</strong>{b.qty > 1 ? ` (${b.qty} sets)` : ""}
          </li>
        )}
        {b && b.sheets > 1 && <li style={{ color: "#92400E" }}>Doesn&apos;t fit one {b.sizeName} — it takes {b.sheets} sheets.</li>}
        {b?.lowDpi.map((d) => (
          <li key={d.name} style={{ color: "#92400E" }}>⚠ {d.name} prints at {d.dpi} DPI at that size — may look soft.</li>
        ))}
        {!b && preview.sets ? <li>🖨 Print {preview.sets} set{preview.sets === 1 ? "" : "s"} of this sheet</li> : null}
        {preview.cart && <li>🛒 Then save it and open the cart</li>}
      </ul>
      {preview.problem && <div style={S.cardProblem}>{preview.problem}</div>}

      {ready && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button onClick={onDo} disabled={!!preview.problem} style={{ ...S.doBtn, opacity: preview.problem ? 0.45 : 1 }}>
            ✓ Do it
          </button>
          {b?.alt && (
            <button onClick={() => onAlt(b.alt!.sizeId)} style={S.altBtn}>
              Use one {b.alt.sizeName}{b.alt.length ? ` (${b.alt.length}″)` : ""} instead — {money(b.alt.price * b.qty)}
            </button>
          )}
        </div>
      )}
      {state === "running" && <div style={S.cardStatus}>Working on it…</div>}
      {state === "done" && <div style={{ ...S.cardStatus, color: "#166534" }}>✓ Done{result ? ` — ${result}` : ""}</div>}
      {state === "failed" && <div style={{ ...S.cardStatus, color: "#991B1B" }}>✗ {result}</div>}
      {state === "old" && <div style={S.cardStatus}>Replaced by a newer plan.</div>}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: { position: "fixed", right: "16px", bottom: "16px", zIndex: 260, width: "min(390px, calc(100vw - 32px))", height: "min(600px, calc(100dvh - 96px))", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", overflow: "hidden", color: "#1A1A1A" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #EDEDEA" },
  headIcon: { width: "28px", height: "28px", borderRadius: "8px", background: "#4F46E5", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  close: { border: "none", background: "none", cursor: "pointer", color: "#6B6B6B", display: "inline-flex", padding: "2px" },
  log: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" },
  user: { alignSelf: "flex-end", maxWidth: "85%", background: "#1A1A1A", color: "#fff", padding: "8px 11px", borderRadius: "12px 12px 2px 12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  bot: { alignSelf: "flex-start", maxWidth: "92%", background: "#F4F4F2", color: "#1A1A1A", padding: "8px 11px", borderRadius: "12px 12px 12px 2px", fontSize: "13px", lineHeight: 1.55 },
  noteOk: { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", borderRadius: "10px", padding: "8px 11px", fontSize: "12.5px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  noteBad: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "10px", padding: "8px 11px", fontSize: "12.5px", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  card: { border: "1.5px solid #C7C4F5", background: "#F7F6FF", borderRadius: "12px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" },
  steps: { margin: 0, paddingLeft: "2px", listStyle: "none", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12.5px", lineHeight: 1.5, color: "#2A2F3A" },
  cardProblem: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", lineHeight: 1.5 },
  cardStatus: { fontSize: "12.5px", fontWeight: 600, color: "#5A6474" },
  doBtn: { padding: "10px 12px", background: "#4F46E5", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" },
  altBtn: { padding: "8px 12px", background: "#fff", color: "#3B33C4", border: "1px solid #C7C4F5", borderRadius: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", textAlign: "left" },
  question: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", lineHeight: 1.5, color: "#2A2F3A" },
  choices: { display: "flex", gap: "6px", flexWrap: "wrap" },
  yesBtn: { padding: "7px 12px", background: "#4F46E5", color: "#fff", border: "1px solid #4F46E5", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" },
  noBtn: { padding: "7px 12px", background: "#fff", color: "#2A2F3A", border: "1px solid #D4D4D8", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" },
  picked: { boxShadow: "0 0 0 2px #C7C4F5" },
  cartBtn: { padding: "9px 12px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  chip: { padding: "6px 10px", border: "1px solid #E3E3E3", background: "#fff", borderRadius: "16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", textAlign: "left" },
  error: { margin: "0 14px 6px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "7px 10px", fontSize: "12px" },
  form: { display: "flex", gap: "6px", padding: "10px 12px", borderTop: "1px solid #EDEDEA", alignItems: "center" },
  clip: { width: "36px", height: "36px", flexShrink: 0, border: "1px solid #E3E3E3", background: "#fff", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#3B33C4" },
  input: { flex: 1, minWidth: 0, padding: "9px 11px", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", outline: "none" },
  send: { padding: "9px 14px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
};
