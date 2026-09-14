"use client";

/**
 * WorkingOverlay — what a long job looks like while it runs.
 *
 * Background removal and upscaling run in the browser and can take several
 * seconds on a large file, with nothing moving on screen. A label alone reads
 * as a frozen page, so this covers the thing being worked on with a moving
 * spinner, says which job is running, and warns that it takes a moment — the
 * three things that separate "working" from "stuck".
 *
 * `note` carries anything specific worth knowing, such as a first run paying to
 * fetch the model.
 */
export function WorkingOverlay({
  label,
  note,
  progress,
  absolute = true,
}: {
  label: string;
  note?: string;
  /** 0-1 when the step has a measurable size; a bar beats a guess. */
  progress?: number | null;
  /** Cover the nearest positioned ancestor (default) or the whole viewport. */
  absolute?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: absolute ? "absolute" : "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(255,255,255,.88)",
        backdropFilter: "blur(1.5px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <style>{`@keyframes atSpin { to { transform: rotate(360deg); } }`}</style>
      <span
        aria-hidden
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "50%",
          border: "3px solid #E3E3E3",
          borderTopColor: "#1A1A1A",
          animation: "atSpin .8s linear infinite",
        }}
      />
      <span style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{label}</span>
      {typeof progress === "number" && (
        <span style={{ width: "200px", height: "5px", borderRadius: "3px", background: "#E3E3E3", overflow: "hidden" }}>
          <span
            style={{
              display: "block", height: "100%", borderRadius: "3px", background: "#1A1A1A",
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              transition: "width .2s ease",
            }}
          />
        </span>
      )}
      <span style={{ fontSize: "12px", color: "#6B6B6B", maxWidth: "300px", lineHeight: 1.6 }}>
        {note ?? "This can take a few seconds — please don't close this window."}
      </span>
    </div>
  );
}
