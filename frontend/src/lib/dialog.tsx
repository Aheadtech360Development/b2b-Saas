"use client";
/**
 * The product's own dialogs, in place of the browser's confirm, alert and prompt.
 *
 * The browser's boxes open at the top of the window under the address bar, say
 * "<site> says", and look like nothing else in the product. These open in the
 * middle of the screen over a dimmed page:
 *
 *   if (!(await ask("Delete this file?"))) return;   // true for the main button
 *   await tell("Delete failed");                       // one OK button
 *   const name = await askText("Name this section", "Hero");   // the text, or null
 *
 * Esc, or a click outside, is Cancel; Enter is the main button. The first
 * sentence of a message is its title and the rest its body. A message that
 * deletes, removes or throws something away gets a red button named for it.
 *
 * Nothing needs mounting: the first call puts one host on the page.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, HelpCircle, Info, PenLine } from "lucide-react";

type Kind = "ask" | "tell" | "text";

export interface DialogOptions {
  /** A title over the message; by default the message's first sentence. */
  title?: string;
  /** The main button's label. */
  ok?: string;
  cancel?: string;
  /** A red main button. By default: when the message deletes, removes or discards something. */
  danger?: boolean;
}

export interface TextOptions extends DialogOptions {
  placeholder?: string;
}

interface Req extends TextOptions {
  id: number;
  kind: Kind;
  message: string;
  value: string;
  resolve: (v: unknown) => void;
}

let open: Req[] = [];
let counter = 0;
let mounted = false;
const subs = new Set<() => void>();

function changed() { subs.forEach((f) => f()); }

function show<T>(kind: Kind, message: string, opts: TextOptions = {}, value = ""): Promise<T> {
  if (typeof document === "undefined") return Promise.resolve((kind === "ask" ? false : kind === "text" ? null : undefined) as T);
  if (!mounted) {
    mounted = true;
    const el = document.createElement("div");
    el.setAttribute("data-dialog-host", "");
    document.body.appendChild(el);
    createRoot(el).render(<Host />);
  }
  return new Promise<T>((resolve) => {
    open = [...open, { ...opts, id: ++counter, kind, message: String(message ?? ""), value, resolve: resolve as (v: unknown) => void }];
    changed();
  });
}

function settle(req: Req, value: unknown) {
  open = open.filter((r) => r !== req);
  changed();
  req.resolve(value);
}

/** Ask before doing something. True for the main button, false for Cancel. */
export function ask(message: string, opts?: DialogOptions): Promise<boolean> {
  return show<boolean>("ask", message, opts);
}

/** Say something that needs reading. Resolves when it is closed. */
export function tell(message: string, opts?: DialogOptions): Promise<void> {
  return show<void>("tell", message, opts);
}

/** Ask for a line of text. The text as typed (trimmed), or null for Cancel. */
export function askText(message: string, initial = "", opts?: TextOptions): Promise<string | null> {
  return show<string | null>("text", message, opts, initial ?? "");
}

// ── Wording ──────────────────────────────────────────────────────────────────
const DANGER: [RegExp, string][] = [
  [/^(permanently\s+)?delete\b/i, "Delete"],
  [/^remove\b/i, "Remove"],
  [/^(discard|throw away)\b/i, "Discard"],
  [/^disconnect\b/i, "Disconnect"],
  [/^suspend\b/i, "Suspend"],
  [/^deactivate\b/i, "Deactivate"],
  [/^(close|leave) without saving|unsaved/i, "Discard changes"],
];

function split(message: string, title?: string): { head: string; body: string } {
  if (title) return { head: title, body: message };
  const m = message.match(/^([^\n]{1,160}?[?.!])\s+([\s\S]+)$/) ?? message.match(/^([^\n]{1,160})\n+([\s\S]+)$/);
  return m ? { head: m[1]!.trim(), body: m[2]!.trim() } : { head: message.trim(), body: "" };
}

// ── The dialog ───────────────────────────────────────────────────────────────
const CSS = `
@keyframes pcdlg-fade{from{opacity:0}to{opacity:1}}
@keyframes pcdlg-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
.pcdlg-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(15,17,21,.48);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:pcdlg-fade .14s ease-out}
.pcdlg{box-sizing:border-box;width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#14161B;
  border-radius:16px;box-shadow:0 24px 60px rgba(15,17,21,.28),0 2px 8px rgba(15,17,21,.12);padding:22px 22px 18px;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;animation:pcdlg-in .16s ease-out}
.pcdlg *{box-sizing:border-box}
.pcdlg-top{display:flex;gap:14px;align-items:flex-start}
.pcdlg-icon{flex:0 0 40px;width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#EEF2FF;color:#3538CD}
.pcdlg-icon.danger{background:#FEF3F2;color:#D92D20}
.pcdlg-head{margin:0;font-size:16.5px;line-height:1.4;font-weight:650;letter-spacing:-.005em;overflow-wrap:anywhere}
.pcdlg-body{margin:6px 0 0;font-size:14px;line-height:1.55;color:#5B6170;white-space:pre-line;overflow-wrap:anywhere}
.pcdlg-input{display:block;width:100%;margin-top:14px;height:40px;padding:0 12px;border:1px solid #D0D5DD;border-radius:10px;font:inherit;font-size:14px;color:#14161B;background:#fff;outline:none}
.pcdlg-input:focus{border-color:#14161B;box-shadow:0 0 0 3px rgba(20,22,27,.12)}
.pcdlg-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:22px}
.pcdlg-btn{flex:0 1 auto;min-width:96px;height:40px;padding:0 18px;border-radius:10px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;
  border:1px solid #D0D5DD;background:#fff;color:#14161B;transition:background .12s,border-color .12s,box-shadow .12s}
.pcdlg-btn:hover{background:#F5F6F8}
.pcdlg-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(53,56,205,.28)}
.pcdlg-btn.main{background:#14161B;border-color:#14161B;color:#fff}
.pcdlg-btn.main:hover{background:#2A2D35}
.pcdlg-btn.main.danger{background:#D92D20;border-color:#D92D20}
.pcdlg-btn.main.danger:hover{background:#B42318}
.pcdlg-btn:disabled{opacity:.45;cursor:not-allowed}
@media (max-width:420px){.pcdlg-actions{flex-direction:column-reverse}.pcdlg-btn{width:100%}}
@media (prefers-reduced-motion:reduce){.pcdlg-back,.pcdlg{animation:none}}
`;

function Host() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);
  const top = open[0];
  return (
    <>
      <style>{CSS}</style>
      {top && <Dialog key={top.id} req={top} />}
    </>
  );
}

function Dialog({ req }: { req: Req }) {
  const [text, setText] = useState(req.value);
  const box = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const verb = DANGER.find(([re]) => re.test(req.message.trim()))?.[1];
  const danger = req.danger ?? !!verb;
  const { head, body } = split(req.message, req.title);
  const okLabel = req.ok ?? (req.kind === "tell" ? "OK" : req.kind === "text" ? "Save" : verb ?? "OK");
  const cancelLabel = req.cancel ?? "Cancel";

  const finish = (yes: boolean) => {
    if (req.kind === "ask") settle(req, yes);
    else if (req.kind === "tell") settle(req, undefined);
    else settle(req, yes ? textRef.current.trim() || null : null);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    (req.kind === "text" ? input.current : main.current)?.focus();
    if (req.kind === "text") input.current?.select();
    // Caught before anything else on the page hears it: a Delete or Ctrl Z
    // pressed while the dialog is open belongs to the dialog, not the page.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); finishRef.current(false); return; }
      if (e.key === "Enter") {
        // Enter presses the button that has the focus (Cancel, if tabbed to), else the main one.
        e.preventDefault();
        const focused = document.activeElement as HTMLElement | null;
        if (focused?.tagName === "BUTTON" && box.current?.contains(focused)) focused.click();
        else finishRef.current(true);
        return;
      }
      if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>("button, input")];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
        e.preventDefault();
        items[next]!.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (before && before.isConnected && typeof before.focus === "function") before.focus();
    };
  }, [req.kind]);

  const Icon = req.kind === "text" ? PenLine : danger ? AlertTriangle : req.kind === "tell" ? Info : HelpCircle;

  return (
    <div className="pcdlg-back" onMouseDown={(e) => { if (e.target === e.currentTarget) finish(false); }}>
      <div ref={box} className="pcdlg" role={req.kind === "tell" ? "alertdialog" : "dialog"} aria-modal="true"
           aria-labelledby={`pcdlg-h${req.id}`} aria-describedby={body ? `pcdlg-b${req.id}` : undefined}>
        <div className="pcdlg-top">
          <span className={`pcdlg-icon${danger ? " danger" : ""}`} aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>
          <div style={{ flex: "1 1 auto", minWidth: 0, paddingTop: 2 }}>
            <h2 id={`pcdlg-h${req.id}`} className="pcdlg-head">{head}</h2>
            {body && <p id={`pcdlg-b${req.id}`} className="pcdlg-body">{body}</p>}
            {req.kind === "text" && (
              <input ref={input} className="pcdlg-input" value={text} placeholder={req.placeholder}
                     onChange={(e) => setText(e.target.value)} aria-label={head} />
            )}
          </div>
        </div>
        <div className="pcdlg-actions">
          {req.kind !== "tell" && (
            <button type="button" className="pcdlg-btn" onClick={() => finish(false)}>{cancelLabel}</button>
          )}
          <button ref={main} type="button" className={`pcdlg-btn main${danger ? " danger" : ""}`} onClick={() => finish(true)}
                  disabled={req.kind === "text" && !text.trim()}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}
