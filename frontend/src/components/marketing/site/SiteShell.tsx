/**
 * The design's header and footer around a page the design has no page for:
 * the legal pages (Privacy, Terms, Cookies) and sign-in and sign-up on
 * printcopilot.co. Taken from the home page as generated, with the home page's
 * stylesheet, so the frame is the same one every design page wears.
 */
import type { ReactNode } from "react";
import { ReferralCapture } from "@/components/partners/ReferralCapture";
import { loadPlanPrices } from "@/lib/planPricesServer";
import { loadSitePage } from "./registry";
import { fillNumbers } from "./SitePage";

/** The home page's <header> and <footer>, numbers filled. Exported for the tests. */
export function chromeOf(html: string): { header: string; footer: string } {
  return {
    header: html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? "",
    footer: html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "",
  };
}

export default async function SiteShell({ children }: { children: ReactNode }) {
  const [home, prices] = await Promise.all([loadSitePage("home"), loadPlanPrices()]);
  const { header, footer } = chromeOf(fillNumbers(home.html, prices, null));
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap"
        precedence="default"
      />
      <style dangerouslySetInnerHTML={{ __html: home.css }} />
      <ReferralCapture />
      {/* On the design's pages the header sits on the dark hero; here it gets
          the same navy band, or its light text would be on white. */}
      <section
        className="dark dots"
        style={{ position: "relative", backgroundColor: "#0C1E35" }}
        dangerouslySetInnerHTML={{ __html: header }}
      />
      <main>{children}</main>
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
