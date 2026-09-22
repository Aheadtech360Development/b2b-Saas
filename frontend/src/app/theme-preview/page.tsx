"use client";

/**
 * The live preview inside the theme customizer.
 *
 * It renders nothing on its own: the customizer posts the page it has just
 * built (the design's sections with the admin's values already in them) and
 * this draws it. That keeps the preview instant — no save, no round trip —
 * and it is the same HTML the storefront serves, so what you see here is what
 * shoppers get once you publish.
 *
 * Clicking a section tells the customizer to open that section's settings.
 */
import { useEffect, useRef, useState } from "react";

interface PreviewPage {
  key: string;
  css: string;
  stylesheets: string[];
  svg_defs: string;
  sections: { id: string; html: string }[];
}

const MESSAGE = "at360-theme-preview";

export default function ThemePreviewPage() {
  const [page, setPage] = useState<PreviewPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin only: the customizer is the only thing that may draw here.
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; page?: PreviewPage; selected?: string | null } | null;
      if (!data || data.type !== MESSAGE) return;
      if (data.page) setPage(data.page);
      if ("selected" in data) setSelected(data.selected ?? null);
    }
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: MESSAGE, ready: true }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Clicking anything in the preview opens that section in the editor.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest("[data-theme-section]");
      const id = target?.getAttribute("data-theme-section");
      if (!id) return;
      e.preventDefault();
      window.parent?.postMessage({ type: MESSAGE, select: id }, window.location.origin);
    }
    const host = hostRef.current;
    host?.addEventListener("click", onClick);
    return () => host?.removeEventListener("click", onClick);
  }, [page]);

  // Keep the section being edited in view.
  useEffect(() => {
    if (!selected) return;
    hostRef.current
      ?.querySelector(`[data-theme-section="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected, page]);

  if (!page) {
    return <div style={{ padding: "40px", fontFamily: "system-ui, sans-serif", color: "#8A8A8A", fontSize: "14px" }}>Loading preview…</div>;
  }

  return (
    <div ref={hostRef}>
      {page.stylesheets.map((tag, i) => {
        const href = /href="([^"]+)"/.exec(tag)?.[1];
        return href ? <link key={i} rel="stylesheet" href={href} /> : null;
      })}
      <style dangerouslySetInnerHTML={{ __html: `${page.css}
        [data-theme-section]{position:relative;}
        [data-theme-section]:hover{outline:2px dashed rgba(62,99,232,.5);outline-offset:-2px;cursor:pointer;}
        [data-theme-section].is-selected{outline:2px solid #3E63E8;outline-offset:-2px;}
      ` }} />
      {page.svg_defs && <div aria-hidden style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: page.svg_defs }} />}
      {page.sections.map((section) => (
        <div
          key={section.id}
          data-theme-section={section.id}
          className={selected === section.id ? "is-selected" : undefined}
          dangerouslySetInnerHTML={{ __html: section.html }}
        />
      ))}
    </div>
  );
}
