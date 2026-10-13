"use client";

/**
 * CopilotDock — the copilot on every admin screen, as a drawer under the bar.
 *
 * A question usually occurs to someone while they are in the middle of
 * something: looking at an order, halfway through the products list. So it
 * opens over whatever page is open, says which one it is looking at, and sends
 * that with each question, so "which of these are late?" can be answered.
 *
 * It is opened by the Copilot button in the bar at the top of every page and
 * stays as it was left from one page to the next.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { CopilotChat, COPILOT_SUGGESTIONS } from "@/components/admin/CopilotChat";
import { useCopilotStore } from "@/stores/copilot.store";

/** What the open screen calls itself: its eyebrow and heading ("Orders: Ship
 *  queue"), read from the page, so a new screen needs nothing added here. */
function screenWords(): string {
  if (typeof document === "undefined") return "";
  // Home's heading is the day ("Today"); its name is Home.
  if (window.location.pathname.startsWith("/admin/dashboard")) return "Home";
  const h1 = document.querySelector(".pc-page .pc-h1, main .pc-h1")?.textContent?.trim() ?? "";
  const eyebrow = document.querySelector(".pc-page .pc-eyebrow, main .pc-eyebrow")?.textContent?.trim() ?? "";
  if (!h1) return eyebrow;
  const place = eyebrow && eyebrow.toLowerCase() !== h1.toLowerCase() ? `${eyebrow.charAt(0)}${eyebrow.slice(1).toLowerCase()}: ` : "";
  return `${place}${h1}`.slice(0, 120);
}

/** A question worth offering on this kind of screen, first among the chips. */
function chipFor(path: string): string | null {
  if (path.startsWith("/admin/orders")) return "Which orders are late?";
  if (path.startsWith("/admin/production") || path.startsWith("/admin/gang-sheets")) return "Which print jobs are waiting?";
  if (path.startsWith("/admin/products") || path.startsWith("/admin/inventory")) return "Which products are low on stock?";
  if (path.startsWith("/admin/customers") || path.startsWith("/admin/messages")) return "Who owes me money?";
  return null;
}

export function CopilotDock() {
  // Open/closed is remembered too: clicking an order from an answer and coming
  // back should leave the dock as it was, not shut it.
  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);
  const pathname = usePathname();
  const sp = useSearchParams();
  const [looking, setLooking] = useState("");
  // Just under the top bar, which the trial banner pushes down until the page scrolls.
  const [top, setTop] = useState(76);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const bar = document.querySelector(".pc-top")?.getBoundingClientRect().bottom ?? 64;
      setTop(Math.max(12, Math.round(bar) + 12));
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [open]);

  // The heading is drawn by the page after it loads: read it once it is there.
  useEffect(() => {
    if (!open) return;
    setLooking(screenWords());
    const t = window.setTimeout(() => setLooking(screenWords()), 900);
    return () => window.clearTimeout(t);
  }, [open, pathname, sp]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, setOpen]);

  const page = useCallback(() => screenWords() || looking, [looking]);
  if (!open) return null;

  const first = chipFor(pathname ?? "");
  const chips = [first, ...COPILOT_SUGGESTIONS.slice(0, 2)].filter((c, i, all): c is string => !!c && all.indexOf(c) === i).slice(0, 3);

  return (
    <aside role="dialog" aria-label="Copilot" className="pc-cp" data-copilot-dock style={{ "--pc-cp-top": `${top}px` } as CSSProperties}>
      <div className="pc-cp-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="pc-h2">Copilot</h2>
          <div className="pc-sub-line" data-looking-at style={{ fontSize: "13px" }}>Looking at: {looking || "this page"}</div>
        </div>
        <button type="button" className="pc-x" aria-label="Close the copilot" onClick={() => setOpen(false)}><X size={18} strokeWidth={2.2} /></button>
      </div>
      <CopilotChat page={page} chips={chips} />
    </aside>
  );
}
