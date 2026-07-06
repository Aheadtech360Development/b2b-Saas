"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Grid } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface StyleSheet {
  id: string;
  style_number: string;
  image_url: string | null;
  pdf_url: string | null;
  sort_order: number;
}

export default function StyleSheetsPage() {
  const [sheets, setSheets] = useState<StyleSheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<StyleSheet[]>("/api/v1/style-sheets")
      .then(res => setSheets((res as any).data ?? res ?? []))
      .catch(() => setSheets([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: "#F4F3EF", minHeight: "100vh" }}>
      {/* Announce */}
      {/* <div style={{ background: "#2A2830", color: "#fff", textAlign: "center", padding: "10px 20px", fontSize: "12px", fontWeight: 600, letterSpacing: ".05em" }}>
        <Grid size={13} style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
        T-Shirt Collection Style Sheets — Downloadable PDFs for Every AF Blank
      </div> */}

      {/* Hero */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E0DA", padding: "48px 32px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "100px", padding: "6px 16px", fontSize: "12px", fontWeight: 700, color: "#7A7880", letterSpacing: ".06em", marginBottom: "20px" }}>
          <FileText size={13} />
          FACTORY-DIRECT SPEC SHEETS
        </div>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "clamp(40px,6vw,64px)", letterSpacing: ".04em", color: "#2A2830", lineHeight: 1, marginBottom: "16px" }}>
          Style Sheets
        </h1>
        <p style={{ fontSize: "16px", color: "#7A7880", maxWidth: "560px", margin: "0 auto", lineHeight: 1.7 }}>
          Download the full technical style sheet for any AF blank. Each PDF includes measurements, fabric specs, fit notes, and print area dimensions.
        </p>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "48px 32px" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: "12px", border: "1.5px solid #E2E0DA", overflow: "hidden", height: "280px", opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : sheets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 32px" }}>
            <FileText size={48} style={{ color: "#E2E0DA", marginBottom: "16px" }} />
            <p style={{ fontSize: "15px", color: "#7A7880" }}>Style sheets will be available here soon.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
            {sheets.map(sheet => (
              <StyleCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StyleCard({ sheet }: { sheet: StyleSheet }) {
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (sheet.pdf_url) {
      window.open(sheet.pdf_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: "12px",
        border: `1.5px solid ${hovered ? "#1A5CFF" : "#E2E0DA"}`,
        overflow: "hidden",
        cursor: sheet.pdf_url ? "pointer" : "default",
        transition: "border-color .15s, box-shadow .15s",
        boxShadow: hovered ? "0 4px 20px rgba(26,92,255,.12)" : "0 1px 4px rgba(0,0,0,.04)",
        position: "relative",
      }}
    >
      {/* Image */}
      <div style={{ height: "330px", background: "#F4F3EF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {sheet.image_url ? (
          <img
            src={sheet.image_url}
            alt={`Style ${sheet.style_number}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .2s", transform: hovered ? "scale(1.03)" : "scale(1)" }}
          />
        ) : (
          <FileText size={40} style={{ color: "#D0CECC" }} />
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>Style {sheet.style_number}</span>
        {sheet.pdf_url && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: hovered ? "#1A5CFF" : "#7A7880", transition: "color .15s" }}>
            <Download size={13} />
            PDF
          </div>
        )}
      </div>
    </div>
  );
}
