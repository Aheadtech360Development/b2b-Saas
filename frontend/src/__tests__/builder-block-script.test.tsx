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
    // `block` is this block's element.
    expect(script!.textContent).toContain('document.querySelector("[data-b=\\"blk1\\"]")');
    expect(script!.closest('[data-b="blk1"]')).not.toBeNull();
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
