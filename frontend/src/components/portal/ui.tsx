"use client";

/**
 * The customer portal's parts: page heading, chip, tabs, progress steps,
 * notices and a modal, drawn with the `.cp-*` classes in
 * app/(customer)/account/portal.css. A page is built from these so every
 * account page reads the same.
 */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import { ORDER_PILL } from "@/lib/customerWords";

/** A line icon from one SVG path (the design's icons are single paths). */
export function Icon({ d, size = 18, stroke = 1.75 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  gift: "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  home: "M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5 M9 21v-6h6v6",
  orders: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  jobs: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
  artwork: "M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  messages: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  quick: "M13 2 3 14h9l-1 8 10-12h-9z",
  price: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z M7 7h.01",
  quotes: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  reports: "M3 3v18h18 M7 16V10 M12 16V6 M17 16v-4",
  billing: "M2 5h20v14H2z M2 10h20",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z m9 2-3.5-3.5",
  cart: "M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  back: "M15 18l-6-6 6-6",
  check: "M5 12.5l4.5 4.5L19 7",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
} as const;

/** Eyebrow, title, one line under it, and the page's buttons on the right. */
export function PageHead({ eyebrow, title, sub, actions, back }: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="cp-back"><Icon d={ICONS.back} size={16} />{back.label}</Link>
      )}
      <div className="cp-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="cp-eyebrow">{eyebrow}</div>}
          <h1 className="cp-h1">{title}</h1>
          {sub && <p className="cp-sub">{sub}</p>}
        </div>
        {actions && <div className="cp-head-actions">{actions}</div>}
      </div>
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";

export function Chip({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return <span className="cp-chip" data-tone={tone}>{children}</span>;
}

const PILL_TONE: Record<string, Tone> = { amber: "warn", blue: "info", green: "ok", red: "bad" };

/** An order's status, in the same words as the shop's order list. */
export function OrderChip({ status }: { status: string }) {
  const [label, tone] = ORDER_PILL[status] ?? [words(status), ""];
  return <Chip tone={PILL_TONE[tone] ?? "mute"}>{label}</Chip>;
}

const PAY: Record<string, [string, Tone]> = {
  paid: ["Paid", "ok"],
  unpaid: ["Unpaid", "warn"],
  pending: ["Payment pending", "warn"],
  partially_paid: ["Part paid", "warn"],
  partial: ["Part paid", "warn"],
  refunded: ["Refunded", "mute"],
  partially_refunded: ["Part refunded", "mute"],
  failed: ["Payment failed", "bad"],
};

export function PaymentChip({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const [label, tone] = PAY[status] ?? [words(status), "mute" as Tone];
  return <Chip tone={tone}>{label}</Chip>;
}

/** "screen_printer" → "Screen printer". */
export function words(s: string | null | undefined): string {
  const t = (s ?? "").replace(/_/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
}

/** A row of tabs: links when they change the address, buttons when they do not. */
export function Tabs({ tabs, label }: {
  label: string;
  tabs: { key: string; label: string; href?: string; onClick?: () => void; on: boolean; count?: number | null }[];
}) {
  return (
    <div className="cp-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const inner = (
          <>
            {t.label}
            {t.count != null && <span className="cp-cnt">{t.count}</span>}
          </>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} className="cp-tab" aria-current={t.on ? "page" : undefined}>{inner}</Link>
        ) : (
          <button key={t.key} type="button" role="tab" className="cp-tab" aria-selected={t.on} onClick={t.onClick}>{inner}</button>
        );
      })}
    </div>
  );
}

/** Progress along fixed steps: done up to `at`, `at` itself current. */
export function Steps({ steps, at, finished = false }: { steps: string[]; at: number; finished?: boolean }) {
  return (
    <ol className="cp-steps" aria-label="Progress" style={{ listStyle: "none", margin: 0 }}>
      {steps.map((s, i) => {
        const state = i < at || (finished && i === at) ? "done" : i === at ? "on" : "todo";
        return (
          <li key={s} className="cp-step" data-state={state} aria-current={state === "on" ? "step" : undefined}>
            <span className="cp-step-dot">{state === "done" && <Icon d={ICONS.check} size={14} stroke={2.5} />}</span>
            <span className="cp-step-l">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Banner({ tone = "info", children, onRetry }: { tone?: Tone; children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="cp-banner" data-tone={tone} role={tone === "bad" ? "alert" : "status"}>
      <span>{children}</span>
      {onRetry && <button type="button" className="cp-btn cp-btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="cp-empty"><strong>{title}</strong>{children}</div>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <div className="cp-loading">{what}…</div>;
}

/** A dialog over the page; Escape and the backdrop close it. */
export function Modal({ title, onClose, children, foot, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cp-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cp-modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 760 } : undefined}>
        <div className="cp-modal-head">
          <h2 className="cp-h3">{title}</h2>
          <button type="button" className="cp-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="cp-modal-body">{children}</div>
        {foot && <div className="cp-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/** A number the API sends as a string ("12.50") or a number. */
export const num = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};

/** Save one of an order's PDFs (invoice, confirmation, …) under its number. */
export async function saveOrderPdf(
  orderId: string,
  type: "confirmation" | "invoice" | "ship-confirmation" | "pack-slip",
  orderNumber?: string | null,
): Promise<boolean> {
  try {
    const blob = await apiClient.blob(`/api/v1/orders/${orderId}/pdf/${type}`);
    saveBlob(blob, `${type}-${orderNumber || orderId}.pdf`);
    return true;
  } catch {
    return false;
  }
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rows to a CSV file, quoted the way spreadsheets read them. */
export function saveCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  saveBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), name);
}
