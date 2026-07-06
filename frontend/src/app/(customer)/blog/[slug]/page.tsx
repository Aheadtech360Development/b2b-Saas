export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Block {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

interface FaqItem { question: string; answer: string; }

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  published_date: string | null;
  read_time: string | null;
  excerpt: string | null;
  tags: string[];
  article_body: Block[] | null;
  faq: FaqItem[] | null;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string | null;
  og_image_url: string | null;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    return await fetch(`${API}/api/v1/blog-posts/${slug}`, { cache: "no-store" }).then(r => {
      if (!r.ok) return null;
      return r.json();
    });
  } catch { return null; }
}

async function getAllPosts(): Promise<BlogPost[]> {
  try {
    const r = await fetch(`${API}/api/v1/blog-posts`, { cache: "no-store" });
    if (!r.ok) return [];
    const data: unknown = await r.json();
    return Array.isArray(data) ? (data as BlogPost[]) : [];
  } catch { return []; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Blog — AF Apparels" };
  return {
    title: post.meta_title ?? `${post.title} — AF Apparels Blog`,
    description: post.meta_description ?? post.excerpt ?? undefined,
    keywords: post.keywords ?? undefined,
    openGraph: {
      title: post.meta_title ?? post.title,
      description: post.meta_description ?? post.excerpt ?? undefined,
      images: post.og_image_url ? [{ url: post.og_image_url }] : post.cover_image_url ? [{ url: post.cover_image_url }] : [],
    },
  };
}

function renderBlock(block: Block): React.ReactNode {
  const c = block.content;
  switch (block.type) {
    case "paragraph":
      return <div key={block.id} style={{ fontSize: "16px", lineHeight: 1.75, color: "#333", marginBottom: "20px" }}
        dangerouslySetInnerHTML={{ __html: (c.html as string) || "" }} />;
    case "heading": {
      const level = (c.level as number) || 2;
      const style: React.CSSProperties = {
        fontFamily: "'Barlow Semi Condensed', sans-serif",
        fontSize: level === 2 ? "26px" : level === 3 ? "21px" : "18px",
        fontWeight: 700, color: "#1B3A5C", marginTop: "32px", marginBottom: "12px",
      };
      if (level === 2) return <h2 key={block.id} style={style}>{c.text as string}</h2>;
      if (level === 3) return <h3 key={block.id} style={style}>{c.text as string}</h3>;
      return <h4 key={block.id} style={style}>{c.text as string}</h4>;
    }
    case "bullet_list":
      return (
        <ul key={block.id} style={{ paddingLeft: "24px", marginBottom: "20px", color: "#333", lineHeight: 1.75 }}>
          {((c.items as string[]) || []).map((item, i) => <li key={i} style={{ marginBottom: "6px" }}>{item}</li>)}
        </ul>
      );
    case "numbered_list":
      return (
        <ol key={block.id} style={{ paddingLeft: "24px", marginBottom: "20px", color: "#333", lineHeight: 1.75 }}>
          {((c.items as string[]) || []).map((item, i) => <li key={i} style={{ marginBottom: "6px" }}>{item}</li>)}
        </ol>
      );
    case "cta_box": {
      const title = c.title as string | undefined;
      const btnText = c.button_text as string | undefined;
      const btnUrl = c.button_url as string | undefined;
      return (
        <div key={block.id} style={{ background: "#1B3A5C", borderRadius: "12px", padding: "28px 32px", marginBottom: "24px", textAlign: "center" }}>
          {title ? <h3 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, marginBottom: "16px" }}>{title}</h3> : null}
          {btnText && btnUrl ? (
            <Link href={btnUrl} style={{ display: "inline-block", background: "#E8242A", color: "#fff", padding: "12px 28px", borderRadius: "8px", fontWeight: 700, textDecoration: "none", fontSize: "15px" }}>
              {btnText}
            </Link>
          ) : null}
        </div>
      );
    }
    case "info_box": {
      const text = c.text as string | undefined;
      return (
        <div key={block.id} style={{ background: "rgba(59,130,246,.07)", border: "1.5px solid rgba(59,130,246,.2)", borderRadius: "10px", padding: "18px 22px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "20px", flexShrink: 0 }}>ℹ</span>
          <p style={{ fontSize: "15px", color: "#1e3a6e", lineHeight: 1.65, margin: 0 }}>{text ?? ""}</p>
        </div>
      );
    }
    case "insight_box": {
      const icon = (c.icon as string) || "💡";
      const text = c.text as string | undefined;
      return (
        <div key={block.id} style={{ background: "rgba(245,158,11,.07)", border: "1.5px solid rgba(245,158,11,.2)", borderRadius: "10px", padding: "18px 22px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "22px", flexShrink: 0 }}>{icon}</span>
          <p style={{ fontSize: "15px", color: "#92400e", lineHeight: 1.65, margin: 0 }}>{text ?? ""}</p>
        </div>
      );
    }
    case "image": {
      const url = c.url as string | undefined;
      const alt = (c.alt as string) || "";
      const caption = c.caption as string | undefined;
      const description = c.description as string | undefined;
      return (
        <figure key={block.id} style={{ marginBottom: "28px" }}>
          {url ? <img src={url} alt={alt} style={{ width: "100%", borderRadius: "10px", border: "1px solid #E2E0DA" }} /> : null}
          {caption ? <figcaption style={{ textAlign: "center", fontSize: "13px", color: "#7A7880", marginTop: "8px" }}>{caption}</figcaption> : null}
          {description ? <p style={{ fontSize: "14px", color: "#7A7880", marginTop: "8px", lineHeight: 1.6 }}>{description}</p> : null}
        </figure>
      );
    }
    case "table": {
      const rows = (c.rows as string[][]) || [];
      return (
        <div key={block.id} style={{ overflowX: "auto", marginBottom: "24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? "#F9F8F4" : ri % 2 === 0 ? "#FAFAF8" : "#fff" }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: "10px 14px", border: "1px solid #E2E0DA", color: ri === 0 ? "#1B3A5C" : "#333", fontWeight: ri === 0 ? 700 : 400 }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, allPosts] = await Promise.all([getPost(slug), getAllPosts()]);
  if (!post) notFound();

  const related = allPosts
    .filter(p => p.slug !== slug && (p.tags || []).some(t => (post.tags || []).includes(t)))
    .slice(0, 3);

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      {/* Cover Hero */}
      {post.cover_image_url ? (
        <div style={{ width: "100%", maxHeight: "480px", overflow: "hidden", position: "relative" }}>
          <img src={post.cover_image_url} alt={post.title} style={{ width: "100%", height: "480px", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,.5))" }} />
        </div>
      ) : (
        <div style={{ background: "#1B3A5C", padding: "48px 0", borderBottom: "3px solid #E8242A" }} />
      )}

      {/* Article */}
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px 60px" }}>
        {/* Back */}
        <Link href="/blog" style={{ fontSize: "13px", color: "#7A7880", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", marginBottom: "24px" }}>
          ← Blog
        </Link>

        {/* Tags */}
        {(post.tags || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
            {post.tags.map(tag => (
              <span key={tag} style={{ background: "rgba(232,36,42,.08)", color: "#E8242A", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "36px", fontWeight: 800, color: "#1B3A5C", lineHeight: 1.25, marginBottom: "16px" }}>
          {post.title}
        </h1>

        {/* Meta row */}
        <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "13px", color: "#7A7880", borderBottom: "1px solid #E2E0DA", paddingBottom: "20px", marginBottom: "32px" }}>
          {post.published_date && (
            <span>{new Date(post.published_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          )}
          {post.read_time && <span>· {post.read_time}</span>}
        </div>

        {/* Article Body */}
        <div>
          {(post.article_body || []).map(block => renderBlock(block))}
        </div>

        {/* FAQ */}
        {(post.faq || []).length > 0 && (
          <div style={{ marginTop: "48px", borderTop: "1px solid #E2E0DA", paddingTop: "32px" }}>
            <h2 style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "26px", fontWeight: 700, color: "#1B3A5C", marginBottom: "20px" }}>
              Frequently Asked Questions
            </h2>
            {post.faq!.map((item, i) => (
              <details key={i} style={{ borderBottom: "1px solid #E2E0DA", padding: "16px 0" }}>
                <summary style={{ fontSize: "16px", fontWeight: 600, color: "#1B3A5C", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {item.question}
                  <span style={{ fontSize: "18px", color: "#E8242A", marginLeft: "12px" }}>+</span>
                </summary>
                <p style={{ fontSize: "15px", color: "#7A7880", lineHeight: 1.7, marginTop: "12px", paddingRight: "24px" }}>
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Related Posts */}
      {related.length > 0 && (
        <div style={{ background: "#F9F8F4", borderTop: "1px solid #E2E0DA", padding: "48px 0" }}>
          <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 24px" }}>
            <h2 style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "24px", fontWeight: 700, color: "#1B3A5C", marginBottom: "24px" }}>
              Related Posts
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }} className="blog-grid">
              {related.map(p => (
                <Link key={p.id} href={`/blog/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{ height: "150px", background: "#F4F3EF", overflow: "hidden" }}>
                      {p.cover_image_url
                        ? <img src={p.cover_image_url} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ width: "100%", height: "100%", background: "#1B3A5C" }} />}
                    </div>
                    <div style={{ padding: "14px" }}>
                      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1B3A5C", lineHeight: 1.35, marginBottom: "6px" }}>{p.title}</h3>
                      {p.excerpt && <p style={{ fontSize: "13px", color: "#7A7880" }}>{p.excerpt.slice(0, 80)}…</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
