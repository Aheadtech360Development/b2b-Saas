"use client";

/**
 * The header's menu on a phone.
 *
 * Below 860px the design hides the nav links and "Log in" and offers nothing
 * in their place, so on a phone there was no way to Pricing or to signing in
 * short of scrolling to the footer — and the footer has no Log in at all. This
 * is that missing way: a button beside "Start free trial", opening the same
 * links under the header. Hidden on wider screens, where the links show.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./marketing.module.css";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/affiliate", label: "Affiliate" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/demo", label: "Book a demo" },
  // An empty ?tenant= signs in at the platform's address, as in the header.
  { href: "/login?tenant=", label: "Log in" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A link was followed: the page under the menu is a new one.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        className={s["menu-btn"]}
        aria-expanded={open}
        aria-controls="mk-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mk-mobile-menu" className={s["menu-panel"]} aria-label="Menu">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={s["menu-link"]} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
