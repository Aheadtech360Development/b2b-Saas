/**
 * The platform's own header and footer, for its pages that are not the
 * landing page — signing in, asking for a reset link, setting a new password.
 *
 * Those pages carried no header and no footer at all: on the platform's own
 * address they looked like a form floating on a blank tab, with no way back to
 * anything. The landing page and the sign-up flow bring their own, so they are
 * left alone.
 */
import Link from "next/link";

export function PlatformHeader() {
  return (
    <header style={S.top}>
      <Link href="/" style={S.logo}><span style={S.mark} aria-hidden />PrintCopilot</Link>
      <nav style={S.nav}>
        <Link href="/#pricing" style={S.link}>Pricing</Link>
        <Link href="/#contact" style={S.link}>Contact</Link>
        <Link href="/signup" style={S.cta}>Start your shop</Link>
      </nav>
    </header>
  );
}

export function PlatformFooter() {
  return (
    <footer style={S.foot}>
      <span>© {new Date().getFullYear()} PrintCopilot</span>
      <span style={S.footLinks}>
        <Link href="/#pricing" style={S.footLink}>Pricing</Link>
        <Link href="/#contact" style={S.footLink}>Contact</Link>
        <a href="mailto:support@printcopilot.co" style={S.footLink}>support@printcopilot.co</a>
      </span>
    </footer>
  );
}

const font = "'DM Sans', system-ui, sans-serif";

const S: Record<string, React.CSSProperties> = {
  top: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
    padding: "16px 24px", borderBottom: "1px solid #E7E5E2", background: "#fff",
    fontFamily: font, flexWrap: "wrap",
  },
  logo: {
    display: "flex", alignItems: "center", gap: "9px", fontWeight: 700, fontSize: "17px",
    color: "#111318", textDecoration: "none", letterSpacing: "-.02em",
  },
  mark: { width: 21, height: 21, borderRadius: 5, background: "#111318", display: "block" },
  nav: { display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" },
  link: { color: "#5A5F68", textDecoration: "none", fontSize: "14.5px" },
  cta: {
    background: "#111318", color: "#fff", textDecoration: "none", fontSize: "14.5px",
    fontWeight: 600, padding: "9px 18px", borderRadius: "8px",
  },
  foot: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
    padding: "22px 24px", borderTop: "1px solid #E7E5E2", background: "#fff",
    fontFamily: font, fontSize: "13.5px", color: "#5A5F68", flexWrap: "wrap",
  },
  footLinks: { display: "flex", gap: "18px", flexWrap: "wrap" },
  footLink: { color: "#5A5F68", textDecoration: "none" },
};
