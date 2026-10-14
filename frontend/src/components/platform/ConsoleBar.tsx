"use client";

/**
 * The Platform Console's bar, as the owner's design draws it: the wordmark,
 * the console's tabs and the super admin's avatar, on every tab. Which tab is
 * open stays with the page; the bar only shows it and asks for another.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Count, Icon, ROOT } from "@/components/partners/ui";
import { useAuthStore } from "@/stores/auth.store";

export type ConsoleTab = "brands" | "analytics" | "taxes" | "activity" | "search" | "health" | "affiliates";

const TABS: [ConsoleTab, string][] = [
  ["brands", "Brands"],
  ["analytics", "Analytics"],
  ["taxes", "Taxes"],
  ["activity", "Activity"],
  ["search", "Search"],
  ["health", "Brand Health"],
  ["affiliates", "Affiliates"],
];

export function ConsoleBar({ tab, onTab, affiliates }: {
  tab: ConsoleTab; onTab: (tab: ConsoleTab) => void; affiliates: number;
}) {
  // On a phone the tabs slide inside the bar: the open one is brought into view.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>("button.on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <div className={ROOT}>
      <header className="contop">
        <div className="brand">
          <button type="button" onClick={() => onTab("brands")}>PrintCoPilot</button>
          <span className="chip navy">Platform Console</span>
        </div>
        <nav className="ctabs" aria-label="Console sections" ref={nav}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? "on" : ""}
                    aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
              {label}
              {key === "affiliates" ? <Count n={affiliates} tone="warn" /> : null}
            </button>
          ))}
        </nav>
        <AccountMenu />
      </header>
    </div>
  );
}

/** The avatar, and under it who is signed in and the way out. */
function AccountMenu() {
  const email = useAuthStore((s) => s.user?.email);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const avatar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      avatar.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function logOut() {
    clearAuth();
    router.replace("/login");
  }

  // Tabbing out of the menu closes it. Focus that goes nowhere (a click on
  // the page, or Safari not focusing a clicked button) is left to the
  // pointer handler, so a click on Log out still lands.
  return (
    <div className="acct" ref={box}
         onBlur={(e) => { if (e.relatedTarget && !box.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button ref={avatar} type="button" className="av" aria-label="Account" aria-expanded={open}
              aria-controls="console-account" onClick={() => setOpen(!open)}>SA</button>
      {open ? (
        <div className="menu" id="console-account">
          <div className="who">
            <div className="b ink sm">{email}</div>
            <div className="xs muted">Super admin</div>
          </div>
          <button type="button" onClick={logOut}><Icon name="logout" />Log out</button>
        </div>
      ) : null}
    </div>
  );
}
