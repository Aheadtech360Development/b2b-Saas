"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

interface PageSeoRow {
  page_slug: string;
  page_name: string;
  meta_title: string | null;
  meta_description: string | null;
  updated_at: string | null;
}

const thSt: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", fontWeight: 700, background: "#F6F6F7",
  borderBottom: "1px solid #E3E3E3",
};
const tdSt: React.CSSProperties = {
  padding: "12px 16px", fontSize: "14px", color: "#2A2830", borderBottom: "1px solid #E3E3E3",
};

export default function AdminPagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PageSeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<PageSeoRow[]>("/api/v1/admin/pages-seo")
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "32px", maxWidth: "960px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", letterSpacing: "-0.01em", color: "#2A2830", marginBottom: "4px" }}>
          Pages SEO
        </h1>
        <p style={{ fontSize: "14px", color: "#7A7880" }}>
          Manage meta title, description, keywords, and OG image for each website page.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: "26px" }}>{[70, 92, 58, 84].map((w, i) => (<div key={i} className="at-skel" style={{ height: "14px", width: `${w}%`, marginBottom: "12px" }} />))}</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E3E3E3", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thSt}>Page</th>
                <th style={thSt}>Meta Title</th>
                <th style={thSt}>Last Updated</th>
                <th style={thSt}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.page_slug} style={{ cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  onClick={() => router.push(`/admin/pages/${row.page_slug}/edit`)}>
                  <td style={tdSt}>
                    <div style={{ fontWeight: 600 }}>{row.page_name}</div>
                    <div style={{ fontSize: "12px", color: "#7A7880" }}>/{row.page_slug === "home" ? "" : row.page_slug}</div>
                  </td>
                  <td style={tdSt}>
                    {row.meta_title ? (
                      <span style={{ color: "#2A2830" }}>{row.meta_title.length > 50 ? row.meta_title.slice(0, 50) + "…" : row.meta_title}</span>
                    ) : (
                      <span style={{ color: "#bbb", fontStyle: "italic" }}>Not set</span>
                    )}
                  </td>
                  <td style={tdSt}>
                    {row.updated_at ? (
                      <span style={{ fontSize: "13px", color: "#7A7880" }}>
                        {new Date(row.updated_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ color: "#bbb", fontSize: "13px", fontStyle: "italic" }}>Never</span>
                    )}
                  </td>
                  <td style={{ ...tdSt, width: "80px" }}>
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/admin/pages/${row.page_slug}/edit`); }}
                      style={{ background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
