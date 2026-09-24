/**
 * The small white card the sign-in pages are built out of.
 *
 * Shared so that asking for a reset link, following it, and signing in
 * afterwards look like three steps of one thing rather than three pages
 * written on different days.
 */
export function AuthCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={authStyles.page}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {title && <h1 style={authStyles.h1}>{title}</h1>}
        <div style={authStyles.card}>{children}</div>
      </div>
    </div>
  );
}

const font = "'DM Sans', sans-serif";

export const authStyles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8F8F6", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" },
  h1: { fontFamily: "'Fraunces', serif", fontSize: "31px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15, margin: "0 0 28px" },
  card: { background: "#FFFFFF", border: "1px solid #E2E2DE", padding: "36px" },
  label: { display: "block", fontFamily: font, fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".05em", color: "#1A1A1A", marginBottom: "6px" },
  input: { width: "100%", background: "#fff", border: "1px solid #E2E2DE", padding: "11px 14px", fontSize: "14px", color: "#1A1A1A", outline: "none", boxSizing: "border-box", fontFamily: font },
  button: { width: "100%", color: "#fff", padding: "14px", fontSize: "14px", fontWeight: 500, border: "none", fontFamily: font },
  note: { fontSize: "14px", color: "#6B6B6B", lineHeight: 1.6, margin: "0 0 18px" },
  hintBad: { fontSize: "12.5px", color: "#B42318", margin: "6px 0 0" },
  error: { background: "#fff0f0", border: "1px solid #fcc", padding: "12px 14px", fontSize: "13px", color: "#cc0000", marginBottom: "16px", fontFamily: font, lineHeight: 1.5 },
  errorLink: { display: "block", marginTop: "6px", color: "#cc0000", fontWeight: 600 },
  primaryLink: { display: "block", textAlign: "center", fontSize: "14px", fontWeight: 500, color: "#1C3557", border: "1px solid #1C3557", padding: "13px", textDecoration: "none", fontFamily: font },
};

export default AuthCard;
