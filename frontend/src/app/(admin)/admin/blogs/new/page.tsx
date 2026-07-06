"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

const labelSt: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};

function toSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

export default function AdminBlogNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugEdited) setSlug(toSlug(val));
  }

  async function handleCreate() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!slug.trim()) { setError("Slug is required"); return; }
    setCreating(true); setError("");
    try {
      const post = await apiClient.post<{ id: string }>("/api/v1/admin/blog-posts", { title, slug, status });
      router.push(`/admin/blogs/${post.id}/edit`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create post";
      setError(msg.includes("409") ? "Slug already exists — choose a different one" : msg);
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: "32px", maxWidth: "600px" }}>
      <div style={{ marginBottom: "28px" }}>
        <button onClick={() => router.push("/admin/blogs")}
          style={{ background: "none", border: "none", color: "#7A7880", fontSize: "13px", cursor: "pointer", padding: 0, marginBottom: "6px" }}>
          ← Blog Posts
        </button>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", letterSpacing: ".06em", color: "#2A2830" }}>
          New Blog Post
        </h1>
        <p style={{ fontSize: "13px", color: "#7A7880" }}>Fill in the basics — you can add full content after creating.</p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div>
          <label style={labelSt}>Title *</label>
          <input value={title} onChange={e => handleTitleChange(e.target.value)} placeholder="My Blog Post Title" style={inputSt} />
        </div>

        <div>
          <label style={labelSt}>Slug *</label>
          <input
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="my-blog-post-title"
            style={{ ...inputSt, fontFamily: "monospace" }}
          />
          <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>URL: /blog/{slug || "…"}</p>
        </div>

        <div>
          <label style={labelSt}>Initial Status</label>
          <div style={{ display: "flex", gap: "10px" }}>
            {(["draft", "published"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                  background: status === s ? "#1B3A5C" : "#F4F3EF",
                  color: status === s ? "#fff" : "#555",
                  border: "1.5px solid " + (status === s ? "#1B3A5C" : "#E2E0DA"),
                }}>
                {s === "draft" ? "Draft" : "Published"}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ fontSize: "13px", color: "#E8242A", background: "rgba(232,36,42,.06)", padding: "10px 14px", borderRadius: "6px" }}>{error}</p>}

        <button
          onClick={handleCreate}
          disabled={creating}
          style={{ background: creating ? "#ccc" : "#E8242A", color: "#fff", border: "none", borderRadius: "8px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}>
          {creating ? "Creating…" : "Create & Edit →"}
        </button>
      </div>
    </div>
  );
}
