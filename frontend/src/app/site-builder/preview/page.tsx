"use client";

/**
 * The draft, full size and working — menus open, tabs switch, products can
 * be chosen — for the merchant to try before publishing. Admin-only: a draft
 * is not public, and this reads it through the admin API.
 */
import { useEffect, useState } from "react";
import AdminGate from "../AdminGate";
import { builderService } from "@/services/builder.service";
import type { SitePayload } from "@/lib/builder/types";
import { BuilderPage, SiteHead, SitePart } from "@/components/builder/SiteParts";

function Preview() {
  const [payload, setPayload] = useState<SitePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    builderService.preview({
      route: q.get("route") || "home",
      slug: q.get("slug") || undefined,
      q: q.get("q") || undefined,
      template: q.get("template") || undefined,
    }).then(setPayload).catch(() => setError("The preview could not be loaded."));
  }, []);

  if (error) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#B42318" }}>{error}</div>;
  if (!payload) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#8A8A8A" }}>Loading the preview…</div>;
  return (
    <>
      <SiteHead settings={payload.settings} fonts={payload.fonts} />
      <SitePart payload={payload} part="announcement" />
      <SitePart payload={payload} part="header" />
      <main><BuilderPage payload={payload} /></main>
      <SitePart payload={payload} part="footer" />
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
  return <AdminGate><Preview /></AdminGate>;
}
