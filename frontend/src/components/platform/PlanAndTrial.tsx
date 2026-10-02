"use client";

/**
 * A brand's plan and its free period, both settable from here.
 *
 * The plan was already changeable through the API and nowhere on screen, so
 * a brand carrying a name the platform does not know — "standard", say —
 * quietly fell back to the smallest plan and lost features nobody could see
 * they had lost. The trial had nowhere at all: it existed as something a
 * person remembered.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { platformService, type TrialStatus } from "@/services/platform.service";

/** The plans the platform actually knows. Anything else falls back to the
 *  smallest one, which is why a brand on an unknown name loses its tools. */
const PLANS = [
  { key: "starter", label: "Starter", note: "$97/mo" },
  { key: "wholesale", label: "Wholesale", note: "$297/mo" },
  { key: "scale", label: "Scale", note: "$497/mo" },
];

export function PlanAndTrial({
  slug, plan, onPlanChanged,
}: {
  slug: string;
  /** What the brand is on now, as the console loaded it. */
  plan: string;
  onPlanChanged: () => void;
}) {
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [days, setDays] = useState("14");

  const load = useCallback(() => {
    platformService.getTrial(slug).then(setTrial).catch(() => setTrial(null));
  }, [slug]);

  useEffect(load, [load]);

  function announce(text: string) {
    setSaid(text);
    window.setTimeout(() => setSaid(null), 3000);
  }

  async function choosePlan(next: string) {
    if (next === current || busy) return;
    setBusy(next);
    setError(null);
    try {
      await platformService.updateTenant(slug, { plan: next });
      announce(`Moved to ${next}.`);
      onPlanChanged();
    } catch (e) {
      setError(e instanceof ApiClientError && e.message ? e.message : "Could not change the plan.");
    } finally {
      setBusy(null);
    }
  }

  async function runTrial(length: number) {
    setBusy("trial");
    setError(null);
    try {
      setTrial(await platformService.setTrial(slug, length));
      announce(length > 0 ? `Trial started: ${length} days.` : "Trial ended.");
    } catch (e) {
      setError(e instanceof ApiClientError && e.message ? e.message : "Could not change the trial.");
    } finally {
      setBusy(null);
    }
  }

  // An unknown name is shown as what it is rather than silently drawn as
  // Starter, because that is exactly the confusion this panel exists to end.
  const current = (plan || "").trim().toLowerCase();
  const known = PLANS.some((p) => p.key === current);

  return (
    <div style={S.card}>
      <div style={S.head}>Plan</div>

      {!known && current ? (
        <p style={{ ...S.note, color: "#B45309" }}>
          This brand is on <code>{plan}</code>, which is not one of the plans. It is being
          treated as Starter, so the wholesale tools are switched off. Pick one below.
        </p>
      ) : null}

      <div style={S.row}>
        {PLANS.map((p) => {
          const on = p.key === current;
          return (
            <button
              key={p.key}
              onClick={() => choosePlan(p.key)}
              disabled={busy !== null}
              style={{ ...S.plan, ...(on ? S.planOn : {}) }}
            >
              <span style={{ fontWeight: 700 }}>{p.label}</span>
              <span style={{ ...S.planNote, color: on ? "rgba(255,255,255,.7)" : "#8A8F99" }}>
                {busy === p.key ? "…" : p.note}
              </span>
            </button>
          );
        })}
      </div>

      <div style={S.rule} />

      <div style={S.head}>Free trial</div>
      {trial?.on_trial ? (
        <p style={S.note}>
          <b>{trial.days_left} {trial.days_left === 1 ? "day" : "days"} left.</b>{" "}
          Ends {when(trial.ends_at)}. The brand sees this at the top of its console, and is
          emailed on each of the last three days.
        </p>
      ) : trial?.expired ? (
        <p style={{ ...S.note, color: "#B45309" }}>
          The trial ended {when(trial.ends_at)}. Nothing was switched off — that is still
          your call.
        </p>
      ) : (
        <p style={S.note}>No trial running.</p>
      )}

      <div style={S.row}>
        <input
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
          style={S.days}
          aria-label="Days"
        />
        <button
          onClick={() => runTrial(Math.max(1, Number(days) || 14))}
          disabled={busy !== null}
          style={S.action}
        >
          {busy === "trial" ? "…" : trial?.on_trial ? "Restart from today" : "Start from today"}
        </button>
        {trial?.on_trial || trial?.expired ? (
          <button onClick={() => runTrial(0)} disabled={busy !== null} style={S.quiet}>
            End it
          </button>
        ) : null}
      </div>

      {error ? <p style={{ ...S.note, color: "#B91C1C" }}>{error}</p> : null}
      {said ? <p style={{ ...S.note, color: "#047857" }}>{said}</p> : null}
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const S: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff", border: "1px solid #E4E4E7", borderRadius: "12px",
    padding: "16px 18px", marginBottom: "22px",
  },
  head: {
    fontSize: "11px", fontWeight: 700, color: "#6B7280",
    textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px",
  },
  row: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  plan: {
    flex: "1 1 120px", display: "flex", flexDirection: "column", gap: "2px",
    padding: "10px 14px", borderRadius: "9px", border: "1px solid #E4E4E7",
    background: "#fff", color: "#18181B", cursor: "pointer",
    fontSize: "13px", fontFamily: "inherit", textAlign: "left",
  },
  planOn: { background: "#18181B", color: "#fff", borderColor: "#18181B" },
  planNote: { fontSize: "11.5px" },
  rule: { height: "1px", background: "#F0F0EC", margin: "18px 0 16px" },
  days: {
    width: "64px", padding: "9px 10px", borderRadius: "8px",
    border: "1px solid #E4E4E7", fontSize: "13px", fontFamily: "inherit",
    textAlign: "center",
  },
  action: {
    padding: "9px 16px", borderRadius: "8px", border: "none",
    background: "#18181B", color: "#fff", fontSize: "13px", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  quiet: {
    padding: "9px 14px", borderRadius: "8px", border: "1px solid #E4E4E7",
    background: "#fff", color: "#B91C1C", fontSize: "13px", cursor: "pointer",
    fontFamily: "inherit",
  },
  note: { fontSize: "12.5px", color: "#6B7280", margin: "0 0 12px", lineHeight: 1.6 },
};

export default PlanAndTrial;
