"use client";

/**
 * ChatMarkdown — renders the bit of Markdown a chat reply actually uses.
 *
 * Models write **bold**, bullet lists and numbered steps by habit. Shown as raw
 * text those markers are just noise in the middle of an answer, so they are
 * rendered: bullets as a list, bold as bold, the rest as paragraphs.
 *
 * Everything is built as React elements — no HTML is ever set from the model's
 * output, so a reply that contains markup cannot inject anything into the page.
 */
import { Fragment, type ReactNode } from "react";
import Link from "next/link";

const LINK: React.CSSProperties = { color: "#1A1A1A", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: "2px" };

/**
 * Links are rendered only when they point inside this app — a path starting
 * with a single "/". Anything else (an off-site URL, a javascript: or data:
 * href, "//host") stays plain text, so a reply can never become a link out of
 * the admin, however it was worded.
 */
function isInternal(href: string): boolean {
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(href);
}

/** **bold**, *italic*, `code` and [text](/path) inside one line. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|(?<![*\w])\*(?!\s)([^*]+?)(?<!\s)\*(?!\w))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyBase}-i${i++}`;
    const link = token.startsWith("[") ? /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) : null;
    if (link) {
      const [, label, href] = link as unknown as [string, string, string];
      out.push(
        isInternal(href)
          ? <Link key={key} href={href} style={LINK}>{label}</Link>
          : <Fragment key={key}>{label}</Fragment>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(<strong key={key} style={{ fontWeight: 700 }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} style={{ background: "rgba(0,0,0,.06)", borderRadius: "4px", padding: "1px 4px", fontSize: ".92em" }}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[*-]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

export function ChatMarkdown({ text }: { text: string }) {
  const lines = (text || "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} style={{ margin: "4px 0", paddingLeft: "18px", display: "grid", gap: "3px" }}>
        {items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  const flushPara = () => {
    if (!para.length) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} style={{ margin: 0 }}>
        {para.map((line, i) => (
          <Fragment key={i}>{i > 0 && <br />}{inline(line, `${key}-${i}`)}</Fragment>
        ))}
      </p>,
    );
    para = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);

    if (bullet) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]!);
    } else if (numbered) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[2]!);
    } else if (!line.trim()) {
      flushList();
      flushPara();
    } else {
      flushList();
      // A heading's #s are noise in a chat bubble; keep the words.
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushList();
  flushPara();

  return <div style={{ display: "grid", gap: "6px" }}>{blocks}</div>;
}
