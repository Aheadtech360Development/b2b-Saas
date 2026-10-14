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
 * The renderer draws this only on the storefront, never in the builder's
 * editor, where it would run in the admin's own session.
 */
import { useEffect, useRef } from "react";

export default function BlockScript({ id, code }: { id: string; code: string }) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !code.trim()) return;
    ran.current = true;
    const holder = document.querySelector(`[data-b="${CSS.escape(id)}"]`);
    const script = document.createElement("script");
    script.dataset.blockScript = id;
    script.textContent =
      `(function (block) {\n${code}\n})(document.querySelector(${JSON.stringify(`[data-b="${id}"]`)}));`;
    (holder ?? document.body).appendChild(script);
  }, [id, code]);

  return null;
}
