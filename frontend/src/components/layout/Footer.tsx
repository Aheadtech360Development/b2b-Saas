"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";

export function Footer() {
  const { isAuthenticated } = useAuthStore();
  const branding = useBranding();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authed = mounted && isAuthenticated();

  const cols = [
    {
      h: "Shop",
      links: [
        { label: "Shop All Products", href: "/products" },
        { label: "T-Shirts", href: "/products?category=t-shirts" },
        { label: "Hoodies", href: "/products?category=hoodies" },
        { label: "Sweatshirts", href: "/products?category=sweatshirts" },
        { label: "Polos", href: "/products?category=polo-shirts" },
      ],
    },
    {
      h: "Resources",
      links: [
        { label: "Blog", href: "/blog" },
        { label: "Product Specs", href: "/product-specs" },
        { label: "Style Sheets", href: "/style-sheets" },
        { label: "About Us", href: "/about" },
      ],
    },
    {
      h: "Account",
      links: [
        { label: "Apply for Wholesale", href: authed ? "/account" : "/wholesale/register" },
        { label: authed ? "My Account" : "Log In", href: authed ? "/account" : "/login" },
        { label: "Order History", href: "/account/orders" },
      ],
    },
    {
      h: "Support",
      links: [
        { label: "Contact Us", href: "/contact" },
        { label: "Track Order", href: "/track-order" },
        { label: "Privacy Policy", href: "/privacy-policy" },
      ],
    },
  ];

  return (
    <footer style={{ background: "#FFFFFF", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "56px 24px 32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "32px" }} className="footer-grid-responsive">
        {cols.map(col => (
          <div key={col.h}>
            <h5 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#1A1A1A", marginBottom: "16px" }}>{col.h}</h5>
            {col.links.map(link => (
              <Link
                key={link.label}
                href={link.href}
                style={{ display: "block", fontSize: "14px", color: "#6B6B6B", marginBottom: "10px", textDecoration: "none", transition: "color .15s", fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#1C3557")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6B6B6B")}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #E2E2DE", padding: "20px 24px", maxWidth: "1500px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: "#6B6B6B", fontFamily: "'DM Sans', sans-serif" }}>
          © {new Date().getFullYear()} {branding.store_name}. All rights reserved.
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {["VISA", "MC", "AMEX", "ACH", "NET 30"].map(m => (
            <span key={m} style={{ background: "#F8F8F6", color: "#6B6B6B", padding: "4px 10px", fontSize: "11px", fontWeight: 500, border: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif", letterSpacing: ".03em" }}>{m}</span>
          ))}
        </div>
      </div>
    </footer>
  );
}
