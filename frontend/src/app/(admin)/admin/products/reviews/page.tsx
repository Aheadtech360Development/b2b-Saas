"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { SearchIcon, TrashIcon } from "@/components/ui/icons";

const thStyle: React.CSSProperties = {
  padding: "12px 16px", textAlign: "left", fontSize: "11px",
  textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700,
};

interface AdminReview {
  id: string;
  product_name: string;
  product_slug: string;
  reviewer_name: string | null;
  reviewer_company: string | null;
  rating: number;
  body: string;
  is_approved: boolean;
  image_url: string | null;
  created_at: string;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#FBBF24", fontSize: "13px", letterSpacing: "1px" }}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [approvedFilter, setApprovedFilter] = useState<"" | "true" | "false">("");
  const pageSize = 20;

  async function load(p = page) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), page_size: String(pageSize) });
      if (search) qs.set("q", search);
      if (approvedFilter !== "") qs.set("approved", approvedFilter);
      const data = await apiClient.get<{ reviews: AdminReview[]; total: number }>(
        `/api/v1/admin/reviews?${qs}`
      );
      setReviews(data?.reviews ?? []);
      setTotal(data?.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); load(1); }, [search, approvedFilter]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  async function handleApprove(id: string, approved: boolean) {
    await apiClient.patch(`/api/v1/admin/reviews/${id}`, { is_approved: approved });
    setReviews(prev => prev.map(r => r.id === id ? { ...r, is_approved: approved } : r));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this review? This cannot be undone.")) return;
    await apiClient.delete(`/api/v1/admin/reviews/${id}`);
    setReviews(prev => prev.filter(r => r.id !== id));
    setTotal(t => t - 1);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <button
            onClick={() => router.push("/admin/products")}
            style={{ background: "none", border: "none", color: "#7A7880", cursor: "pointer", fontSize: "13px", padding: 0, marginBottom: "4px" }}
          >
            ← Products
          </button>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>REVIEWS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Manage customer reviews · {total} total</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "240px", position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex" }}>
            <SearchIcon size={14} color="#aaa" />
          </span>
          <input
            placeholder="Search by reviewer name or review text…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "14px", fontFamily: "var(--font-jakarta)", boxSizing: "border-box", outline: "none" }}
          />
        </div>
        <select
          value={approvedFilter}
          onChange={e => setApprovedFilter(e.target.value as "" | "true" | "false")}
          style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}
        >
          <option value="">All Reviews</option>
          <option value="true">Approved</option>
          <option value="false">Pending Approval</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "2px solid #E2E0DA" }}>
              <th style={thStyle}>Reviewer</th>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Rating</th>
              <th style={{ ...thStyle, maxWidth: "320px" }}>Review</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && reviews.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "48px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>Loading…</td></tr>
            ) : error ? (
              <tr>
                <td colSpan={7} style={{ padding: "48px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", color: "#E8242A", fontWeight: 600, marginBottom: "8px" }}>Failed to load reviews</div>
                  <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "16px" }}>{error}</div>
                  <button onClick={() => load()} style={{ padding: "8px 20px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Retry</button>
                </td>
              </tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "56px", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>⭐</div>
                  <div style={{ fontSize: "14px", color: "#aaa", fontWeight: 600 }}>No reviews found</div>
                </td>
              </tr>
            ) : reviews.map(review => (
              <tr
                key={review.id}
                style={{ borderBottom: "1px solid #F4F3EF" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFAFA")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                {/* Reviewer */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>
                    {review.reviewer_name || "Anonymous"}
                  </div>
                  {review.reviewer_company && (
                    <div style={{ fontSize: "11px", color: "#7A7880" }}>{review.reviewer_company}</div>
                  )}
                </td>

                {/* Product */}
                <td style={{ padding: "14px 16px" }}>
                  <a
                    href={`/admin/products/${review.product_slug}/edit`}
                    style={{ fontSize: "13px", color: "#1A5CFF", textDecoration: "none", fontWeight: 600 }}
                    onClick={e => { e.preventDefault(); router.push(`/admin/products/${review.product_slug}/edit`); }}
                  >
                    {review.product_name}
                  </a>
                </td>

                {/* Rating */}
                <td style={{ padding: "14px 16px" }}>
                  <StarDisplay rating={review.rating} />
                </td>

                {/* Body */}
                <td style={{ padding: "14px 16px", maxWidth: "320px" }}>
                  <div style={{ fontSize: "13px", color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>
                    {review.body}
                  </div>
                  {review.image_url && (
                    <div style={{ marginTop: "4px" }}>
                      <a href={review.image_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#1A5CFF" }}>📷 View image</a>
                    </div>
                  )}
                </td>

                {/* Date */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: "12px", color: "#7A7880" }}>
                    {new Date(review.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: "14px 16px" }}>
                  <span style={{
                    padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                    background: review.is_approved ? "rgba(5,150,105,.1)" : "rgba(245,158,11,.1)",
                    color: review.is_approved ? "#059669" : "#D97706",
                  }}>
                    {review.is_approved ? "● Approved" : "○ Pending"}
                  </span>
                </td>

                {/* Actions */}
                <td style={{ padding: "14px 16px", textAlign: "center" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                    {review.is_approved ? (
                      <button
                        onClick={() => handleApprove(review.id, false)}
                        style={{ padding: "5px 10px", background: "rgba(245,158,11,.1)", color: "#D97706", border: "1px solid rgba(245,158,11,.3)", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Reject
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApprove(review.id, true)}
                        style={{ padding: "5px 10px", background: "rgba(5,150,105,.1)", color: "#059669", border: "1px solid rgba(5,150,105,.3)", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(review.id)}
                      style={{ background: "none", border: "1px solid #FECACA", borderRadius: "5px", cursor: "pointer", color: "#E8242A", padding: "5px 8px", display: "inline-flex" }}
                    >
                      <TrashIcon size={13} color="#E8242A" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>{total} reviews · Page {page} of {Math.max(1, totalPages)}</span>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: "6px 12px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: page === 1 ? 0.4 : 1 }}
            >← Prev</button>
            <span style={{ padding: "6px 12px", fontSize: "13px", fontWeight: 600 }}>Page {page}</span>
            <button
              disabled={page >= totalPages || totalPages === 0}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: "6px 12px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: (page >= totalPages || totalPages === 0) ? 0.4 : 1 }}
            >Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
