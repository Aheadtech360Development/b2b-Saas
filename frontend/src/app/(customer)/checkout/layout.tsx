"use client";

/**
 * The steps across the top of a checkout.
 *
 * It was a row of words joined by arrows, where the current one was
 * underlined — no sense of how far along you were, and nothing to say which
 * steps you had already finished. Numbered now, ticked once passed, on the
 * platform's own tokens, with the colour coming from the shop's theme.
 */
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Three steps, not four. The payment step only asked which kind of payment and
// then said the card comes next — and the card is on the review page, where
// somebody can see what they are paying for while they type it. A whole screen
// between a buyer and their order, to tell them about the screen after it.
const STEPS = [
  { label: "Shipping", step: 1 },
  { label: "Review & pay", step: 2 },
  { label: "Done", step: 3 },
];

function getActiveStep(pathname: string): number {
  if (pathname.includes("/checkout/confirmed")) return 3;
  if (pathname.includes("/checkout/review") || pathname.includes("/checkout/payment")) return 2;
  return 1;
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = getActiveStep(pathname);
  // The invoice page is reached from an email, not from the checkout, so it
  // has no steps behind it to show.
  const bare = pathname.includes("/checkout/invoice");

  return (
    <div className="ui-page">
      {!bare && (
        <div style={{ background: "#fff", borderBottom: "1px solid var(--ui-line)", padding: "18px 0" }}>
          <div className="ui-wrap">
            <div className="ui-steps" style={{ marginBottom: 0 }}>
              {STEPS.map((s, i) => {
                const done = active > s.step;
                const on = active === s.step;
                return (
                  <div key={s.label} style={{ display: "contents" }}>
                    <div className={`ui-step${on ? " ui-step-on" : ""}${done ? " ui-step-done" : ""}`}>
                      <span className="ui-step-n">{done ? "✓" : s.step}</span>
                      <span>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <span className="ui-step-sep" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
