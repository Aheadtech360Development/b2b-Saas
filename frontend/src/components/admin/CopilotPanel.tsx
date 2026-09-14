"use client";

/**
 * CopilotPanel — the owner's "what should I do today?" and a place to ask.
 *
 * The list on the left is computed on the server from the brand's own data, so
 * it shows even when the AI is switched off; every number on it matches the
 * screen its link opens. The chat on the right asks the copilot, which answers
 * only from lookups against the same data.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { CopilotChat } from "@/components/admin/CopilotChat";

type Severity = "urgent" | "attention" | "info";

interface BriefingItem {
  key: string;
  severity: Severity;
  count: number;
  amount?: number;
  title: string;
  detail: string;
  href: string;
}

interface Briefing {
  generated_at: string;
  ai_enabled: boolean;
  pulse: { orders_today: number; revenue_today: number; orders_7d: number; revenue_7d: number };
  items: BriefingItem[];
}

const TONE: Record<Severity, { dot: string; label: string }> = {
  urgent: { dot: "#DC2626", label: "Urgent" },
  attention: { dot: "#D97706", label: "Needs attention" },
  info: { dot: "#6B7280", label: "Worth a look" },
};

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CopilotPanel() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [briefError, setBriefError] = useState(false);

  useEffect(() => {
    apiClient.get<Briefing>("/api/v1/admin/copilot/briefing")
      .then(setBrief)
      .catch(() => setBriefError(true));
  }, []);

  return (
    <div style={S.wrap}>
      {/* ── Today ─────────────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.head}>
          <div>
            <div style={S.kicker}>AI Copilot</div>
            <div style={S.title}>Today&apos;s priorities</div>
          </div>
          {brief && (
            <div style={S.pulse}>
              <span><strong>{brief.pulse.orders_today}</strong> orders today · {money(brief.pulse.revenue_today)}</span>
              <span style={{ color: "#8A8A8A" }}>7 days: {brief.pulse.orders_7d} · {money(brief.pulse.revenue_7d)}</span>
            </div>
          )}
        </div>

        {!brief && !briefError && (
          <div>{[88, 72, 80].map((w, i) => <div key={i} className="at-skel" style={{ height: "46px", width: `${w}%`, marginBottom: "10px", borderRadius: "8px" }} />)}</div>
        )}
        {briefError && <div style={S.muted}>Couldn&apos;t load today&apos;s priorities. Reload to try again.</div>}
        {brief && brief.items.length === 0 && (
          <div style={S.allClear}>
            <strong>Nothing needs you right now.</strong>
            <span style={{ color: "#6B6B6B" }}> No jobs waiting for review, no late or unpaid orders, and stock is fine.</span>
          </div>
        )}
        {brief && brief.items.length > 0 && (
          <div style={{ display: "grid", gap: "8px" }}>
            {brief.items.map((it) => (
              <Link key={it.key} href={it.href} style={S.item}>
                <span title={TONE[it.severity].label} style={{ ...S.dot, background: TONE[it.severity].dot }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={S.itemTitle}>{it.title}</span>
                  <span style={S.itemDetail}>{it.detail}</span>
                </span>
                <span style={S.go}>Open →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Ask ───────────────────────────────────────────────────────────── */}
      <div style={{ ...S.card, display: "flex", flexDirection: "column", minHeight: "340px" }}>
        <div style={S.kicker}>Ask your store</div>
        <div style={{ ...S.title, marginBottom: "10px" }}>Ask anything about orders, sales or print jobs</div>

        {brief && !brief.ai_enabled ? (
          <div style={S.muted}>
            The AI chat isn&apos;t switched on for this platform yet. Today&apos;s priorities still work without it.
          </div>
        ) : (
          <CopilotChat />
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px", marginBottom: "24px" },
  card: { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px", padding: "18px 20px", minWidth: 0 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "14px" },
  kicker: { fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8A8A8A" },
  title: { fontSize: "16px", fontWeight: 700, color: "#1A1A1A", marginTop: "2px" },
  pulse: { display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "12px", color: "#1A1A1A", gap: "2px" },
  item: { display: "flex", alignItems: "center", gap: "12px", padding: "11px 12px", border: "1px solid #EDEDEA", borderRadius: "10px", textDecoration: "none", color: "inherit", background: "#FCFCFB" },
  dot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0 },
  itemTitle: { display: "block", fontSize: "13px", fontWeight: 700, color: "#1A1A1A" },
  itemDetail: { display: "block", fontSize: "12px", color: "#6B6B6B", marginTop: "2px", lineHeight: 1.45 },
  go: { fontSize: "12px", fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" },
  allClear: { background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "14px", fontSize: "13px", color: "#166534" },
  muted: { fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 },
};
