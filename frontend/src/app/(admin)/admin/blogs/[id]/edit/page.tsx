"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { BlogBlockEditor, type Block } from "@/components/admin/BlogBlockEditor";

interface FaqItem { question: string; answer: string; }

const labelSt: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const cardSt: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "24px", marginBottom: "16px",
};
const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-bebas)", fontSize: "15px", letterSpacing: ".08em", color: "#2A2830", marginBottom: "16px",
};

function toSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

export default function AdminBlogEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const coverRef = useRef<HTMLInputElement>(null);
  const ogRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [slugEdited, setSlugEdited] = useState(true);

  // Card info
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("draft");
  const [coverUrl, setCoverUrl] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [readTime, setReadTime] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Article body
  const [blocks, setBlocks] = useState<Block[]>([]);

  // FAQ
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  // SEO
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [uploadingOg, setUploadingOg] = useState(false);

  useEffect(() => {
    apiClient.get<{
      id: string; title: string; slug: string; status: string;
      cover_image_url: string | null; published_date: string | null; read_time: string | null;
      excerpt: string | null; tags: string[] | null; article_body: Block[] | null;
      faq: FaqItem[] | null; meta_title: string | null; meta_description: string | null;
      keywords: string | null; og_image_url: string | null;
    }>(`/api/v1/admin/blog-posts`)
      .then(async () => {
        // Need single post — fetch list and find by id
        const list = await apiClient.get<{ id: string }[]>("/api/v1/admin/blog-posts");
        return list;
      })
      .catch(() => [])
      .finally(() => {});

    // Actually fetch single via list
    (async () => {
      try {
        const list = await apiClient.get<{
          id: string; title: string; slug: string; status: string;
          cover_image_url: string | null; published_date: string | null; read_time: string | null;
          excerpt: string | null; tags: string[] | null; article_body: Block[] | null;
          faq: { question: string; answer: string }[] | null;
          meta_title: string | null; meta_description: string | null;
          keywords: string | null; og_image_url: string | null;
        }[]>("/api/v1/admin/blog-posts");
        const post = list.find(p => p.id === id);
        if (!post) { router.push("/admin/blogs"); return; }
        setTitle(post.title || "");
        setSlug(post.slug || "");
        setStatus(post.status || "draft");
        setCoverUrl(post.cover_image_url || "");
        setPublishedDate(post.published_date || "");
        setReadTime(post.read_time || "");
        setExcerpt(post.excerpt || "");
        setTags(post.tags || []);
        setBlocks(post.article_body || []);
        setFaqs(post.faq || []);
        setMetaTitle(post.meta_title || "");
        setMetaDesc(post.meta_description || "");
        setKeywords(post.keywords || "");
        setOgImageUrl(post.og_image_url || "");
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData(); fd.append("file", file);
    const res = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd);
    return res.url;
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingCover(true);
    try { setCoverUrl(await uploadImage(file)); } catch { /* ignore */ }
    finally { setUploadingCover(false); }
  }

  async function handleOgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingOg(true);
    try { setOgImageUrl(await uploadImage(file)); } catch { /* ignore */ }
    finally { setUploadingOg(false); }
  }

  function addTag(val: string) {
    const t = val.trim(); if (!t || tags.includes(t)) { setTagInput(""); return; }
    setTags(prev => [...prev, t]); setTagInput("");
  }
  function removeTag(t: string) { setTags(prev => prev.filter(x => x !== t)); }

  function addKeyword(val: string) {
    const t = val.trim(); if (!t) { setKeywordInput(""); return; }
    const existing = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    if (!existing.includes(t)) setKeywords([...existing, t].join(", "));
    setKeywordInput("");
  }
  function removeKeyword(kw: string) {
    setKeywords(keywords.split(",").map(k => k.trim()).filter(k => k && k !== kw).join(", "));
  }

  function addFaq() { setFaqs(f => [...f, { question: "", answer: "" }]); }
  function setFaqField(i: number, field: keyof FaqItem, val: string) {
    setFaqs(f => f.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }
  function removeFaq(i: number) { setFaqs(f => f.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    setSaving(true); setSaveMsg("");
    try {
      await apiClient.patch(`/api/v1/admin/blog-posts/${id}`, {
        title, slug, status,
        cover_image_url: coverUrl || null,
        published_date: publishedDate || null,
        read_time: readTime || null,
        excerpt: excerpt || null,
        tags,
        article_body: blocks,
        faq: faqs,
        meta_title: metaTitle || null,
        meta_description: metaDesc || null,
        keywords: keywords || null,
        og_image_url: ogImageUrl || null,
      });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch { setSaveMsg("Error saving"); }
    finally { setSaving(false); }
  }

  const keywordList = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];

  if (loading) return <div style={{ padding: "32px", color: "#7A7880", fontSize: "14px" }}>Loading…</div>;

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <button onClick={() => router.push("/admin/blogs")}
            style={{ background: "none", border: "none", color: "#7A7880", fontSize: "13px", cursor: "pointer", padding: 0, marginBottom: "6px" }}>
            ← Blog Posts
          </button>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "26px", letterSpacing: ".06em", color: "#2A2830" }}>
            {title || "Edit Post"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {saveMsg && <span style={{ fontSize: "13px", color: saveMsg === "Saved" ? "#059669" : "#E8242A" }}>{saveMsg}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saving ? "#ccc" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "14px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Card Info */}
      <div style={cardSt}>
        <span style={sectionTitle}>CARD INFO</span>
        <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={labelSt}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Blog post title" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Slug *</label>
            <input
              value={slug}
              onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
              placeholder="my-blog-post"
              style={{ ...inputSt, fontFamily: "monospace" }}
            />
          </div>
        </div>

        {/* Cover Image */}
        <div style={{ marginBottom: "16px" }}>
          <label style={labelSt}>Cover Image</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="Image URL" style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => coverRef.current?.click()}
              style={{ background: "#F4F3EF", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: "#2A2830" }}>
              {uploadingCover ? "…" : "Upload"}
            </button>
            <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCoverUpload} />
          </div>
          {coverUrl && <img src={coverUrl} alt="Cover" style={{ marginTop: "8px", maxHeight: "140px", borderRadius: "6px", border: "1px solid #E2E0DA" }} />}
        </div>

        <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={labelSt}>Published Date</label>
            <input type="date" value={publishedDate} onChange={e => setPublishedDate(e.target.value)} style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Read Time</label>
            <input value={readTime} onChange={e => setReadTime(e.target.value)} placeholder="5 min read" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputSt}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelSt}>Excerpt <span style={{ fontWeight: 400, color: "#aaa" }}>(max 200 chars)</span></label>
          <textarea value={excerpt} onChange={e => setExcerpt(e.target.value.slice(0, 200))} rows={3} maxLength={200}
            placeholder="Short description shown in blog listing…" style={{ ...inputSt, resize: "vertical" }} />
          <div style={{ textAlign: "right", fontSize: "11px", color: "#7A7880", marginTop: "3px" }}>{excerpt.length}/200</div>
        </div>

        {/* Tags */}
        <div>
          <label style={labelSt}>Tags / Keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
            {tags.map(tag => (
              <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(26,92,255,.08)", color: "#1A5CFF", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
                {tag}
                <button type="button" onClick={() => removeTag(tag)} style={{ background: "none", border: "none", color: "#1A5CFF", cursor: "pointer", padding: 0, fontSize: "13px" }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
              placeholder="Type tag and press Enter" style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => addTag(tagInput)}
              style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Article Body */}
      <div style={cardSt}>
        <span style={sectionTitle}>ARTICLE BODY</span>
        <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "14px" }}>Add blocks to build the article content.</p>
        <BlogBlockEditor value={blocks} onChange={setBlocks} />
      </div>

      {/* FAQ Section */}
      <div style={cardSt}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={sectionTitle}>FAQ SECTION</span>
          <button type="button" onClick={addFaq}
            style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "7px", padding: "7px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            + Add FAQ
          </button>
        </div>
        {faqs.length === 0 && <p style={{ fontSize: "13px", color: "#bbb", textAlign: "center", padding: "16px 0" }}>No FAQ items yet.</p>}
        {faqs.map((faq, i) => (
          <div key={i} style={{ border: "1px solid #E2E0DA", borderRadius: "8px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#7A7880" }}>FAQ #{i + 1}</span>
              <button type="button" onClick={() => removeFaq(i)}
                style={{ background: "none", border: "none", color: "#E8242A", cursor: "pointer", fontSize: "13px" }}>Remove</button>
            </div>
            <div style={{ marginBottom: "8px" }}>
              <label style={labelSt}>Question</label>
              <input value={faq.question} onChange={e => setFaqField(i, "question", e.target.value)}
                placeholder="What is…?" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Answer</label>
              <textarea value={faq.answer} onChange={e => setFaqField(i, "answer", e.target.value)}
                rows={3} placeholder="Answer…" style={{ ...inputSt, resize: "vertical" }} />
            </div>
          </div>
        ))}
      </div>

      {/* SEO */}
      <div style={cardSt}>
        <span style={sectionTitle}>SEO</span>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelSt}>Meta Title <span style={{ fontWeight: 400, color: "#aaa" }}>(max 60)</span></label>
          <input value={metaTitle} onChange={e => setMetaTitle(e.target.value.slice(0, 60))} placeholder="SEO title…" maxLength={60} style={inputSt} />
          <div style={{ textAlign: "right", fontSize: "11px", color: "#7A7880", marginTop: "3px" }}>{metaTitle.length}/60</div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelSt}>Meta Description <span style={{ fontWeight: 400, color: "#aaa" }}>(max 160)</span></label>
          <textarea value={metaDesc} onChange={e => setMetaDesc(e.target.value.slice(0, 160))} rows={3} maxLength={160}
            placeholder="SEO description…" style={{ ...inputSt, resize: "vertical" }} />
          <div style={{ textAlign: "right", fontSize: "11px", color: "#7A7880", marginTop: "3px" }}>{metaDesc.length}/160</div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelSt}>Keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
            {keywordList.map(kw => (
              <span key={kw} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#F4F3EF", color: "#555", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(keywordInput); } }}
              placeholder="Type keyword and press Enter" style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => addKeyword(keywordInput)}
              style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Add
            </button>
          </div>
        </div>
        <div>
          <label style={labelSt}>OG Image</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input value={ogImageUrl} onChange={e => setOgImageUrl(e.target.value)} placeholder="URL or upload" style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => ogRef.current?.click()}
              style={{ background: "#F4F3EF", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: "#2A2830" }}>
              {uploadingOg ? "…" : "Upload"}
            </button>
            <input ref={ogRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleOgUpload} />
          </div>
          {ogImageUrl && <img src={ogImageUrl} alt="OG" style={{ marginTop: "8px", maxHeight: "100px", borderRadius: "6px", border: "1px solid #E2E0DA" }} />}
        </div>
      </div>

      {/* Bottom Save */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        {saveMsg && <span style={{ fontSize: "13px", color: saveMsg === "Saved" ? "#059669" : "#E8242A", alignSelf: "center" }}>{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: saving ? "#ccc" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 32px", fontSize: "14px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : "Save Post"}
        </button>
      </div>
    </div>
  );
}
