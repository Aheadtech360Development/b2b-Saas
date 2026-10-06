"use client";

/**
 * The draft, full size and working — menus open, tabs switch, products can
 * be chosen — for the merchant to try before publishing. Admin-only: a draft
 * is not public, and this reads it through the admin API.
 *
 * Its links stay in the preview. A search, "Shop all", a product, a
 * collection, a page of the draft: each opens here, drawn from the draft,
 * rather than on the live shop — which until the switch still wears its old
 * design. A link the draft does not draw (checkout, an account page, the gang
 * sheet builder) opens in a new tab, so the preview keeps its place.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminGate from "../AdminGate";
import { builderService } from "@/services/builder.service";
import type { SitePayload } from "@/lib/builder/types";
import { BuilderPage, SiteHead, SitePart } from "@/components/builder/SiteParts";
import { PREVIEW_PATH, previewTarget } from "@/lib/builder/previewLinks";

function Preview() {
  const params = useSearchParams();
  const router = useRouter();
  const key = params.toString();
  const [payload, setPayload] = useState<SitePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(key);
    let live = true;
    builderService.preview({
      route: q.get("route") || "home",
      slug: q.get("slug") || undefined,
      q: q.get("q") || undefined,
      page: q.get("page") || undefined,
      sort: q.get("sort") || undefined,
      template: q.get("template") || undefined,
    }).then((p) => { if (live) { setPayload(p); setError(""); } })
      .catch(() => { if (live) setError("The preview could not be loaded."); });
    return () => { live = false; };
  }, [key]);

  useEffect(() => {
    const go = (next: URLSearchParams) => {
      router.push(`${PREVIEW_PATH}?${next.toString()}`);
      window.scrollTo(0, 0);
    };
    const away = (url: URL) => {
      if (url.origin !== window.location.origin) return false;
      window.open(url.href, "_blank", "noopener");
      return true;
    };
    // After the page's own handlers: a link an island already took over (the
    // search icon opening its panel, a menu's caret) is left alone.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      const next = previewTarget(url, window.location);
      if (next) {
        e.preventDefault();
        go(next);
      } else if (url.pathname !== PREVIEW_PATH && away(url)) {
        e.preventDefault();
      }
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (e.defaultPrevented || !form || (form.method || "get").toLowerCase() !== "get") return;
      const url = new URL(form.action || window.location.href, window.location.href);
      const fields = new URLSearchParams();
      new FormData(form).forEach((v, k) => { if (typeof v === "string") fields.append(k, v); });
      url.search = fields.toString();
      const next = previewTarget(url, window.location);
      if (next) {
        e.preventDefault();
        go(next);
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, [router]);

  if (error) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#B42318" }}>{error}</div>;
  if (!payload) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#8A8A8A" }}>Loading the preview…</div>;
  return (
    <>
      <SiteHead settings={payload.settings} fonts={payload.fonts} />
      {/* Drawn afresh for each page, as a shop's are: a menu drawer or the
          search panel a link was followed from does not stay open over the
          next page. */}
      <div key={key} style={{ display: "contents" }}>
        <SitePart payload={payload} part="announcement" />
        <SitePart payload={payload} part="header" />
        <main><BuilderPage payload={payload} sort={params.get("sort") === "name" ? "name" : ""} /></main>
        <SitePart payload={payload} part="footer" />
      </div>
      <div role="status" style={{
        position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 2147483001,
        display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 8px 16px", borderRadius: 999,
        background: "#14161B", color: "#fff", font: "600 13px system-ui, sans-serif", boxShadow: "0 10px 30px rgba(0,0,0,.25)",
      }}>
        Draft preview — shoppers do not see this yet
        <button type="button" onClick={() => window.close()} style={{ border: 0, borderRadius: 999, padding: "6px 12px", background: "#fff", color: "#14161B", font: "inherit", cursor: "pointer" }}>
          Close
        </button>
      </div>
    </>
  );
}

export default function SiteBuilderPreviewPage() {
  return (
    <AdminGate>
      <Suspense fallback={<div style={{ padding: 40, fontFamily: "system-ui", color: "#8A8A8A" }}>Loading the preview…</div>}>
        <Preview />
      </Suspense>
    </AdminGate>
  );
}
