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

  // If the brand assigned a Footer menu, render it (top-level items become
  // columns, their sub-items become the links). Otherwise fall back to a
  // sensible default set of columns.
  const footerMenu = branding.footer_menu_items ?? [];
  const cols = footerMenu.length > 0
    ? footerMenu.map((it) => ({
        h: it.label,
        links: (it.children && it.children.length > 0)
          ? it.children.map((c) => ({ label: c.label, href: c.href || "#" }))
          : [{ label: it.label, href: it.href || "#" }],
      }))
    : [
        {
          h: "Shop",
          links: [
            { label: "Shop All Products", href: "/products" },
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
          ],
        },
      ];

  return (
    <footer style={{ background: "#FFFFFF", borderTop: "1px solid #E2E2DE" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "56px 24px 32px", display: "grid", gridTemplateColumns: `repeat(${Math.min(Math.max(cols.length, 1), 4)}, 1fr)`, gap: "32px" }} className="footer-grid-responsive">
        {cols.map(col => (
          <div key={col.h}>
            <h5 style={{ fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)", fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#1A1A1A", marginBottom: "16px" }}>{col.h}</h5>
            {col.links.map(link => (
              <Link
                key={link.label}
                href={link.href}
                style={{ display: "block", fontSize: "14px", color: "#6B6B6B", marginBottom: "10px", textDecoration: "none", transition: "color .15s", fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)", fontWeight: 400 }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--brand-primary, #1C3557)")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6B6B6B")}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #E2E2DE", padding: "20px 24px", maxWidth: "1500px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: "#6B6B6B", fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)" }}>
          © {new Date().getFullYear()} {branding.store_name}. All rights reserved.
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {["VISA", "MC", "AMEX", "ACH", "NET 30"].map(m => (
            <span key={m} style={{ background: "#F8F8F6", color: "#6B6B6B", padding: "4px 10px", fontSize: "11px", fontWeight: 500, border: "1px solid #E2E2DE", fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)", letterSpacing: ".03em" }}>{m}</span>
          ))}
        </div>
      </div>
    </footer>
  );
}
