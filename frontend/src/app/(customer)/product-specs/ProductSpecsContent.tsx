"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface ProductSpec {
  id: string;
  title: string;
  pdf_url: string | null;
  is_active: boolean;
}

export default function ProductSpecsPage() {
  const [status, setStatus] = useState<"loading" | "redirecting" | "none">("loading");

  useEffect(() => {
    apiClient
      .get<ProductSpec[]>("/api/v1/product-specs")
      .then((res) => {
        const list: ProductSpec[] = (res as any).data ?? res ?? [];
        const first = list.find((s) => s.is_active && s.pdf_url);
        if (first?.pdf_url) {
          setStatus("redirecting");
          window.location.replace(first.pdf_url);
        } else {
          setStatus("none");
        }
      })
      .catch(() => setStatus("none"));
  }, []);

  if (status === "loading" || status === "redirecting") {
    return (
      <div
        style={{
          background: "#F4F3EF",
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 32px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <FileText
            size={40}
            style={{ color: "#D0CECC", marginBottom: "16px" }}
          />
          <p
            style={{
              fontSize: "14px",
              color: "#7A7880",
              fontWeight: 600,
            }}
          >
            {status === "redirecting" ? "Opening PDF…" : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#F4F3EF",
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "480px" }}>
        <FileText
          size={48}
          style={{ color: "#D0CECC", marginBottom: "20px" }}
        />
        <h1
          style={{
            fontFamily: "var(--font-bebas)",
            fontSize: "48px",
            letterSpacing: ".04em",
            color: "#2A2830",
            marginBottom: "12px",
          }}
        >
          Product Specs
        </h1>
        <p
          style={{
            fontSize: "15px",
            color: "#7A7880",
            lineHeight: 1.7,
            marginBottom: "28px",
          }}
        >
          Our product specification PDF is coming soon. Check back shortly or
          contact us for detailed garment specs.
        </p>
        <a
          href="/contact"
          style={{
            display: "inline-block",
            background: "#2A2830",
            color: "#fff",
            borderRadius: "8px",
            padding: "10px 24px",
            fontSize: "13px",
            fontWeight: 700,
            textDecoration: "none",
            letterSpacing: ".04em",
          }}
        >
          Contact Us
        </a>
      </div>
    </div>
  );
}
