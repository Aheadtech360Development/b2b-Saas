"use client";

/**
 * How much of the free period is left, above everything else.
 *
 * At the top of the console rather than on the billing page, because the
 * person it concerns is not on the billing page — they are working, and a
 * countdown nobody passes is a countdown nobody reads.
 *
 * It grows more insistent as the days run out and says nothing at all while
 * there is plenty of time, so it stays worth noticing when it matters.
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

/** Said from this many days out. Before that it is not news. */
const SPEAK_FROM = 7;

export function TrialBanner() {
  const [trial, setTrial] = useState<Trial | null>(null);

  useEffect(() => {
    apiClient.get<{ trial?: Trial }>("/api/v1/admin/billing")
      .then((r) => setTrial(r.trial ?? null))
      .catch(() => {
        // The banner is not worth an error of its own: a shop whose billing
        // cannot be read still has work to do.
      });
  }, []);

  if (!trial) return null;
  const left = trial.days_left ?? 0;
  if (!trial.expired && (!trial.on_trial || left > SPEAK_FROM)) return null;

  const urgent = trial.expired || left <= 3;
  const tone = trial.expired
    ? { bg: "#FDF3F2", line: "#F3D6D3", fg: "#B3261E" }
    : urgent
      ? { bg: "#FDF7EC", line: "#F0E2C8", fg: "#8A5A00" }
      : { bg: "#F7F7F5", line: "#E7E7E3", fg: "#4A4E57" };

  const text = trial.expired
    ? "Your free trial has ended. Your shop, products and orders are all still here."
    : left === 0
      ? "Your free trial ends today."
      : left === 1
        ? "One day left on your free trial."
        : `${left} days left on your free trial.`;

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        background: tone.bg, border: `1px solid ${tone.line}`, borderRadius: "10px",
        padding: "11px 16px", marginBottom: "16px",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: "13.5px", color: tone.fg, fontWeight: urgent ? 600 : 400, flex: 1 }}>
        {text}
      </span>
      <Link
        href="/admin/billing"
        style={{
          fontSize: "13px", fontWeight: 600, textDecoration: "none",
          color: urgent ? "#fff" : tone.fg,
          background: urgent ? tone.fg : "transparent",
          border: urgent ? "none" : `1px solid ${tone.line}`,
          borderRadius: "7px", padding: "7px 14px", whiteSpace: "nowrap",
        }}
      >
        Choose a plan
      </Link>
    </div>
  );
}

export default TrialBanner;
