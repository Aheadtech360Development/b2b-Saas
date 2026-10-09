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

const HIDE_KEY = "pc_trial_bar_hidden";

export function TrialBanner() {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [left, setLeft] = useState<Remaining | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDE_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  function dismiss() {
    setHidden(true);
    try { sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* private mode */ }
  }

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
  // The last day is told in hours: by then the hours are the story.
  const urgent = !over && (left?.days ?? 0) < 1;
  const soon = !over && !urgent && (left?.days ?? 0) <= 3;
  // Put away for this visit, while there is still time to spare. Once it is
  // the last day or past it, it stays: that is not news to be dismissed.
  if (hidden && !over && !urgent) return null;

  const remaining = over
    ? "Your free trial has ended"
    : !left
      ? "Free trial"
      : urgent
        ? `Free trial: ${left.hours} ${left.hours === 1 ? "hour" : "hours"} ${left.minutes} min left`
        : `Free trial: ${left.days} ${left.days === 1 ? "day" : "days"} left`;

  return (
    <div className="pc-trial" data-tone={over || urgent ? "over" : soon ? "soon" : undefined} role="status">
      <strong>{remaining}</strong>
      <span>
        {over
          ? "Your shop, products and orders are all still here. Pick a plan to keep going."
          : urgent ? "Ends today" : `Ends ${when(trial.ends_at)}`}
      </span>
      <Link href="/admin/billing">{over ? "Choose a plan" : "See plans"}</Link>
      {!over && !urgent && (
        <button type="button" className="pc-trial-x" aria-label="Hide this for now" onClick={dismiss}>×</button>
      )}
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "soon"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

export default TrialBanner;
