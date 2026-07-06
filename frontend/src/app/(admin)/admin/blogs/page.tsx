"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  published_date: string | null;
  excerpt: string | null;
  tags: string[];
}

const thSt: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", fontWeight: 700, background: "#F9F8F4",
  borderBottom: "1px solid #E2E0DA",
};
const tdSt: React.CSSProperties = {
  padding: "12px 16px", fontSize: "14px", color: "#2A2830", borderBottom: "1px solid #E2E0DA",
};

export default function AdminBlogsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<BlogPost[]>("/api/v1/admin/blog-posts")
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this blog post?")) return;
    await apiClient.delete(`/api/v1/admin/blog-posts/${id}`);
    setPosts(p => p.filter(post => post.id !== id));
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", letterSpacing: ".06em", color: "#2A2830", marginBottom: "4px" }}>
            Blog Posts
          </h1>
          <p style={{ fontSize: "14px", color: "#7A7880" }}>
            {posts.length} post{posts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/blogs/new")}
          style={{ background: "#E8242A", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 22px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}
        >
          + New Post
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#7A7880", fontSize: "14px" }}>Loading…</p>
      ) : posts.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "#7A7880", fontSize: "14px", marginBottom: "16px" }}>No blog posts yet.</p>
          <button onClick={() => router.push("/admin/blogs/new")}
            style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 22px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
            Write First Post
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thSt}>Title</th>
                <th style={thSt}>Slug</th>
                <th style={thSt}>Status</th>
                <th style={thSt}>Published</th>
                <th style={thSt}>Tags</th>
                <th style={thSt}></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  onClick={() => router.push(`/admin/blogs/${post.id}/edit`)}>
                  <td style={tdSt}>
                    <div style={{ fontWeight: 600 }}>{post.title}</div>
                    {post.excerpt && <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "2px" }}>{post.excerpt.slice(0, 80)}{post.excerpt.length > 80 ? "…" : ""}</div>}
                  </td>
                  <td style={{ ...tdSt, fontSize: "12px", color: "#7A7880", fontFamily: "monospace" }}>{post.slug}</td>
                  <td style={tdSt}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                      background: post.status === "published" ? "rgba(5,150,105,.1)" : "rgba(107,114,128,.1)",
                      color: post.status === "published" ? "#059669" : "#6B7280",
                    }}>
                      {post.status === "published" ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td style={{ ...tdSt, fontSize: "13px", color: "#7A7880" }}>
                    {post.published_date ? new Date(post.published_date).toLocaleDateString() : "—"}
                  </td>
                  <td style={tdSt}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {(post.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} style={{ background: "#F4F3EF", color: "#555", padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...tdSt, width: "120px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={e => { e.stopPropagation(); router.push(`/admin/blogs/${post.id}/edit`); }}
                        style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={e => handleDelete(post.id, e)}
                        style={{ background: "transparent", color: "#E8242A", border: "1px solid rgba(232,36,42,.3)", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", cursor: "pointer" }}>
                        ✕
                      </button>
                    </div>
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
