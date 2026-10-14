"use client";

/**
 * Small pieces the partner portal and the Affiliates tab share, drawn with
 * the design's own classes (partners.css, scoped under .pcp).
 */
import { createPortal } from "react-dom";
import { Outfit } from "next/font/google";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import "./partners.css";

// The design's display face, for headings and big numbers. Inter, the body
// face, is already loaded by the root layout.
const display = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--pcp-display" });

export const ROOT = `pcp ${display.variable}`;

export type IconName =
  | "activity" | "alert" | "arrow" | "ban" | "bell" | "bld" | "book" | "cal" | "card" | "cd" | "chart"
  | "check" | "checkc" | "cl" | "clock" | "copy" | "cr" | "dollar" | "download" | "edit" | "ext" | "eye"
  | "file" | "filter" | "flag" | "grid" | "help" | "history" | "home" | "image" | "info" | "layers" | "link"
  | "list" | "lock" | "logout" | "mail" | "mega" | "more" | "pause" | "percent" | "plus" | "qr" | "refresh"
  | "scale" | "search" | "send" | "shield" | "sliders" | "sort" | "trash" | "upload" | "user" | "users"
  | "wallet" | "x" | "zap";

export function Icon({ name, size }: { name: IconName; size?: "s" | "l" | "xl" }) {
  return <i className={`ic i-${name}${size ? ` ${size}` : ""}`} aria-hidden="true" />;
}

export type Tone = "ok" | "warn" | "bad" | "mut" | "navy" | "info";

export function Chip({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip${tone === "info" ? "" : ` ${tone}`}`}>{children}</span>;
}

export function Count({ n, tone }: { n: number | null | undefined; tone?: "warn" | "bad" | "mut" }) {
  if (!n) return null;
  return <span className={`cnt${tone ? ` ${tone}` : ""}`}>{n}</span>;
}

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <span className="sw">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

export function Field({ label, hint, error, children, htmlFor }: {
  label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="errt">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Banner({ tone, icon, children, action }: {
  tone?: "warn" | "bad" | "ok"; icon?: IconName; children: ReactNode; action?: ReactNode;
}) {
  return (
    <div className={`banner${tone ? ` ${tone}` : ""}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon ?? (tone === "ok" ? "checkc" : tone ? "alert" : "info")} />
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="pcp-skel" style={{ height: h, width: w }} />;
}

export function Empty({ icon, title, children, action }: {
  icon: IconName; title: string; children?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size="xl" />
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** A dialog over the page, in the design's modal. */
export function Modal({ title, sub, onClose, children, footer, wide }: {
  title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEscape(onClose);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`${ROOT} pcp-layer`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={box}
           style={wide ? { maxWidth: 640 } : undefined}>
        <div className="mh">
          <div>
            <h2>{title}</h2>
            {sub ? <p className="sm muted" style={{ marginTop: 4 }}>{sub}</p> : null}
          </div>
          <button className="btn gh ico sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="mb">{children}</div>
        {footer ? <div className="mf">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A panel from the right, in the design's drawer. */
export function Drawer({ title, chips, onClose, children, footer }: {
  title: string; chips?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEscape(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`${ROOT} pcp-side`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dh">
          <div className="col" style={{ gap: 8 }}>
            <h2>{title}</h2>
            {chips ? <div className="row" style={{ gap: 6 }}>{chips}</div> : null}
          </div>
          <button className="btn gh ico sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="db">{children}</div>
        {footer ? <div className="df">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}

/** A short message at the bottom of the screen that goes by itself. */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3200);
  }, []);
  const node = text ? <div className="pcp-toast" role="status">{text}</div> : null;
  return { show, node };
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function errorText(e: unknown, fallback = "That did not work. Try again."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
