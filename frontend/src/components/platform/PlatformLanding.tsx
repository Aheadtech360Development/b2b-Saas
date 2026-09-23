import Link from "next/link";

/**
 * The platform's own address, when no brand was asked for.
 *
 * Every shop on here is reached at its own address — a brand's own domain once
 * it has one, and `?tenant=<slug>` until then. This address is not any of
 * them, so it says what it is instead of pretending to be a shop: it used to
 * render a generic "Wholesale Store" with an Apply for Wholesale button, which
 * looked like a broken shop to anyone who landed on it.
 */
export default function PlatformLanding() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "#0B0D12", color: "#E5E7EB",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: "540px", textAlign: "center" }}>
        <div style={{
          width: "44px", height: "44px", margin: "0 auto 22px", borderRadius: "12px",
          background: "linear-gradient(135deg,#6366F1,#A78BFA)",
        }} />
        <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-.02em", marginBottom: "12px", color: "#fff" }}>
          Commerce, one brand at a time
        </h1>
        <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#9CA3AF", marginBottom: "28px" }}>
          Every shop built here has its own address. If you were sent a link to a
          store, open that link — this one is the platform itself, not a shop.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login" style={{
            background: "#6366F1", color: "#fff", padding: "11px 22px", borderRadius: "9px",
            fontSize: "14px", fontWeight: 700, textDecoration: "none",
          }}>
            Sign in
          </Link>
          <Link href="/track-order" style={{
            background: "transparent", color: "#C7CBD4", border: "1px solid #262B39",
            padding: "11px 22px", borderRadius: "9px", fontSize: "14px", fontWeight: 600, textDecoration: "none",
          }}>
            Track an order
          </Link>
        </div>
      </div>
    </main>
  );
}
