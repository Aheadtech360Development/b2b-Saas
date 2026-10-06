"use client";

/**
 * A menu: across with dropdowns on a wide screen, a button that opens a
 * drawer on a narrow one.
 *
 * Which of the two shows is decided by CSS (a container query on the site),
 * not here — so the server's HTML is already right for the screen it lands
 * on, and the editor's phone canvas shows the button even inside a wide
 * window. This component only adds what CSS cannot do: opening the drawer,
 * opening a dropdown by tap on a touch screen, and closing on Escape.
 *
 * The drawer is drawn on the page body, outside the site: the site wrapper
 * is a size container, and a container holds its fixed-position children
 * inside itself — a drawer drawn in place would open inside the header.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleUser, Menu as MenuIcon, Search, ShoppingCart, X } from "lucide-react";
import type { MenuItem } from "@/lib/builder/types";
import { safeHref } from "@/lib/builder/sanitize";

interface Props {
  id: string;
  items: MenuItem[];
  layout: "horizontal" | "vertical";
  mobile: "drawer" | "inline";
  label: string;
  /** A heading over the links — a footer column's "Shop", "Help". */
  title?: string;
  /** In the editor: clicks select, they do not navigate or open. */
  edit?: boolean;
}

function Item({ item, depth, edit }: { item: MenuItem; depth: number; edit?: boolean }) {
  const [open, setOpen] = useState(false);
  const kids = (item.children ?? []).filter((c) => c && c.label);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <li ref={ref} className="b-menu-item" data-open={open ? "" : undefined}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <a className="b-menu-link" href={safeHref(item.href) || "#"}>{item.label}</a>
      {kids.length > 0 && (
        <>
          <button type="button" className="b-menu-caret" aria-expanded={open}
                  aria-label={`Show the ${item.label} menu`} tabIndex={edit ? -1 : 0}
                  onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={15} aria-hidden />
          </button>
          <ul className="b-menu-sub">
            {kids.map((c, i) => <Item key={`${c.label}-${i}`} item={c} depth={depth + 1} edit={edit} />)}
          </ul>
        </>
      )}
    </li>
  );
}

function DrawerList({ items }: { items: MenuItem[] }) {
  return (
    <ul>
      {items.filter((i) => i && i.label).map((item, i) => {
        const kids = (item.children ?? []).filter((c) => c && c.label);
        if (!kids.length) {
          return <li key={`${item.label}-${i}`}><a href={safeHref(item.href) || "#"}>{item.label}</a></li>;
        }
        return (
          <li key={`${item.label}-${i}`}>
            <details>
              <summary>{item.label}</summary>
              <ul>
                {safeHref(item.href) && <li><a href={safeHref(item.href)}>All {item.label.toLowerCase()}</a></li>}
              </ul>
              <DrawerList items={kids} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export default function MenuNav({ id, items, layout, mobile, label, title, edit }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  // Following a link in the drawer goes to another page; the drawer closes.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const toggle = toggleRef.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      toggle?.focus();
    };
  }, [open]);

  const list = items.filter((i) => i && i.label);
  const drawer = layout === "horizontal" && mobile === "drawer";

  return (
    <nav data-b={id} className="b-menu" data-layout={layout} data-mobile={drawer ? "drawer" : "inline"} aria-label={label}>
      {title && <div className="b-menu-title">{title}</div>}
      <ul className="b-menu-list">
        {list.map((item, i) => <Item key={`${item.label}-${i}`} item={item} depth={0} edit={edit} />)}
      </ul>
      {drawer && (
        <button ref={toggleRef} type="button" className="b-menu-toggle" aria-label="Open the menu"
                aria-expanded={open} onClick={() => { if (!edit) setOpen(true); }}>
          <MenuIcon size={22} aria-hidden />
        </button>
      )}
      {drawer && open && mounted && createPortal(
        <div className="bsite-layer" role="dialog" aria-modal="true" aria-label={label}>
          <div className="b-drawer-back" onClick={() => setOpen(false)} />
          <div className="b-drawer">
            <div className="b-drawer-head">
              <span>Menu</span>
              <button ref={closeRef} type="button" className="b-drawer-close" aria-label="Close the menu"
                      onClick={() => setOpen(false)}>
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="b-drawer-body"><DrawerList items={list} /></div>
            {/* The three places every shop has, where a thumb can reach them —
                whatever the header itself has room to show on a phone. */}
            <div className="b-drawer-foot">
              <ul>
                <li><a href="/search"><Search size={19} aria-hidden /> Search</a></li>
                <li><a href="/account"><CircleUser size={19} aria-hidden /> My account</a></li>
                <li><a href="/cart"><ShoppingCart size={19} aria-hidden /> Cart</a></li>
              </ul>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}
