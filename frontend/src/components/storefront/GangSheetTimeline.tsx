"use client";

/**
 * Shared progress timeline for a gang sheet order — used on both the admin
 * review and the customer history so a job's stage reads the same to everyone.
 *
 * The linear path is Submitted → In review → Approved → In production →
 * Completed. Revision-requested and rejected are branch outcomes, shown as a
 * badge instead of a step so the bar never implies a rejected job is "in
 * production".
 */
import type { GangSheetStatus } from "@/services/gangSheets.service";
import { GANG_SHEET_STATUS_LABEL } from "@/services/gangSheets.service";

const LINEAR: GangSheetStatus[] = ["submitted", "in_review", "approved", "production", "completed"];

export function GangSheetTimeline({ status, timeline }: { status: GangSheetStatus; timeline?: GangSheetStatus[] }) {
  const steps = (timeline && timeline.length ? timeline : LINEAR);
  const branch = status === "revision_requested" || status === "rejected";
  // For a branch outcome, progress reflects how far it got before branching:
  // revision sits back at review; rejected stops after review.
  const activeIdx = branch ? steps.indexOf("in_review") : steps.indexOf(status);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx && !branch;
          const color = done ? "#166534" : current ? "var(--brand-primary, #1C3557)" : "#D6D3CC";
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "0 0 auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: done || current ? color : "#fff", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "11px", fontWeight: 700 }}>
                  {done ? "✓" : ""}
                </div>
                <span style={{ fontSize: "10px", color: done || current ? "#333" : "#9CA3AF", fontWeight: current ? 700 : 500, whiteSpace: "nowrap" }}>
                  {GANG_SHEET_STATUS_LABEL[s]}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: "2px", background: i < activeIdx ? "#166534" : "#E4E1DB", margin: "0 4px", marginBottom: "16px" }} />
              )}
            </div>
          );
        })}
      </div>
      {branch && (
        <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, color: status === "rejected" ? "#991B1B" : "#9A3412" }}>
          {status === "rejected" ? "✕ Rejected" : "↩ Revision requested — awaiting your update"}
        </div>
      )}
    </div>
  );
}
