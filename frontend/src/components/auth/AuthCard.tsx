/**
 * The card every sign-in screen is built out of.
 *
 * It used to carry a navy that appears nowhere else on the platform and a
 * serif heading the rest of the product does not use, so the way in looked
 * like it came from a different company than the page that sent you there.
 * It is the platform's own look now — the tokens in globals.css, the same
 * ones the home page is built from — and on a brand's shop the colour comes
 * from that brand's theme.
 */
export function AuthCard({
  title,
  lede,
  children,
}: {
  title?: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
      <div className="ui-narrow" style={{ width: "100%" }}>
        {title && <h1 className="ui-h1">{title}</h1>}
        {lede && <p className="ui-lede">{lede}</p>}
        <div className="ui-card">{children}</div>
      </div>
    </div>
  );
}

/** Kept for the screens that still position a few things by hand. New work
 *  should reach for the `ui-` classes instead of these. */
export const authStyles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--ui-paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" },
  h1: { fontSize: "30px", fontWeight: 700, letterSpacing: "-.025em", lineHeight: 1.15, margin: "0 0 10px" },
  card: { background: "#fff", border: "1px solid var(--ui-line)", borderRadius: "14px", padding: "28px" },
  label: { display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "6px" },
  input: { width: "100%", background: "#fff", border: "1px solid var(--ui-line)", borderRadius: "10px", padding: "11px 13px", fontSize: "15px", boxSizing: "border-box", fontFamily: "inherit" },
  button: { width: "100%", background: "var(--brand-primary, var(--ui-ink))", color: "#fff", padding: "12px 24px", fontSize: "15px", fontWeight: 600, border: "none", borderRadius: "10px", fontFamily: "inherit", cursor: "pointer" },
  note: { fontSize: "14.5px", color: "var(--ui-muted)", lineHeight: 1.6, margin: "0 0 18px" },
  hintBad: { fontSize: "12.5px", color: "var(--ui-bad)", margin: "6px 0 0" },
  error: { background: "#FEF3F2", border: "1px solid #FECDCA", color: "var(--ui-bad)", padding: "12px 14px", fontSize: "13.5px", borderRadius: "10px", marginBottom: "18px", lineHeight: 1.55 },
  errorLink: { display: "block", marginTop: "6px", color: "var(--ui-bad)", fontWeight: 600 },
  primaryLink: { display: "block", textAlign: "center", fontSize: "15px", fontWeight: 600, color: "#fff", background: "var(--brand-primary, var(--ui-ink))", padding: "12px", borderRadius: "10px", textDecoration: "none" },
};

export default AuthCard;
