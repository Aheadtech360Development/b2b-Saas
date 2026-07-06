"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";

export default function CtaSection() {
  const { isAuthenticated } = useAuthStore();
  const loggedIn = isAuthenticated();

  return (
    <div style={{ background: "#1C3557", padding: "64px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "38px", fontWeight: 600, color: "#FFFFFF", marginBottom: "16px", lineHeight: 1.2 }}>
          Better Prices. One Application.
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "16px", color: "rgba(255,255,255,0.8)", marginBottom: "32px", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          Apply for a wholesale account and get lower prices on everything we carry.
        </p>
        <Link
          href={loggedIn ? "/account" : "/wholesale/register"}
          style={{ background: "#FFFFFF", color: "#1C3557", padding: "13px 30px", fontSize: "14px", fontWeight: 600, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", display: "inline-block" }}
        >
          Apply for Wholesale Account →
        </Link>
        <div style={{ marginTop: "16px" }}>
          <Link href="/login" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>
            Already have an account? Sign in →
          </Link>
        </div>
      </div>
    </div>
  );
}
