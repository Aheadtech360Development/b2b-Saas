export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  published_date: string | null;
  read_time: string | null;
  excerpt: string | null;
  tags: string[];
}

interface PageSeo {
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const r = await fetch(`${API}/api/v1/pages-seo/blog`, { next: { revalidate: 300 } });
    if (!r.ok) return { title: "Blog — AF Blanks" };
    const seo: PageSeo = await r.json();
    return {
      title: seo.meta_title ?? "Blog — AF Blanks",
      description: seo.meta_description ?? "Industry insights, print tips, and wholesale apparel news from AF Blanks.",
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Blog — AF Blanks" };
  }
}

async function getPosts(): Promise<BlogPost[]> {
  try {
    const r = await fetch(`${API}/api/v1/blog-posts`, { cache: "no-store" });
    if (!r.ok) return [];
    const data: unknown = await r.json();
    return Array.isArray(data) ? (data as BlogPost[]) : [];
  } catch {
    return [];
  }
}

export default async function BlogListingPage() {
  const posts = await getPosts();

  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "48px 24px 32px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", fontWeight: 600, color: "#1A1A1A", marginBottom: "10px", lineHeight: 1.15 }}>
            Resources
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B" }}>
            Printing guides, product updates, and useful references.
          </p>
        </div>
      </div>

      {/* BLOG GRID */}
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "48px 24px" }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#6B6B6B" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "16px" }}>No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "28px" }} className="blog-grid">
            {posts.map(post => (
              <Link key={post.id} href={`/blog/${post.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <article className="blog-card" style={{ background: "#FFFFFF", border: "1px solid #E2E2DE", cursor: "pointer", transition: "box-shadow .2s" }}>
                  {/* Cover */}
                  <div style={{ height: "200px", background: "#F8F8F6", overflow: "hidden" }}>
                    {post.cover_image_url ? (
                      <img src={post.cover_image_url} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0F0EE" }}>
                        <span style={{ fontSize: "32px", color: "var(--brand-primary, #1C3557)", opacity: 0.2 }}>✍</span>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "20px" }}>
                    {/* Tag pill */}
                    {(post.tags || []).length > 0 && (
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", color: "var(--brand-primary, #1C3557)", border: "1px solid var(--brand-primary, #1C3557)", padding: "3px 8px", display: "inline-block", marginBottom: "10px", letterSpacing: "0.04em" }}>
                        {post.tags[0]}
                      </span>
                    )}
                    <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.3, marginBottom: "8px" }}>
                      {post.title}
                    </h3>
                    {post.published_date && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", marginBottom: "8px" }}>
                        {new Date(post.published_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    )}
                    {post.excerpt && (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.55, marginBottom: "14px" }}>
                        {post.excerpt.length > 110 ? post.excerpt.slice(0, 110) + "…" : post.excerpt}
                      </p>
                    )}
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--brand-primary, #1C3557)", fontWeight: 500 }}>Read More →</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .blog-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); }
        @media (max-width: 900px) { .blog-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 580px) { .blog-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
