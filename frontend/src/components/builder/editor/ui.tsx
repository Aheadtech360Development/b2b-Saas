"use client";

/**
 * The editor's own look and its small shared controls.
 *
 * The editor is a fixed, full-window application: a top bar, a left panel, the
 * canvas, a right panel. Each of the three columns scrolls on its own, so
 * nothing is ever cut off and the window itself never scrolls — the same rule
 * as the gang sheet studio. Styles are scoped under .sbe so none of this can
 * reach the site being edited (which lives under .bsite) or the reverse.
 *
 * The site being edited is drawn inside .sbe, so a rule here that names a bare
 * element — button, input, a heading — would reach the page's own: an "Add to
 * cart" button lost its white label to "buttons inherit their colour" and was
 * dark on dark. Every such rule therefore leaves the page out with
 * :not(.bsite *) — inside :where(), so the rule weighs exactly what it did
 * before: written bare, the :not() made it outweigh the editor's own
 * ".sbe-btn.primary", and Publish went black on black instead.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export const EDITOR_CSS = `
.sbe{position:fixed;inset:0;display:grid;grid-template-rows:56px minmax(0,1fr);background:#EEF0F4;color:#14161B;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;z-index:50}
.sbe *,.sbe *::before,.sbe *::after{box-sizing:border-box}
.sbe button:where(:not(.bsite *)){font:inherit;color:inherit}
.sbe :is(h1,h2,h3,h4):not(.bsite *){font-family:inherit;letter-spacing:normal}
.sbe :is(input,select,textarea):where(:not(.bsite *)){font:inherit;color:#14161B}
.sbe-top{display:flex;align-items:center;gap:10px;padding:0 12px;background:#fff;border-bottom:1px solid #E3E6EC;min-width:0;overflow-x:auto;scrollbar-width:none}
.sbe-top::-webkit-scrollbar{display:none}
.sbe-body{display:grid;grid-template-columns:var(--sbe-left,300px) minmax(0,1fr) var(--sbe-right,320px);min-height:0}
.sbe-left,.sbe-right{background:#fff;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.sbe-left{border-right:1px solid #E3E6EC;grid-column:1}
.sbe-right{border-left:1px solid #E3E6EC;grid-column:3}
.sbe-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.sbe-center{grid-column:2;position:relative;min-width:0;min-height:0;display:flex;flex-direction:column}
.sbe-canvas{flex:1;min-height:0;overflow:auto;padding:28px 28px 80px;scrollbar-width:thin}
.sbe-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;border-radius:9px;border:1px solid #D9DDE5;background:#fff;cursor:pointer;font-weight:500;white-space:nowrap;flex:0 0 auto}
.sbe-btn:hover{background:#F5F6F9}
.sbe-btn:disabled{opacity:.45;cursor:not-allowed}
.sbe-btn.primary{background:#14161B;border-color:#14161B;color:#fff}
.sbe-btn.primary:hover{background:#2A2D35}
.sbe-btn.danger{color:#B42318;border-color:#F1C4BF}
.sbe-btn.danger:hover{background:#FEF3F2}
.sbe-btn.ghost{border-color:transparent;background:none}
.sbe-btn.ghost:hover{background:#F1F3F7}
.sbe-btn.sm{height:28px;padding:0 9px;font-size:13px;border-radius:8px}
.sbe-icon{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid transparent;background:none;cursor:pointer;flex:0 0 auto}
.sbe-icon:hover{background:#F1F3F7}
.sbe-icon:disabled{opacity:.35;cursor:not-allowed}
.sbe-icon.on{background:#14161B;color:#fff}
.sbe-icon.sm{width:28px;height:28px;border-radius:7px}
.sbe-seg{display:inline-flex;padding:3px;border-radius:10px;background:#F1F3F7;gap:2px;flex:0 0 auto}
.sbe-seg button{display:inline-grid;place-items:center;height:28px;min-width:32px;padding:0 8px;border:0;border-radius:8px;background:none;cursor:pointer;color:#5B6170}
.sbe-seg button[aria-pressed=true]{background:#fff;color:#14161B;box-shadow:0 1px 2px rgba(20,22,27,.12)}
.sbe-tabs{display:flex;gap:2px;padding:8px 8px 0;border-bottom:1px solid #EEF0F4;overflow-x:auto;scrollbar-width:none;flex:0 0 auto}
.sbe-tabs::-webkit-scrollbar{display:none}
.sbe-tab{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:0;border-bottom:2px solid transparent;background:none;cursor:pointer;color:#5B6170;font-weight:600;font-size:13px;white-space:nowrap}
.sbe-tab[aria-selected=true]{color:#14161B;border-bottom-color:#14161B}
.sbe-sec{padding:14px 14px 4px}
.sbe-sec + .sbe-sec{border-top:1px solid #F1F3F7}
.sbe-h{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A808C;margin:0 0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.sbe-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;min-width:0}
.sbe-field > label,.sbe-lbl{font-size:12.5px;font-weight:600;color:#3B404B}
.sbe-help{font-size:12px;color:#7A808C;line-height:1.4}
.sbe-in{width:100%;min-width:0;height:34px;padding:0 10px;border:1px solid #D9DDE5;border-radius:8px;background:#fff;outline:none}
.sbe-in:focus{border-color:#14161B;box-shadow:0 0 0 3px rgba(20,22,27,.08)}
textarea.sbe-in{height:auto;min-height:80px;padding:8px 10px;resize:vertical;line-height:1.45}
textarea.sbe-in.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;min-height:140px;white-space:pre;tab-size:2}
select.sbe-in{padding-right:28px}
.sbe-row{display:flex;gap:8px;align-items:center;min-width:0}
.sbe-row > *{min-width:0}
.sbe-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sbe-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.sbe-mini{display:flex;flex-direction:column;gap:3px;min-width:0}
.sbe-mini span{font-size:11px;color:#7A808C;text-align:center}
.sbe-mini input{height:30px;padding:0 6px;text-align:center;font-size:13px}
.sbe-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;cursor:pointer;font-size:13px;font-weight:500}
.sbe-switch{position:relative;width:34px;height:20px;border-radius:999px;background:#D9DDE5;flex:0 0 auto;transition:background .15s}
.sbe-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
.sbe-switch[data-on=true]{background:#14161B}
.sbe-switch[data-on=true]::after{transform:translateX(14px)}
.sbe-color{display:flex;align-items:center;gap:6px;min-width:0}
.sbe-color input[type=color]{width:34px;height:34px;padding:2px;border:1px solid #D9DDE5;border-radius:8px;background:#fff;cursor:pointer;flex:0 0 auto}
.sbe-swatches{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.sbe-swatch{width:20px;height:20px;border-radius:6px;border:1px solid rgba(0,0,0,.12);cursor:pointer;padding:0}
.sbe-list{display:flex;flex-direction:column;gap:2px}
.sbe-item{display:flex;align-items:center;gap:8px;min-height:36px;padding:6px 8px;border-radius:9px;cursor:pointer;min-width:0;border:1px solid transparent;background:none;text-align:left;width:100%}
.sbe-item:hover{background:#F5F6F9}
.sbe-item[aria-current=true]{background:#EEF2FF;border-color:#C7D2FE}
.sbe-item .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbe-item .sub{font-size:12px;color:#7A808C}
.sbe-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.sbe-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:72px;padding:8px 6px;border:1px solid #E3E6EC;border-radius:10px;background:#fff;cursor:grab;font-size:12px;font-weight:500;text-align:center;line-height:1.2;user-select:none;overflow:hidden}
.sbe-tile-label{display:block;max-width:100%;font-size:11.5px;line-height:1.25;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere;text-wrap:balance}
.sbe-tile:hover{border-color:#14161B;box-shadow:0 2px 8px rgba(20,22,27,.08)}
.sbe-tile:active{cursor:grabbing}
.sbe-card{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid #E3E6EC;border-radius:10px;background:#fff;cursor:grab;text-align:left;width:100%}
.sbe-card:hover{border-color:#14161B}
.sbe-card b{font-size:13px}
.sbe-card span{font-size:12px;color:#7A808C}
.sbe-badge{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;flex:0 0 auto}
.sbe-badge.legacy{background:#FFF4E5;color:#8A4B00}
.sbe-badge.live{background:#E7F6EC;color:#14632F}
.sbe-badge.muted{background:#F1F3F7;color:#5B6170}
.sbe-status{font-size:12.5px;color:#7A808C;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}
.sbe-dot{width:7px;height:7px;border-radius:50%;background:#22A35A}
.sbe-dot.busy{background:#E0A100}
.sbe-dot.bad{background:#D92D20}
.sbe-empty{padding:20px 14px;color:#7A808C;font-size:13px;text-align:center}
.sbe-note{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#F4F6FB;color:#4A5160;font-size:12.5px;line-height:1.45}
.sbe-note.warn{background:#FFF8EB;color:#7A4A00}
.sbe-note.bad{background:#FEF3F2;color:#912018}
.sbe-modal-back{position:fixed;inset:0;background:rgba(15,17,22,.42);display:grid;place-items:center;padding:16px;z-index:100}
.sbe-modal{width:min(560px,100%);max-height:min(86vh,820px);display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden}
.sbe-modal.wide{width:min(860px,100%)}
.sbe-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid #EEF0F4}
.sbe-modal-head h2{margin:0;font-size:16px}
.sbe-modal-body{padding:16px 18px;overflow-y:auto;min-height:0;flex:1}
.sbe-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #EEF0F4;flex-wrap:wrap}
.sbe-menu{position:absolute;z-index:90;min-width:240px;max-height:min(70vh,560px);overflow-y:auto;background:#fff;border:1px solid #E3E6EC;border-radius:12px;box-shadow:0 16px 40px rgba(20,22,27,.16);padding:6px}
.sbe-menu-h{padding:8px 10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A808C}
.sbe-layer{display:flex;align-items:center;gap:4px;min-height:30px;padding:2px 4px 2px 0;border-radius:7px;cursor:pointer;font-size:13px;min-width:0}
.sbe-layer:hover{background:#F5F6F9}
.sbe-layer[aria-current=true]{background:#EEF2FF;color:#1E2A78}
.sbe-layer .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbe-layer .acts{display:none;gap:1px}
.sbe-layer:hover .acts,.sbe-layer[aria-current=true] .acts{display:flex}
.sbe-crumbs{display:flex;flex-wrap:wrap;gap:2px;align-items:center;font-size:12px;color:#7A808C}
.sbe-crumbs button{border:0;background:none;padding:2px 4px;border-radius:5px;cursor:pointer;color:#5B6170}
.sbe-crumbs button:hover{background:#F1F3F7;color:#14161B}
.sbe-frame-wrap{margin:0 auto;position:relative}
.sbe-frame{background:#fff;box-shadow:0 1px 3px rgba(20,22,27,.08),0 10px 30px rgba(20,22,27,.08);transform-origin:top left;position:relative;border-radius:6px;overflow:hidden}
.sbe-frame[data-device=mobile],.sbe-frame[data-device=tablet]{border-radius:18px}
.sbe-overlay{position:absolute;inset:0;pointer-events:none;z-index:20}
.sbe-sel{position:absolute;border:2px solid #4F46E5;border-radius:3px}
.sbe-hover{position:absolute;border:1.5px dashed #818CF8;border-radius:3px}
.sbe-chip{position:absolute;left:-2px;bottom:100%;display:flex;align-items:center;gap:2px;padding:0 2px 0 8px;height:26px;background:#4F46E5;color:#fff;border-radius:6px 6px 0 0;font-size:12px;font-weight:600;white-space:nowrap;pointer-events:auto;font-family:system-ui,sans-serif}
.sbe-chip.below{bottom:auto;top:100%;border-radius:0 0 6px 6px}
.sbe-chip button{display:grid;place-items:center;width:24px;height:22px;border:0;background:none;color:#fff;border-radius:5px;cursor:pointer}
.sbe-chip button:hover{background:rgba(255,255,255,.18)}
.sbe-chip .drag{cursor:grab}
.sbe-hchip{position:absolute;left:-1px;bottom:100%;padding:2px 7px;background:#818CF8;color:#fff;font-size:11px;font-weight:600;border-radius:5px 5px 0 0;white-space:nowrap;font-family:system-ui,sans-serif}
.sbe-plus{position:absolute;width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:#4F46E5;color:#fff;display:grid;place-items:center;padding:0;cursor:pointer;pointer-events:auto;box-shadow:0 1px 4px rgba(20,22,27,.35);z-index:3;transition:transform .12s,background-color .12s}
.sbe-plus:hover,.sbe-plus.on{transform:scale(1.2);background:#3730A3}
.sbe-insert{position:fixed;z-index:95;display:flex;flex-direction:column;background:#fff;border:1px solid #E3E6EC;border-radius:14px;box-shadow:0 18px 48px rgba(20,22,27,.2);overflow:hidden}
.sbe-insert-top{padding:10px;border-bottom:1px solid #EEF0F4;flex:0 0 auto}
.sbe-insert-body{padding:2px 10px 12px;overflow-y:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin}
.sbe-insert .sbe-menu-h{padding:10px 0 6px}
.sbe-insert .enter{border-color:#4F46E5;box-shadow:0 0 0 2px rgba(79,70,229,.18)}
.sbe-menu-row{padding:10px;border:1px solid #E3E6EC;border-radius:10px;background:#FAFBFC}
.sbe-rich h2{font-size:1.4em;font-weight:700;line-height:1.25;margin:.8em 0 .3em}
.sbe-rich h3{font-size:1.15em;font-weight:700;line-height:1.3;margin:.8em 0 .3em}
.sbe-rich p{margin:.5em 0}
.sbe-rich ul{list-style:disc;padding-left:1.4em;margin:.5em 0}
.sbe-rich ol{list-style:decimal;padding-left:1.4em;margin:.5em 0}
.sbe-rich a{color:#4F46E5;text-decoration:underline}
.sbe-rich > :first-child{margin-top:0}
.sbe-drop-line{position:absolute;background:#4F46E5;border-radius:2px;box-shadow:0 0 0 2px rgba(79,70,229,.2)}
.sbe-cell{position:absolute;border:1px dashed rgba(79,70,229,.5);border-radius:4px;background:rgba(79,70,229,.03)}
.sbe-cell span{position:absolute;top:3px;left:4px;font:600 10px system-ui,sans-serif;color:rgba(79,70,229,.75)}
.sbe-span-handle{position:absolute;right:-8px;bottom:-8px;width:14px;height:14px;border-radius:4px;background:#4F46E5;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:nwse-resize;pointer-events:auto;touch-action:none}
.sbe-drop-box{position:absolute;border:2px dashed #4F46E5;background:rgba(79,70,229,.06);border-radius:4px}
.sbe-banner{display:flex;align-items:center;gap:10px;padding:8px 14px;font-size:13px;background:#FFF8EB;color:#7A4A00;border-bottom:1px solid #F5E1B8;flex-wrap:wrap}
.sbe-banner.info{background:#F4F5FF;color:#3730A3;border-color:#E0E3FF}
.sbe-newtpl{padding:10px 10px 0;border:1px solid #E3E6EC;border-radius:10px;background:#FAFBFC;margin-bottom:8px}
.sbe-banner.bad{background:#FEF3F2;color:#912018;border-color:#F8D3CF}
.sbe-issue{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid #EEF0F4;margin-bottom:8px;font-size:13px}
.sbe-issue.error{border-color:#F8D3CF;background:#FFFBFA}
.sbe-issue.warning{border-color:#F5E1B8;background:#FFFDF7}
.sbe-kbd{font:11px ui-monospace,monospace;padding:1px 5px;border:1px solid #D9DDE5;border-bottom-width:2px;border-radius:5px;background:#fff;color:#5B6170}
.sbe-hide-sm{}
@media (max-width:1480px){.sbe-hide-sm{display:none!important}}
@media (max-width:1180px){.sbe-hide-xs{display:none!important}}
`;

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sbe-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sbe-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sbe-modal-head">
          <h2>{title}</h2>
          <button type="button" className="sbe-icon sm" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sbe-modal-body">{children}</div>
        {footer && <div className="sbe-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A dropdown anchored under its button, closed by a click elsewhere or Escape. */
export function Popover({ open, onClose, anchor, children, align = "left", width }: {
  open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; children: ReactNode;
  align?: "left" | "right"; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = anchor.current?.getBoundingClientRect();
    if (r) {
      const w = width ?? 260;
      const left = align === "right" ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", onKey); };
  }, [open, onClose, anchor, align, width]);
  if (!open || !pos) return null;
  return (
    <div ref={ref} className="sbe-menu" style={{ position: "fixed", top: pos.top, left: pos.left, width }}>
      {children}
    </div>
  );
}

export function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label className="sbe-toggle">
        <span>{label}</span>
        <button type="button" role="switch" aria-checked={value} className="sbe-switch" data-on={value}
                onClick={() => onChange(!value)} style={{ border: 0, cursor: "pointer" }} />
      </label>
      {help && <div className="sbe-help">{help}</div>}
    </div>
  );
}

/** A text box that only tells the document when the person is done typing a value. */
export function TextInput({ value, onChange, placeholder, type = "text", className = "sbe-in", ariaLabel, onCommit }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string;
  ariaLabel?: string; onCommit?: (v: string) => void;
}) {
  return (
    <input className={className} type={type} value={value} placeholder={placeholder} aria-label={ariaLabel}
           onChange={(e) => onChange(e.target.value)}
           onBlur={(e) => onCommit?.(e.target.value)}
           onKeyDown={(e) => { if (e.key === "Enter" && onCommit) (e.target as HTMLInputElement).blur(); }} />
  );
}

export function confirmAction(message: string): boolean {
  return typeof window !== "undefined" && window.confirm(message);
}
