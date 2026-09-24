"use client";

/**
 * What a screen says when the shop's plan does not include it.
 *
 * Opening a screen that then fails with "Forbidden" reads as a broken
 * product. Saying which tier includes it, in the place the feature would have
 * been, reads as a price — which is the thing the shop can actually act on.
 */
import { useLock } from "@/lib/entitlements";

export function UpgradeNotice({ feature, children }: { feature: string; children?: React.ReactNode }) {
  const lock = useLock(feature);
  if (!lock) return <>{children}</>;

  return (
    <div style={S.wrap}>
      <div style={S.badge}>
        <LockIcon />
        {lock.upgrade_to ? `Included from ${lock.upgrade_to}` : "Not available"}
      </div>
      <h1 style={S.h1}>{lock.label}</h1>
      <p style={S.lede}>
        {lock.upgrade_to ? (
          <>
            This is part of the <strong>{lock.upgrade_to}</strong> plan. Your shop is on a
            plan that does not include it, so the screen is switched off rather than
            half-working.
          </>
        ) : (
          <>This feature has been switched off for your shop. Ask us and we can turn it back on.</>
        )}
      </p>
      {lock.upgrade_to && (
        <a href="/admin/billing" style={S.cta}>See plans and upgrade →</a>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    background: "#fff", border: "1px solid #E7E5E2", borderRadius: "14px",
    padding: "40px", maxWidth: "620px", margin: "8px auto",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  badge: {
    display: "inline-flex", alignItems: "center", gap: "6px", background: "#FFFBEB",
    border: "1px solid #FDE68A", color: "#B45309", borderRadius: "20px",
    padding: "4px 12px", fontSize: "11.5px", fontWeight: 700, marginBottom: "16px",
  },
  h1: { fontSize: "24px", fontWeight: 700, color: "#111318", margin: "0 0 10px", letterSpacing: "-.02em" },
  lede: { fontSize: "15px", color: "#5A5F68", lineHeight: 1.7, margin: "0 0 24px" },
  cta: {
    display: "inline-block", background: "#111318", color: "#fff", textDecoration: "none",
    fontWeight: 700, fontSize: "14.5px", padding: "12px 24px", borderRadius: "9px",
  },
};

export default UpgradeNotice;
