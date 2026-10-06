"use client";

/**
 * The shop's search box, and what it finds while the shopper is still typing.
 *
 * Server-rendered as the plain form it always was — the shop's search page,
 * a box called q, a button — so it searches with no script at all. Once the
 * page is running, two letters bring up the shop's best few matches under the
 * box, found the way the search page finds them, so the list and the page
 * behind Enter agree. A gang sheet made in the builder opens the builder
 * itself; everything else its own page.
 *
 * Arrow keys move through the list, Enter opens the one chosen — or searches,
 * when none is — and Escape closes it. Choosing is a click on the suggestion's
 * own link, so whatever watches links (the draft's preview) sees it as one.
 *
 * The header's search icon opens the same box in a panel over the page,
 * drawn on the page body for the reason MenuNav's drawer is.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { safeHref, safeSrc } from "@/lib/builder/sanitize";

export interface Suggestion { title: string; url: string; image: string; price: string; builder: boolean }
interface Found { query: string; total: number; items: Suggestion[] }

/** Letters typed before anything is suggested. */
export const SUGGEST_FROM = 2;
const WAIT_MS = 180;

/** What was typed, as it is asked for: trimmed, one space between words. */
export const suggestQuery = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 80);

export function SearchBox({ id, query, placeholder, autoFocus, edit }: {
  id: string;
  query: string;
  placeholder: string;
  autoFocus?: boolean;
  /** In the editor: the box is drawn, nothing is asked. */
  edit?: boolean;
}) {
  const [value, setValue] = useState(query);
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [active, setActive] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const options = useRef<(HTMLAnchorElement | null)[]>([]);
  const asked = useRef(new Map<string, Found>());
  const latest = useRef("");
  const listId = `${useId()}-list`;

  const q = suggestQuery(value);
  const ready = !edit && open && q.length >= SUGGEST_FROM;

  useEffect(() => {
    latest.current = q;
    if (!ready) return;
    const known = asked.current.get(q.toLowerCase());
    if (known) {
      setFound(known);
      setWaiting(false);
      return;
    }
    setWaiting(true);
    const timer = setTimeout(() => {
      apiClient.get<Found>(`/api/v1/storefront/search/suggest?q=${encodeURIComponent(q)}`, { skipAuth: true })
        .then((answer) => {
          asked.current.set(q.toLowerCase(), answer);
          if (latest.current === q) setFound(answer);
        })
        .catch(() => { if (latest.current === q) setFound(null); })
        .finally(() => { if (latest.current === q) setWaiting(false); });
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [q, ready]);

  // A new list starts with nothing chosen.
  useEffect(() => setActive(-1), [found]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!form.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Only what is safe to link to and show, and only for what is in the box now.
  const current = found && suggestQuery(found.query).toLowerCase() === q.toLowerCase() ? found : null;
  const items = (current?.items ?? []).filter((s) => safeHref(s.url));
  const shown = ready && (!!current || waiting);
  const more = current ? Math.max(current.total, items.length) : 0;

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => e.key === "ArrowDown" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, -1));
    } else if (e.key === "Enter" && shown && active >= 0 && options.current[active]) {
      e.preventDefault();
      options.current[active]?.click();
    } else if (e.key === "Escape" && shown) {
      // The list closes first; a second Escape is the panel's, or the box's own.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    // Searching or choosing leaves the page, so nothing here closes the panel
    // the box may sit in: a form taken off the page as it is sent is not sent.
    <form ref={form} data-b={id || undefined} className="b-search-field" action="/search" method="get" role="search"
          onSubmit={() => setOpen(false)}>
      {/* On the search page with nothing typed yet — where the header's search
          icon lands — the cursor is already in the box. */}
      <input name="q" type="search" value={value} placeholder={placeholder} aria-label="Search products"
             maxLength={80} autoFocus={autoFocus} autoComplete="off"
             role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId}
             aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
             onChange={(e) => { setValue(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)} onKeyDown={onKey} />
      <button type="submit" aria-label="Search"><Search size={18} aria-hidden /></button>
      {shown && (
        <div className="b-suggest">
          <div id={listId} role="listbox" aria-label="Suggested products">
            {items.map((s, i) => (
              <a key={`${s.url}-${i}`} id={`${listId}-${i}`} ref={(el) => { options.current[i] = el; }}
                 role="option" aria-selected={i === active} className="b-suggest-item" href={safeHref(s.url)}
                 onMouseEnter={() => setActive(i)}>
                <span className="b-suggest-img">{safeSrc(s.image) && <img src={s.image} alt="" loading="lazy" />}</span>
                <span className="b-suggest-text">
                  <span className="b-suggest-title">{s.title}</span>
                  {s.builder
                    ? <span className="b-suggest-meta" data-builder="">Opens the gang sheet builder</span>
                    : s.price && <span className="b-suggest-meta">{s.price}</span>}
                </span>
              </a>
            ))}
          </div>
          {current && !items.length && (
            <p className="b-suggest-none" role="status">No products match “{q}”.</p>
          )}
          {!current && waiting && <p className="b-suggest-none" role="status">Searching…</p>}
          {more > items.length && (
            <a className="b-suggest-all" href={`/search?q=${encodeURIComponent(q)}`}>
              See all {more} results for “{q}”
            </a>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * The header's search icon. Without a script it is a link to the search page;
 * with one it opens the search box in a panel across the top of the page.
 */
export function SearchIcon({ id, placeholder, edit }: { id: string; placeholder: string; edit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const icon = useRef<HTMLAnchorElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // An Escape the box already used — to close its list — is not this one.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) setOpen(false); };
    document.addEventListener("keydown", onKey);
    const back = icon.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [open]);

  return (
    <>
      <a ref={icon} data-b={id} className="b-iconlink" href="/search" aria-label="Search"
         aria-haspopup="dialog" aria-expanded={open}
         onClick={(e) => {
           // A new tab, or the editor: the link as it is.
           if (edit || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
           e.preventDefault();
           setOpen(true);
         }}>
        <Search size={21} aria-hidden />
      </a>
      {open && mounted && createPortal(
        <div className="bsite-layer" role="dialog" aria-modal="true" aria-label="Search the shop">
          <div className="b-drawer-back" onClick={() => setOpen(false)} />
          <div className="b-spop">
            <div className="b-spop-in">
              <SearchBox id="" query="" placeholder={placeholder} autoFocus />
              <button type="button" className="b-drawer-close" aria-label="Close search" onClick={() => setOpen(false)}>
                <X size={20} aria-hidden />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
