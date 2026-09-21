"use client";

/**
 * Loads the tracking tools *this* brand connected — and nothing else.
 *
 * Every brand on the platform has its own subdomain and its own set of IDs, so
 * the config is fetched per storefront and no script is loaded for a brand that
 * has not switched one on. A brand with tracking off gets no third-party
 * request at all, which is the whole point of the switch.
 *
 * Fetched client-side after mount, like the brand's own styling
 * (BrandingProvider), so the server render stays identical for every brand and
 * nothing here can block the page.
 *
 * Page views are sent on every route change: the App Router does not reload the
 * document, so the one view each script counts on load would otherwise be the
 * only view it ever counted.
 */
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { setTrackingConfig, trackPageView } from "@/lib/tracking";

export interface AnalyticsConfig {
  enabled: boolean;
  tools: Record<string, string>;
  head_snippet: string;
  body_snippet: string;
  track_products: boolean;
  track_checkout: boolean;
}

export function TrackingScripts() {
  const [config, setConfig] = useState<AnalyticsConfig | null>(null);
  const pathname = usePathname();
  const firstView = useRef(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<AnalyticsConfig>("/api/v1/storefront/analytics", { skipAuth: true })
      .then(data => {
        if (cancelled) return;
        setConfig(data);
        setTrackingConfig(data);
      })
      .catch(() => {
        // A brand's storefront must not break because its analytics config
        // could not be read.
      });
    return () => { cancelled = true; };
  }, []);

  // One page view per navigation. The scripts themselves count the first one
  // as they load, so skip that to avoid sending it twice.
  useEffect(() => {
    if (!config?.enabled) return;
    if (firstView.current) { firstView.current = false; return; }
    trackPageView(pathname);
  }, [pathname, config?.enabled]);

  if (!config?.enabled) return null;
  const id = (key: string) => config.tools[key];

  return (
    <>
      {id("gtm") && (
        <Script id="gtm" strategy="afterInteractive">{`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
          var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
          j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${id("gtm")}');
        `}</Script>
      )}

      {id("ga4") && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${id("ga4")}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${id("ga4")}');
          `}</Script>
        </>
      )}

      {id("clarity") && (
        <Script id="clarity" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window,document,"clarity","script","${id("clarity")}");
        `}</Script>
      )}

      {id("meta_pixel") && (
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${id("meta_pixel")}');
          fbq('track', 'PageView');
        `}</Script>
      )}

      {id("tiktok_pixel") && (
        <Script id="tiktok-pixel" strategy="afterInteractive">{`
          !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
          ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
          ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
          for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
          ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
          ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
          ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
          o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
          a.parentNode.insertBefore(o,a)};
          ttq.load('${id("tiktok_pixel")}');ttq.page();
          }(window, document, 'ttq');
        `}</Script>
      )}

      {id("pinterest_tag") && (
        <Script id="pinterest-tag" strategy="afterInteractive">{`
          !function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};
          var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");
          t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];
          r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
          pintrk('load', '${id("pinterest_tag")}');
          pintrk('page');
        `}</Script>
      )}

      {id("snap_pixel") && (
        <Script id="snap-pixel" strategy="afterInteractive">{`
          (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){
          a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
          a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;
          var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);
          })(window,document,'https://sc-static.net/scevent.min.js');
          snaptr('init', '${id("snap_pixel")}');
          snaptr('track', 'PAGE_VIEW');
        `}</Script>
      )}

      {id("klaviyo") && (
        <Script
          src={`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${id("klaviyo")}`}
          strategy="afterInteractive"
        />
      )}

      {id("omnisend") && (
        <Script id="omnisend" strategy="afterInteractive">{`
          window.omnisend = window.omnisend || [];
          omnisend.push(["accountID", "${id("omnisend")}"]);
          omnisend.push(["track", "$pageViewed"]);
          !function(){var e=document.createElement("script");e.type="text/javascript",e.async=!0,
          e.src="https://omnisnippet1.com/inshop/launcher-v2.js";
          var t=document.getElementsByTagName("script")[0];t.parentNode.insertBefore(e,t)}();
        `}</Script>
      )}

      {/* The escape hatch for a tool this registry does not cover. It is markup
          the brand's own admin chose to put on its own storefront — the same
          trust a shop theme already carries — and it is served to that brand's
          pages only. */}
      {config.head_snippet && (
        <Script
          id="brand-head-snippet"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: stripScriptTags(config.head_snippet) }}
        />
      )}
      {config.body_snippet && (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: config.body_snippet }}
        />
      )}
    </>
  );
}

/**
 * A `next/script` body is JavaScript, not HTML, so a pasted snippet's own
 * `<script>` wrapper has to come off or the browser sees `<script>` inside a
 * script and runs nothing.
 */
function stripScriptTags(snippet: string): string {
  return snippet
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/<\/script>/gi, "");
}
