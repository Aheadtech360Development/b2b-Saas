"use client";

/**
 * How much of the free period is left, above everything else.
 *
 * At the top of the console rather than on the billing page, because the
 * person it concerns is not on the billing page — they are working, and a
 * countdown nobody passes is a countdown nobody reads.
 *
 * It stays for the whole trial rather than appearing near the end. A brand
 * deciding whether to stay is deciding all fortnight, and a number that shows
 * up on day eleven reads as a warning rather than as information. It counts
 * down live off the end date, so the clock is the same one the emails and the
 * platform console are reading, and grows more insistent as the days go.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

interface Trial {
  on_trial: boolean;
  days_left: number | null;
  ends_at: string | null;
  expired: boolean;
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  over: boolean;
}

export function remainingUntil(iso: string | null): Remaining | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true };
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    over: false,
  };
}

export function TrialBanner() {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [left, setLeft] = useState<Remaining | null>(null);

  useEffect(() => {
    apiClient.get<{ trial?: Trial }>("/api/v1/admin/billing")
      .then((r) => setTrial(r.trial ?? null))
      .catch(() => {
        // The banner is not worth an error of its own: a shop whose billing
        // cannot be read still has work to do.
      });
  }, []);

  // Ticked here rather than taken from the server's day count, so the number
  // on screen keeps up with the clock on a console left open all afternoon.
  useEffect(() => {
    if (!trial?.ends_at) return;
    setLeft(remainingUntil(trial.ends_at));
    const id = window.setInterval(() => setLeft(remainingUntil(trial.ends_at)), 1000);
    return () => window.clearInterval(id);
  }, [trial?.ends_at]);

  if (!trial) return null;
  if (!trial.expired && !trial.on_trial) return null;

  const over = trial.expired || left?.over === true;
  // Red on the last day as well as after it: by then the hours are the story.
  const urgent = !over && (left?.days ?? 0) < 1;
  const soon = !over && !urgent && (left?.days ?? 0) <= 3;

  const tone = over
    ? { bg: "#FDF3F2", line: "#F3D6D3", fg: "#B3261E", chip: "#B3261E" }
    : urgent
      ? { bg: "#FDF3F2", line: "#F3D6D3", fg: "#B3261E", chip: "#B3261E" }
      : soon
        ? { bg: "#FDF7EC", line: "#F0E2C8", fg: "#8A5A00", chip: "#8A5A00" }
        : { bg: "#F7F7F5", line: "#E7E7E3", fg: "#3F4350", chip: "#18181B" };

  const spoken = over
    ? "Your free trial has ended."
    : left
      ? `${left.days} days, ${left.hours} hours and ${left.minutes} minutes left on your free trial.`
      : "Free trial running.";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
        background: tone.bg, border: `1px solid ${tone.line}`, borderRadius: "12px",
        padding: "12px 16px", marginBottom: "18px",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <span
        style={{
          fontSize: "10.5px", fontWeight: 700, letterSpacing: ".08em",
          textTransform: "uppercase", color: tone.fg, whiteSpace: "nowrap",
        }}
      >
        {over ? "Trial ended" : "Free trial"}
      </span>

      {/* Read out once as a sentence; the ticking digits themselves are not
          announced, or a screen reader would talk over every second. */}
      <span role="status" style={SR_ONLY}>{spoken}</span>

      {over ? (
        <span style={{ fontSize: "13.5px", color: tone.fg, fontWeight: 600, flex: 1 }}>
          Your shop, products and orders are all still here. Pick a plan to keep going.
        </span>
      ) : (
        <>
          <span aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: "6px" }}>
            <Unit value={left?.days ?? 0} label={left?.days === 1 ? "day" : "days"} color={tone.chip} wide />
            <Colon color={tone.line} />
            <Unit value={left?.hours ?? 0} label="hrs" color={tone.chip} />
            <Colon color={tone.line} />
            <Unit value={left?.minutes ?? 0} label="min" color={tone.chip} />
            <Colon color={tone.line} />
            <Unit value={left?.seconds ?? 0} label="sec" color={tone.chip} />
          </span>
          <span style={{ fontSize: "12.5px", color: tone.fg, opacity: 0.85, flex: 1, minWidth: "140px" }}>
            {urgent ? "Ends today" : `Ends ${when(trial.ends_at)}`}
          </span>
        </>
      )}

      <Link
        href="/admin/billing"
        style={{
          fontSize: "12.5px", fontWeight: 600, textDecoration: "none",
          color: "#fff",
          background: tone.chip,
          borderRadius: "8px", padding: "8px 15px", whiteSpace: "nowrap",
        }}
      >
        {over ? "Choose a plan" : "See plans"}
      </Link>
    </div>
  );
}

/** One segment of the clock: the number, and what it counts underneath. */
function Unit({ value, label, color, wide }: { value: number; label: string; color: string; wide?: boolean }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
      <span
        style={{
          fontSize: "19px", fontWeight: 700, lineHeight: 1.05, color,
          fontVariantNumeric: "tabular-nums",
          // Fixed width so the row does not twitch sideways once a second.
          minWidth: wide ? "30px" : "26px", textAlign: "center",
        }}
      >
        {wide ? value : String(value).padStart(2, "0")}
      </span>
      <span style={{ fontSize: "9px", letterSpacing: ".06em", textTransform: "uppercase", color, opacity: 0.6 }}>
        {label}
      </span>
    </span>
  );
}

function Colon({ color }: { color: string }) {
  return <span style={{ fontSize: "15px", color, paddingBottom: "13px", lineHeight: 1 }}>:</span>;
}

function when(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "soon"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

const SR_ONLY: React.CSSProperties = {
  position: "absolute", width: "1px", height: "1px", overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
};

export default TrialBanner;
