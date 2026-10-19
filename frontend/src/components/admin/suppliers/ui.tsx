"use client";

/** Small shared pieces for the Manage Suppliers screens, in the admin's look
 *  (the .pc-* colours, line and font from admin-shell.css). */
import type { CSSProperties, ReactNode } from "react";
import type { SupplierJob } from "@/services/suppliers.service";

export const CARD: CSSProperties = {
  background: "#FFF", border: "1px solid var(--pc-line, #E3E8EF)", borderRadius: 12, padding: 16,
};
export const MUTED: CSSProperties = { fontSize: 13, color: "var(--pc-muted, #5F6B7A)", margin: 0, lineHeight: 1.55 };
export const INPUT: CSSProperties = {
  height: 36, border: "1px solid var(--pc-line, #E3E8EF)", borderRadius: 8, padding: "0 10px", fontSize: 13,
  background: "#FFF", color: "var(--pc-ink, #0F1B2D)", minWidth: 0, fontFamily: "var(--pc-sans)",
};
export const LABEL: CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--pc-ink-2, #344054)", marginBottom: 6 };

export function errText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";
}

export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return withTime
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size, border: "2px solid var(--pc-line, #E3E8EF)",
      borderTopColor: "var(--pc-blue, #1D5FD6)", borderRadius: "50%", animation: "spin 0.7s linear infinite", verticalAlign: "middle",
    }} />
  );
}

export function Badge({ text, color = "#344054" }: { text: string; color?: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: `${color}18`, color, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

export function Btn({
  children, onClick, kind = "primary", disabled, busy, title, type = "button",
}: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger";
  disabled?: boolean; busy?: boolean; title?: string; type?: "button" | "submit";
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--pc-blue, #1D5FD6)", color: "#FFF", border: "1px solid var(--pc-blue, #1D5FD6)" },
    ghost: { background: "#FFF", color: "var(--pc-ink, #0F1B2D)", border: "1px solid var(--pc-line, #E3E8EF)" },
    danger: { background: "#FFF", color: "var(--pc-red, #C8321F)", border: "1px solid #F5C2C0" },
  };
  const off = disabled || busy;
  return (
    <button type={type} onClick={onClick} disabled={off} title={title} style={{
      ...styles[kind], height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "var(--pc-sans)",
      cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.55 : 1, display: "inline-flex",
      alignItems: "center", gap: 6, whiteSpace: "nowrap",
    }}>
      {busy && <Spinner size={13} />}{children}
    </button>
  );
}

export function Toggle({ on, onChange, busy, title }: { on: boolean; onChange: () => void; busy?: boolean; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} disabled={busy} title={title} style={{
      width: 38, height: 22, borderRadius: 11, border: "none", padding: 2, cursor: busy ? "wait" : "pointer",
      background: on ? "var(--pc-blue, #1D5FD6)" : "#D0D5DD", transition: "background .15s", opacity: busy ? 0.6 : 1,
      display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start",
    }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#FFF", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

const KIND_LABEL: Record<SupplierJob["kind"], string> = {
  import: "Import", inventory: "Stock sync", sync: "Full sync",
};

export function JobBanner({ job, onDismiss }: { job: SupplierJob; onDismiss?: () => void }) {
  const running = job.status === "running";
  const tone = running ? "#1D5FD6" : job.status === "completed" ? "#0F7B4B" : "#C8321F";
  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
  const errors = job.summary?.import?.errors ?? [];
  const title = running
    ? `${KIND_LABEL[job.kind]} running${job.trigger === "schedule" ? " (scheduled)" : ""}`
    : job.status === "completed" ? `${KIND_LABEL[job.kind]} finished`
      : job.status === "interrupted" ? `${KIND_LABEL[job.kind]} was interrupted` : `${KIND_LABEL[job.kind]} failed`;

  return (
    <div style={{ ...CARD, borderColor: `${tone}55`, background: `${tone}0A`, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {running && <Spinner size={15} />}
        <div style={{ fontWeight: 700, fontSize: 13, color: tone }}>{title}</div>
        {pct !== null && running && <div style={{ fontSize: 12, color: "var(--pc-ink-2, #344054)" }}>{job.done} / {job.total}</div>}
        <div style={{ flex: 1 }} />
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted, #5F6B7A)", fontSize: 16 }}>×</button>
        )}
      </div>
      {job.message && <div style={{ fontSize: 13, color: "var(--pc-ink-2, #344054)", marginTop: 6 }}>{job.message}</div>}
      {job.status === "interrupted" && (
        <div style={{ fontSize: 12, color: "var(--pc-muted, #5F6B7A)", marginTop: 4 }}>
          The server restarted while this was running. Start it again — products already imported are skipped.
        </div>
      )}
      {running && pct !== null && (
        <div style={{ height: 6, background: "var(--pc-line-soft, #EEF1F5)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: tone, transition: "width .4s" }} />
        </div>
      )}
      {!running && errors.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--pc-red, #C8321F)" }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 12, fontSize: 13 }}>
      <Btn kind="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</Btn>
      <span style={{ color: "var(--pc-muted, #5F6B7A)" }}>Page {page} of {pages}</span>
      <Btn kind="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</Btn>
    </div>
  );
}

export function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 7, background: "#F8FAFC", border: "1px solid var(--pc-line, #E3E8EF)" }} />
  ) : (
    <div style={{ width: 44, height: 44, borderRadius: 7, background: "#F8FAFC", border: "1px solid var(--pc-line, #E3E8EF)" }} />
  );
}
