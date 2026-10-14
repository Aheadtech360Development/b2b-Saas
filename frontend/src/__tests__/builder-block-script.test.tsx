/**
 * A Custom HTML block's own JavaScript.
 *
 * The manager asked for a JavaScript box beside the block's HTML and CSS. It
 * runs on the live site, inside the block, in a script of its own; never in
 * the builder's editor, which is the admin's own session; and only an
 * Administrator writes it (the server refuses anybody else).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const auth = { user: { role: "tenant_admin", is_platform_admin: false, scopes: null } as Record<string, unknown> };
vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: typeof auth) => unknown) => pick(auth) }));

import { Tree, type RenderCtx } from "@/components/builder/render";
import { FieldControl, type EditorEnv } from "@/components/builder/editor/fields";
import { BY_TYPE } from "@/lib/builder/registry";
import { blockScriptText } from "@/components/builder/islands/BlockScript";
import type { BuilderNode } from "@/lib/builder/types";

const CODE = "block.querySelector('p').textContent = 'From the script';";
const node = { id: "blk1", type: "html", props: { html: "<p>Hi</p>", css: "", js: CODE } } as unknown as BuilderNode;
const ctx = (over: Partial<RenderCtx>) => ({
  data: { product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "S", logo: "" } },
  globals: {}, page: null, query: "", route: "page", ...over,
}) as unknown as RenderCtx;

beforeEach(() => {
  document.body.innerHTML = "";
  auth.user = { role: "tenant_admin", is_platform_admin: false, scopes: null };
});

describe("the block's JavaScript", () => {
  it("runs on the live site, inside the block, in a script of its own", () => {
    const { container } = render(<Tree tree={node} ctx={ctx({ trusted: true })} />);
    const script = container.querySelector('script[data-block-script="blk1"]');
    expect(script).not.toBeNull();
    expect(script!.textContent).toContain(CODE);
    // `block` is the element the script sits in: this block.
    expect(script!.textContent).toContain("document.currentScript.parentElement");
    expect(script!.parentElement!.getAttribute("data-b")).toBe("blk1");
  });

  it("runs for each place a block is shown, inside that one", () => {
    // A shared section can show the same block twice on a page.
    const twice = { id: "sec", type: "section", props: {}, children: [
      { id: "g1", type: "global_ref", props: { ref: "shared" } },
      { id: "g2", type: "global_ref", props: { ref: "shared" } },
    ] } as unknown as BuilderNode;
    const { container } = render(<Tree tree={twice} ctx={ctx({ trusted: true, globals: { shared: node } })} />);
    const holders = Array.from(container.querySelectorAll('[data-b="blk1"]'));
    expect(holders).toHaveLength(2);
    for (const h of holders) expect(h.querySelectorAll(":scope > script[data-block-script]")).toHaveLength(1);
  });

  it("never runs in the editor: the editor says where it runs instead", () => {
    const html = renderToStaticMarkup(<Tree tree={node} ctx={ctx({ edit: true, trusted: false })} />);
    expect(html).toContain("runs on the live site, not in the editor");
    const { container } = render(<Tree tree={node} ctx={ctx({ edit: true, trusted: false })} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not run from markup the server has not cleaned", () => {
    const { container } = render(<Tree tree={node} ctx={ctx({ trusted: false })} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("is its own box on the Custom HTML block, beside HTML and CSS", () => {
    expect(BY_TYPE.html!.fields.map((f) => f.key)).toEqual(["html", "css", "js"]);
    expect(BY_TYPE.html!.fields.find((f) => f.key === "js")!.kind).toBe("js");
  });

  it("is written by an Administrator", () => {
    const changed = vi.fn();
    const field = BY_TYPE.html!.fields.find((f) => f.key === "js")!;
    const { getByRole, queryByText } = render(
      <FieldControl field={field} value={CODE} onChange={changed} env={{} as EditorEnv} />);
    const box = getByRole("textbox", { name: "JavaScript" }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(false);
    expect(queryByText(/Only an Administrator/)).toBeNull();
  });

  it("is read-only for an Editor or a Manager, with the reason", () => {
    for (const role of ["tenant_editor", "tenant_manager"]) {
      auth.user = { role, is_platform_admin: false, scopes: null };
      const field = BY_TYPE.html!.fields.find((f) => f.key === "js")!;
      const { getByRole, getByText, unmount } = render(
        <FieldControl field={field} value={CODE} onChange={vi.fn()} env={{} as EditorEnv} />);
      expect((getByRole("textbox", { name: "JavaScript" }) as HTMLTextAreaElement).readOnly).toBe(true);
      expect(getByText("Only an Administrator can add or change JavaScript.")).toBeInTheDocument();
      unmount();
    }
  });
});

/**
 * Code copied from elsewhere is usually written for a page still loading; the
 * block's runs once the page has loaded. The wrapper is run here as the
 * browser would run it, `document.currentScript` being the block's script.
 */
describe("code written for a page still loading", () => {
  const tick = () => new Promise((r) => setTimeout(r, 20));
  let holder: HTMLElement;

  function run(code: string) {
    const script = document.createElement("script");
    holder.appendChild(script);
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });
    try {
      (0, eval)(blockScriptText(code));
    } finally {
      delete (document as unknown as Record<string, unknown>).currentScript;
    }
  }

  // What the wrapper changes while the code runs, as it was before.
  const PATCHED = [[document, "addEventListener"], [window, "addEventListener"], [document, "write"], [document, "writeln"]] as const;
  const looks = () => PATCHED.map(([at, name]) => {
    const own = Object.getOwnPropertyDescriptor(at, name);
    return own ? (own.value ?? own.get) : "inherited";
  });
  let before: unknown[];
  const untouched = () => expect(looks()).toEqual(before);

  beforeEach(() => {
    document.body.innerHTML = '<p id="elsewhere">The rest of the page</p><div data-b="blk1"><p>Hi</p></div>';
    holder = document.querySelector('[data-b="blk1"]') as HTMLElement;
    window.onload = null;
    before = looks();
    expect(document.readyState).toBe("complete");
  });

  it("still runs code that waits for DOMContentLoaded or load", async () => {
    run(`document.addEventListener("DOMContentLoaded", function () { block.querySelector("p").textContent = "Ready"; });
         window.addEventListener("load", function () { block.dataset.loaded = "yes"; });
         window.onload = function () { block.dataset.onload = "yes"; };`);
    await tick();
    expect(holder.querySelector("p")!.textContent).toBe("Ready");
    expect(holder.dataset.loaded).toBe("yes");
    expect(holder.dataset.onload).toBe("yes");
    expect(window.onload).toBeNull();
    untouched();
  });

  it("writes into the block, not over the page", () => {
    run(`document.write("<em>Written</em>");`);
    expect(holder.querySelector("em")!.textContent).toBe("Written");
    expect(document.getElementById("elsewhere")).not.toBeNull();
    untouched();
  });

  it("other events are listened for as usual", async () => {
    run(`block.addEventListener("click", function () { block.dataset.clicked = "yes"; });
         document.addEventListener("pc-test", function () { block.dataset.heard = "yes"; });`);
    holder.click();
    document.dispatchEvent(new Event("pc-test"));
    expect(holder.dataset.clicked).toBe("yes");
    expect(holder.dataset.heard).toBe("yes");
    untouched();
  });

  it("the code's own names do not get in the way", async () => {
    run(`var d = 1, w = 2, kept = 3, done = 4, soon = 5;
         document.addEventListener("DOMContentLoaded", function () { block.dataset.ok = "yes"; });`);
    await tick();
    expect(holder.dataset.ok).toBe("yes");
    untouched();
  });

  it("a mistake in the code still puts everything back", () => {
    expect(() => run(`document.write("<b>x</b>"); throw new Error("a mistake");`)).toThrow("a mistake");
    untouched();
  });
});
