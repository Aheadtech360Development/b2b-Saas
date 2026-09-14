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
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CopilotChat } from "@/components/admin/CopilotChat";

export function CopilotDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close when moving to another screen; the answer belonged to the last one.
  useEffect(() => { setOpen(false); }, [pathname]);

  if (pathname?.startsWith("/admin/dashboard")) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Ask the copilot" style={S.fab}>
        <span aria-hidden>✦</span> Ask
      </button>
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
  fab: { position: "fixed", right: "20px", bottom: "20px", zIndex: 70, display: "flex", alignItems: "center", gap: "8px", padding: "11px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "999px", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.18)" },
  panel: { position: "fixed", right: "16px", bottom: "16px", zIndex: 70, width: "min(420px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 32px))", background: "#fff", border: "1px solid #E3E3E3", borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #EDEDEA" },
  close: { border: "none", background: "none", fontSize: "15px", cursor: "pointer", color: "#6B6B6B" },
  body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 16px 14px" },
};
