"use client";

/**
 * CustomCodeFrame — renders a brand's own HTML/CSS/JS on the storefront.
 *
 * The code runs in a sandboxed iframe (scripts allowed, same-origin NOT):
 *  - it can't read the shopper's session, cookies or local storage, or reach
 *    into the admin if the brand's own staff open the page;
 *  - its CSS can't restyle (or break) the rest of the store;
 *  - links still work — <base target="_top"> sends them to the main window.
 * The frame grows to fit its content: a small script inside reports its
 * height, and only messages from this frame carrying this frame's key count.
 */
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_HEIGHT = 20000;

function buildDoc(html: string, css: string, js: string, key: string, font: string): string {
  // Code can't close the tag it lives in and start writing the page itself.
  const safeCss = css.replace(/<\/style/gi, "<\\/style");
  const safeJs = js.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_top">
<style>html,body{margin:0;padding:0;background:transparent;color:#1A1A1A;font-family:${font || "'DM Sans', system-ui, sans-serif"};}*,*::before,*::after{box-sizing:border-box}img{max-width:100%}</style>
<style>${safeCss}</style>
</head><body>${html}
<script>(function(){var k=${JSON.stringify(key)};function s(){try{parent.postMessage({__at360frame:k,h:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)},"*")}catch(e){}}
if(window.ResizeObserver){var r=new ResizeObserver(s);r.observe(document.documentElement);if(document.body)r.observe(document.body)}
window.addEventListener("load",s);setTimeout(s,50);setTimeout(s,600);s();})();</script>
${safeJs.trim() ? `<script>${safeJs}</script>` : ""}
</body></html>`;
}

export default function CustomCodeFrame({ html, css, js, title }: {
  html?: string; css?: string; js?: string; title?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [font, setFont] = useState("");
  const key = useMemo(() => Math.random().toString(36).slice(2) + Date.now().toString(36), []);

  // The brand's body font, so plain text in the frame matches the store.
  useEffect(() => {
    try {
      setFont(getComputedStyle(document.documentElement).getPropertyValue("--brand-font-body").trim());
    } catch { /* keep the default */ }
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { __at360frame?: string; h?: number } | null;
      if (!d || d.__at360frame !== key || typeof d.h !== "number" || !isFinite(d.h)) return;
      setHeight(Math.min(Math.max(Math.ceil(d.h), 0), MAX_HEIGHT));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [key]);

  const doc = useMemo(() => buildDoc(html ?? "", css ?? "", js ?? "", key, font), [html, css, js, key, font]);
  if (!(html ?? "").trim() && !(js ?? "").trim()) return null;

  return (
    <iframe
      ref={ref}
      title={title || "Custom content"}
      srcDoc={doc}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
      style={{ display: "block", width: "100%", border: 0, height: height ? `${height}px` : "24px", background: "transparent" }}
    />
  );
}
