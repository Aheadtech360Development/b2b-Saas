/**
 * "Powered by PrintCoPilot" at the foot of every shop (owner, 2026-11-12),
 * linking to the platform's own address. Under a builder site's footer it
 * wears that site's colours (it sits in a .bsite, where the theme's colours
 * are); in the app's own footer it is a line of that footer.
 */
export const PLATFORM_URL = "https://www.printcopilot.co/";

export function PoweredBy({ builder = false }: { builder?: boolean }) {
  return (
    <div
      className={builder ? "bsite" : undefined}
      data-powered-by
      style={{
        textAlign: "center", padding: "14px 16px", fontSize: 12, lineHeight: 1.4, letterSpacing: ".02em",
        ...(builder ? { background: "var(--b-background, #fff)", color: "var(--b-muted, #6B6B6B)" } : { color: "#6B6B6B" }),
      }}
    >
      Powered by{" "}
      <a href={PLATFORM_URL} target="_blank" rel="noopener" style={{ color: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
        PrintCoPilot
      </a>
    </div>
  );
}
