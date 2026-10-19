import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import a from "@/components/marketing/auth.module.css";

// Rendered per request, as these pages always were (this layout used to read
// the request's headers): whose address it is decides the frame, and sign-up
// reads its ?plan= in the browser.
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // A shop's own sign-in pages stay bare — the form and nothing else. The
  // platform's wear the marketing site's header, footer and look, so signing in or
  // up at printcopilot.co looks like the rest of printcopilot.co. Sign-up is
  // drawn inside it too now, rather than bringing its own header.
  //
  // Decided by the address, not the path: this layout is shared by every page
  // here and is not re-rendered when the App Router moves between them, so a
  // choice made from the path (sign-in with a frame, sign-up without) outlived
  // the page it was made for and drew two headers.
  const { brand } = await loadStore();
  if (brand !== null) return <>{children}</>;

  return (
    <MarketingShell>
      <div className={a.platformAuth}>{children}</div>
    </MarketingShell>
  );
}
