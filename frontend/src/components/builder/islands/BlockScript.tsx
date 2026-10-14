"use client";

/**
 * A Custom HTML block's own JavaScript, run on the live site.
 *
 * The block's HTML never carries a script (lib/builder/sanitize, and the
 * server's): this is the script the brand's Administrator wrote in the block's
 * JavaScript box (backend services/builder/scripts.py). It runs once the page
 * is in the browser, after the block's HTML, in a script of its own, so a
 * mistake in it stops that script and nothing else on the page. `block` is the
 * block's own element, for code that works on what the block shows.
 *
 * The renderer draws this only on the storefront and the draft preview, never
 * in the builder's editor.
 */
import { useEffect, useRef } from "react";

/**
 * The script as the browser runs it.
 *
 * The page has finished loading by the time it runs, and code copied from
 * elsewhere is usually written for a page still loading. While it runs: a
 * wait for DOMContentLoaded or load (addEventListener, or window.onload) is
 * answered straight away instead of never; document.write, which would wipe
 * the whole page now, writes into the block. Everything is put back after.
 * `block` is the element the script sits in, so a block shown twice on a
 * page (a shared section) gets its own each time. The code is a function of
 * its own, so its names cannot clash with these.
 */
export function blockScriptText(code: string): string {
  return `(function (block) {
var d = document, w = window, own = Object.getOwnPropertyDescriptor, onload = w.onload;
var kept = [[d, "addEventListener"], [w, "addEventListener"], [d, "write"], [d, "writeln"]].map(function (k) { return [k[0], k[1], own(k[0], k[1])]; });
var dAdd = d.addEventListener, wAdd = w.addEventListener;
function done(type) { return type === "DOMContentLoaded" ? d.readyState !== "loading" : type === "load" && d.readyState === "complete"; }
function soon(at, type, fn) { setTimeout(function () { var e = new Event(type); if (typeof fn === "function") fn.call(at, e); else if (fn && typeof fn.handleEvent === "function") fn.handleEvent(e); }, 0); }
d.addEventListener = function (type) { if (this === d && type === "DOMContentLoaded" && done(type)) return soon(d, type, arguments[1]); return dAdd.apply(this, arguments); };
w.addEventListener = function (type) { if (this === w && done(type)) return soon(w, type, arguments[1]); return wAdd.apply(this, arguments); };
d.write = d.writeln = function () { if (block) block.insertAdjacentHTML("beforeend", Array.prototype.join.call(arguments, "")); };
try {
(function (block) {
${code}
}).call(w, block);
} finally {
kept.forEach(function (k) { if (k[2]) Object.defineProperty(k[0], k[1], k[2]); else delete k[0][k[1]]; });
if (w.onload !== onload && typeof w.onload === "function" && done("load")) { var late = w.onload; w.onload = onload; soon(w, "load", late); }
}
})(document.currentScript && document.currentScript.parentElement);`;
}

export default function BlockScript({ id, code }: { id: string; code: string }) {
  const mark = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const holder = mark.current?.parentElement;
    if (ran.current || !holder || !code.trim()) return;
    ran.current = true;
    const script = document.createElement("script");
    script.dataset.blockScript = id;
    script.textContent = blockScriptText(code);
    holder.appendChild(script);
  }, [id, code]);

  // Only a mark to find the block by; nothing to see.
  return <span ref={mark} hidden style={{ display: "none" }} />;
}
