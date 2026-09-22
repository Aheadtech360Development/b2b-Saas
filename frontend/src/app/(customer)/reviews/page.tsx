"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

interface Review {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  body: string;
  reviewer_name: string;
  reviewer_company: string | null;
  is_verified: boolean;
  created_at: string;
  product_name?: string | null;
  product_slug?: string | null;
  // Reviews imported from the store's Google Business Profile, and what Google
  // requires shown with them: the author's name and photo, and a link back.
  source?: "site" | "google";
  reviewer_photo_url?: string | null;
  source_url?: string | null;
  reply_text?: string | null;
  reviewed_at?: string | null;
}

interface GoogleSummary {
  rating: number | null;
  total: number | null;
  maps_url: string | null;
  name: string | null;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width="13" height="13" viewBox="0 0 24 24" fill={s <= rating ? "#f69d0b" : "#E2E2DE"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [google, setGoogle] = useState<GoogleSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<{ reviews: Review[]; google: GoogleSummary | null }>("/api/v1/reviews/recent?page_size=50")
      .then(data => {
        if (data?.reviews) setReviews(data.reviews);
        setGoogle(data?.google ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F6", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#FFFFFF", padding: "48px 32px 40px", borderBottom: "1px solid #E2E2DE" }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#6B6B6B", marginBottom: "8px" }}>Wholesale Community</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px,4vw,40px)", fontWeight: 600, color: "#1A1A1A", lineHeight: 1.15, marginBottom: "12px" }}>
            Customer Reviews
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", maxWidth: "520px", lineHeight: 1.65 }}>
            Real feedback from our wholesale customers. Find a product you love and share your experience.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "40px 32px" }}>
        {google && google.rating != null && (
          <a
            href={google.maps_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "#fff", border: "1px solid #E2E2DE", padding: "12px 16px", marginBottom: "20px", textDecoration: "none", color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}
          >
            <span style={{ fontSize: "22px", fontWeight: 700 }}>{Number(google.rating).toFixed(1)}</span>
            <StarRow rating={Math.round(Number(google.rating))} />
            <span style={{ fontSize: "13px", color: "#6B6B6B" }}>
              {google.total ?? 0} reviews on <strong style={{ color: "#1A1A1A" }}>Google Maps</strong>
            </span>
          </a>
        )}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif" }}>Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", background: "#fff", border: "1px solid #E2E2DE" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "40px", marginBottom: "12px", color: "#f69d0b" }}>★</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600, color: "#1A1A1A", marginBottom: "8px" }}>No reviews yet</div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6B6B6B", marginBottom: "24px" }}>Be the first to review a product you&apos;ve ordered.</p>
            <Link href="/products" style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", padding: "12px 24px", fontWeight: 600, textDecoration: "none", fontSize: "14px", fontFamily: "'DM Sans', sans-serif" }}>
              Browse Products
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
            {reviews.map(r => (
              <div key={r.id} style={{ background: "#fff", border: "1px solid #E2E2DE", padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <div>
                    <StarRow rating={r.rating} />
                    {r.title && <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#1A1A1A", marginTop: "4px" }}>{r.title}</div>}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B" }}>{new Date(r.reviewed_at ?? r.created_at).toLocaleDateString()}</div>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#1A1A1A", lineHeight: 1.65, marginBottom: "12px" }}>{r.body}</p>
                {r.reply_text && (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#4A4A4A", background: "#F8F8F6", borderLeft: "2px solid #E2E2DE", padding: "8px 12px", marginBottom: "12px", lineHeight: 1.55 }}>
                    <strong style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em", color: "#6B6B6B" }}>Reply from the store</strong>
                    <div style={{ marginTop: "3px" }}>{r.reply_text}</div>
                  </div>
                )}
                {r.product_slug && (
                  <Link href={`/products/${r.product_slug}`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--brand-primary, #1C3557)", fontWeight: 600, textDecoration: "none" }}>
                    → {r.product_name ?? "View Product"}
                  </Link>
                )}
                {r.source === "google" ? (
                  // Google requires the author's name and photo with a review,
                  // and credit to Google Maps.
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    {r.reviewer_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.reviewer_photo_url} alt="" referrerPolicy="no-referrer" style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#E2E2DE", display: "inline-block" }} />
                    )}
                    <span>{r.reviewer_name}</span>
                    <a href={r.source_url ?? undefined} target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: "auto", color: "#6B6B6B", fontSize: "11px", textDecoration: "none" }}>
                      via Google Maps
                    </a>
                  </div>
                ) : (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "#6B6B6B", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    — {r.reviewer_name}{r.reviewer_company ? `, ${r.reviewer_company}` : ""}
                    {r.is_verified && <span style={{ background: "rgba(5,150,105,.1)", color: "#059669", fontSize: "10px", fontWeight: 700, padding: "1px 5px" }}>Verified</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
