"use client";

/**
 * CopilotDock — the copilot on every admin screen, not just the dashboard.
 *
 * A question usually occurs to someone while they are in the middle of
 * something: looking at an order, halfway through the products list. Making
 * them go back to the dashboard to ask is how a feature stops being used, so it
 * sits in the corner of every admin page instead.
 *
 * The dashboard has the full panel already, so the dock stays out of its way.
 */
import { usePathname } from "next/navigation";
import { CopilotChat } from "@/components/admin/CopilotChat";
import { useCopilotStore } from "@/stores/copilot.store";

export function CopilotDock() {
  const pathname = usePathname();
  // Open/closed is remembered too: clicking an order from an answer and coming
  // back should leave the dock as it was, not shut it.
  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);

  if (pathname?.startsWith("/admin/dashboard")) return null;

  if (!open) {
    return (
      <div style={S.fabWrap}>
        {/* The gold ring is a conic gradient on a square behind the button,
            spun slowly. Animating a rotation is cheap for the browser, where
            animating a border is not — and it stops for anyone who has asked
            the system for less motion. */}
        <style>{`
          @keyframes atAskSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
          @keyframes atAskGlow {
            0%, 100% { box-shadow: 0 6px 22px rgba(0,0,0,.28), 0 0 0 rgba(201,162,39,0); }
            50%      { box-shadow: 0 6px 22px rgba(0,0,0,.28), 0 0 18px rgba(201,162,39,.45); }
          }
          .at-ask-ring::before {
            content: ""; position: absolute; left: 50%; top: 50%;
            width: 260px; height: 260px; transform: translate(-50%, -50%);
            background: conic-gradient(
              #8A6D1E 0deg, #C9A227 60deg, #F7E39B 110deg, #C9A227 160deg,
              #4A3A12 230deg, #8A6D1E 300deg, #F7E39B 360deg);
            animation: atAskSpin 4.5s linear infinite;
          }
          .at-ask-ring { animation: atAskGlow 4.5s ease-in-out infinite; }
          .at-ask-ring:hover { animation-duration: 2s; }
          .at-ask-ring:hover::before { animation-duration: 1.8s; }
          @media (prefers-reduced-motion: reduce) {
            .at-ask-ring, .at-ask-ring::before { animation: none; }
          }
        `}</style>
        <span className="at-ask-ring" style={S.ring}>
          <button onClick={() => setOpen(true)} aria-label="Ask the copilot" style={S.fab}>
            <span aria-hidden style={S.spark}>✦</span>
            <span style={S.askText}>Ask</span>
          </button>
        </span>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="AI Copilot" style={S.panel}>
      <div style={S.head}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8A8A8A" }}>AI Copilot</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>Ask your store</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close" style={S.close}>✕</button>
      </div>
      <div style={S.body}>
        <CopilotChat compact />
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  // The button sits inside a gold ring: the ring is the visible border, so the
  // button itself only has to be the dark face on top of it.
  fabWrap: { position: "fixed", right: "20px", bottom: "20px", zIndex: 70, lineHeight: 0 },
  ring: { position: "relative", display: "inline-block", padding: "2px", borderRadius: "999px", overflow: "hidden", isolation: "isolate" },
  fab: {
    position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "8px",
    padding: "11px 20px", borderRadius: "999px", border: "none", cursor: "pointer",
    background: "linear-gradient(160deg, #1E1E1E 0%, #0C0C0C 100%)",
    color: "#F3E7C4", fontSize: "13px", fontWeight: 700, letterSpacing: ".01em",
  },
  spark: { color: "#E8C566", fontSize: "13px" },
  askText: { background: "linear-gradient(100deg, #FFF6DC, #E3C271)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  panel: { position: "fixed", right: "16px", bottom: "16px", zIndex: 70, width: "min(420px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 32px))", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #EDEDEA" },
  close: { border: "none", background: "none", fontSize: "15px", cursor: "pointer", color: "#6B6B6B" },
  body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 16px 14px" },
};
