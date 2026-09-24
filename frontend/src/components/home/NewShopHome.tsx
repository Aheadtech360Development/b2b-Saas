/**
 * A shop on its first day.
 *
 * Before this, a brand that had just been created served the built-in
 * storefront with nothing in it — empty grids, headings above no products, a
 * page that looked broken rather than new. This is what that address says
 * until there is something to sell: the shop's name, one line worth reading,
 * and a way to get in touch. Once a theme is imported or products are added,
 * nobody sees this page again.
 */
import Link from "next/link";

export function NewShopHome({ brand }: { brand: string }) {
  return (
    <main style={S.page}>
      <div style={S.inner}>
        <span style={S.eyebrow}>{brand}</span>
        <h1 style={S.h1}>
          Something good is being set up here.
        </h1>
        <p style={S.lede}>
          {brand} is getting its shop ready — the catalogue, the pricing and the artwork
          tools are on their way. Come back shortly, or say hello in the meantime and
          we&apos;ll come straight back to you.
        </p>
        <div style={S.row}>
          <Link href="/contact" style={S.primary}>Get in touch</Link>
          <Link href="/quote" style={S.ghost}>Ask for a quote</Link>
        </div>
      </div>
      <p style={S.foot}>© {new Date().getFullYear()} {brand}</p>
    </main>
  );
}

const font = "'DM Sans', system-ui, sans-serif";

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", background: "#FAFAF9", color: "#111318", fontFamily: font,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "64px 24px", textAlign: "center",
  },
  inner: { maxWidth: "620px" },
  eyebrow: {
    display: "inline-block", fontSize: "12px", fontWeight: 700, letterSpacing: ".14em",
    textTransform: "uppercase", color: "#5A5F68", marginBottom: "18px",
  },
  h1: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: "clamp(30px, 6vw, 46px)",
    lineHeight: 1.12, letterSpacing: "-.02em", fontWeight: 600, margin: "0 0 18px",
  },
  lede: { fontSize: "17px", lineHeight: 1.7, color: "#5A5F68", margin: "0 0 32px" },
  row: { display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" },
  primary: {
    background: "#111318", color: "#fff", textDecoration: "none", fontWeight: 600,
    fontSize: "15px", padding: "13px 28px", borderRadius: "9px",
  },
  ghost: {
    background: "#fff", color: "#111318", textDecoration: "none", fontWeight: 600,
    fontSize: "15px", padding: "13px 28px", borderRadius: "9px", border: "1px solid #E7E5E2",
  },
  foot: { marginTop: "56px", fontSize: "13px", color: "#8A8F98" },
};

export default NewShopHome;
