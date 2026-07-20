"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import SectionRenderer, { type PageSection } from "@/components/storefront/SectionRenderer";

interface PageData { slug: string; title: string; sections: PageSection[] }

/** Fetches a storefront page by slug and renders its sections. */
export default function StorefrontPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<PageData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    function fetchPage() {
      apiClient
        .get<PageData>(`/api/v1/storefront/pages/${slug}`, { skipAuth: true })
        .then((p) => { if (!cancelled) { setPage(p); setStatus("ok"); } })
        .catch((e) => { if (!cancelled) setStatus(e instanceof ApiClientError && e.status === 404 ? "notfound" : "notfound"); });
    }
    fetchPage();
    // Refetch when the tab regains focus so admin edits show without a reload.
    function onFocus() { fetchPage(); }
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [slug]);

  if (status === "loading") {
    return <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "14px" }}>Loading…</div>;
  }
  if (status === "notfound" || !page) {
    return (
      <div style={{ minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)" }}>
        <h1 style={{ fontFamily: "var(--brand-font-heading, 'Fraunces', serif)", fontSize: "40px", color: "#1A1A1A" }}>Page not found</h1>
        <p style={{ color: "#6B6B6B" }}>This page doesn&apos;t exist.</p>
      </div>
    );
  }
  return <SectionRenderer sections={page.sections} />;
}
