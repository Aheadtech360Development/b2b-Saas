"use client";

/**
 * The frame around the owner's five setup steps (design screens 7 to 11): the
 * navy bar with the free period, the steps down the left, and one card for the
 * step in hand. The step itself draws what goes inside the card and its own
 * buttons; this only knows where the owner is and how far they have been.
 */
import type { ReactNode } from "react";
import { authFonts } from "@/components/auth/AuthPage";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import o from "./onboarding.module.css";

export const STEP_NAMES = [
  "Your business",
  "Brand your store",
  "Add products",
  "Get paid and ship",
  "Go live",
] as const;

export function OnboardingFrame({
  step,
  reached,
  trialDays,
  onStep,
  exit,
  title,
  sub,
  children,
  actions,
}: {
  /** The step on screen, 1 to 5. */
  step: number;
  /** The furthest step the owner has opened: steps up to it can be revisited. */
  reached: number;
  /** Days left of the free period; the design's "14" before the shop exists. */
  trialDays: number | null;
  onStep?: (n: number) => void;
  /** A way out to the admin, once there is a shop to go to. */
  exit?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`${o.page} ${authFonts}`}>
      <header className={o.top}>
        {/* The navy bar: the off-white wordmark. */}
        <PlatformLogo onDark width={180} />
        <span className={o.topTrial}>
          {trialDays === null
            ? null
            : trialDays > 0
              ? `Free trial: ${trialDays} ${trialDays === 1 ? "day" : "days"}`
              : "Free trial ended"}
          {exit}
        </span>
      </header>

      <div className={o.wrap}>
        <aside className={o.aside} aria-label="Setup steps">
          <ol className={o.steps}>
            {STEP_NAMES.map((name, i) => {
              const n = i + 1;
              const on = n === step;
              const done = !on && n <= reached;
              return (
                <li key={name}>
                  <button
                    type="button"
                    className={o.stepBtn}
                    disabled={!onStep || n > reached || on}
                    onClick={() => onStep?.(n)}
                    aria-current={on ? "step" : undefined}
                  >
                    <span className={`${o.num} ${on ? o.numOn : done ? o.numDone : ""}`}>{n}</span>
                    <span className={`${o.stepLabel} ${on ? o.stepLabelOn : done ? o.stepLabelDone : ""}`}>{name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className={o.asideNote}>Your progress saves. Skip anything you are not ready for.</p>
        </aside>

        <main className={o.main}>
          <section className={o.card}>
            <div className={o.eyebrow}>Step {step} of {STEP_NAMES.length}</div>
            <h1 className={o.h1}>{title}</h1>
            {sub ? <p className={o.sub}>{sub}</p> : null}
            <div className={o.content}>{children}</div>
            {actions ? <div className={o.actions}>{actions}</div> : null}
          </section>
        </main>
      </div>
    </div>
  );
}

export { o as onboardingStyles };
export default OnboardingFrame;
