"use client";

/** Small shared pieces for the Manage Suppliers screens. */
import type { CSSProperties, ReactNode } from "react";
import type { SupplierJob } from "@/services/suppliers.service";

export const CARD: CSSProperties = {
  background: "#FFF", border: "1px solid #E3E3E3", borderRadius: 12, padding: 16,
};
export const MUTED: CSSProperties = { fontSize: 13, color: "#8A8A8A", margin: 0, lineHeight: 1.55 };
export const INPUT: CSSProperties = {
  height: 36, border: "1px solid #D4D4D4", borderRadius: 8, padding: "0 10px", fontSize: 13,
  background: "#FFF", color: "#1A1A1A", minWidth: 0,
};
export const LABEL: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 6 };

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
      display: "inline-block", width: size, height: size, border: "2px solid #E3E3E3",
      borderTopColor: "#1A1A1A", borderRadius: "50%", animation: "spin 0.7s linear infinite", verticalAlign: "middle",
    }} />
  );
}

export function Badge({ text, color = "#1A1A1A" }: { text: string; color?: string }) {
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
    primary: { background: "#1A1A1A", color: "#FFF", border: "1px solid #1A1A1A" },
    ghost: { background: "#FFF", color: "#1A1A1A", border: "1px solid #D4D4D4" },
    danger: { background: "#FFF", color: "#B42318", border: "1px solid #F5C2C0" },
  };
  const off = disabled || busy;
  return (
    <button type={type} onClick={onClick} disabled={off} title={title} style={{
      ...styles[kind], height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
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
      background: on ? "#16A34A" : "#D4D4D4", transition: "background .15s", opacity: busy ? 0.6 : 1,
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
  const tone = running ? "#2563EB" : job.status === "completed" ? "#16A34A" : "#B42318";
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
        {pct !== null && running && <div style={{ fontSize: 12, color: "#4A4A4A" }}>{job.done} / {job.total}</div>}
        <div style={{ flex: 1 }} />
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A8A", fontSize: 16 }}>×</button>
        )}
      </div>
      {job.message && <div style={{ fontSize: 13, color: "#4A4A4A", marginTop: 6 }}>{job.message}</div>}
      {job.status === "interrupted" && (
        <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 4 }}>
          The server restarted while this was running. Start it again — products already imported are skipped.
        </div>
      )}
      {running && pct !== null && (
        <div style={{ height: 6, background: "#E5E7EB", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: tone, transition: "width .4s" }} />
        </div>
      )}
      {!running && errors.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#B42318" }}>
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
      <span style={{ color: "#6B6B6B" }}>Page {page} of {pages}</span>
      <Btn kind="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</Btn>
    </div>
  );
}

export function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, background: "#F6F6F6" }} />
  ) : (
    <div style={{ width: 44, height: 44, borderRadius: 6, background: "#F2F2F2" }} />
  );
}
