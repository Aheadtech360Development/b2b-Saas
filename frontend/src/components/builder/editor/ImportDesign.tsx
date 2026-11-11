"use client";

/**
 * Site builder → Pages → "Import a design": an HTML design (and the pictures
 * beside it) turned into this site's own pages, header and footer, editable
 * like anything made here. lib/builder/importHtml reads the design; this
 * dialog lets the merchant choose what comes in, uploads the pictures the
 * design carries, makes the header's menu one of the shop's menus, and hands
 * the draft back. Nothing is live until Publish, as with every other change.
 */
import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import {
  applyImport, dropAsset, importBoards, importDesign, importFolder, needsScripts, placeUpload, planFolder, renderWithScripts, sizeAfter,
  unpackBoard, IMPORT_MAX_NODES, SITE_MAX_NODES, type FolderPlan, type ImportedDesign,
} from "@/lib/builder/importHtml";
import type { SiteDoc } from "@/lib/builder/types";
import { menusService } from "@/services/menus.service";
import { Modal, Toggle } from "./ui";

type Stage = "pick" | "reading" | "ready" | "working";

export function ImportDesign({ doc, uploadImage, onClose, onDone }: {
  doc: SiteDoc;
  uploadImage: (file: File) => Promise<string>;
  onClose: () => void;
  /** The draft with the design in it, the pages made, and whether a menu was made. */
  onDone: (next: SiteDoc, info: { slugs: string[]; madeMenu: boolean; home: boolean; skipped: number }) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scripted = useRef<HTMLIFrameElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [design, setDesign] = useState<ImportedDesign | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [header, setHeader] = useState(true);
  const [footer, setFooter] = useState(true);
  const [look, setLook] = useState(true);
  const [progress, setProgress] = useState("");
  const [boardNote, setBoardNote] = useState("");
  // A folder's pages the shop has its own of (checkout, product…): shown, not brought in.
  const [shopPages, setShopPages] = useState<FolderPlan["shop"]>([]);
  const busy = stage === "reading" || stage === "working";

  useEffect(() => () => { if (frame.current) frame.current.srcdoc = ""; }, []);

  async function read(list: FileList | null) {
    const files = Array.from(list ?? []);
    const htmls = files.filter((f) => /\.html?$/i.test(f.name));
    const html = htmls[0];
    if (!html) { setError("Choose the design's .html file (and, if it has them, the pictures beside it), or its whole folder."); return; }
    setError("");
    setBoardNote("");
    setShopPages([]);
    const folder = (html as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0];
    setFileName(htmls.length > 1 ? `${folder ? `the ${folder} folder` : "the folder"} (${htmls.length} pages)` : html.name);
    setStage("reading");
    // A folder of pages, or a page with its own stylesheets and scripts beside it.
    if (htmls.length > 1 || files.some((f) => /\.(css|js)$/i.test(f.name))) {
      try {
        const d = await importFolder(files, frame.current!, scripted.current!, setBoardNote);
        setShopPages(planFolder(files).shop);
        setDesign(d);
        setPages(d.pages.map((p) => p.key));
        setHeader(!!d.header);
        setFooter(!!d.footer);
        setStage("ready");
      } catch (err) {
        setError(err instanceof Error && err.message ? `That design could not be read: ${err.message}` : "That design could not be read.");
        setStage("pick");
      }
      return;
    }
    try {
      let text = await html.text();
      const pictures = files.filter((f) => f !== html && /^image\//.test(f.type));
      // A design drawn by its own scripts (Tailwind's CDN, a design tool's
      // export) is drawn first, out of reach of this page, and read as it then
      // is; a design board's pages, each in a frame of its own, one by one.
      let d: ImportedDesign;
      const board = await unpackBoard(text);
      if (board) {
        // A design tool's board: each page drawn on its own, then all read together.
        const drawnPages: { title: string; html: string }[] = [];
        for (let i = 0; i < board.length; i++) {
          setBoardNote(`Drawing page ${i + 1} of ${board.length}…`);
          const got = await renderWithScripts(board[i]!.html, scripted.current!);
          if (got) drawnPages.push({ title: board[i]!.title, html: got.html });
        }
        if (!drawnPages.length) throw new Error("its pages did not draw. Save each page from the design tool as an HTML file and import that.");
        d = await importBoards(drawnPages, frame.current!, pictures, (i, n) => setBoardNote(`Reading page ${i + 1} of ${n}…`));
      } else {
        const drawn = needsScripts(text) ? await renderWithScripts(text, scripted.current!) : null;
        if (drawn?.boards.length) {
          d = await importBoards(drawn.boards, frame.current!, pictures, (i, n) => setBoardNote(`Reading page ${i + 1} of ${n}…`));
        } else {
          if (drawn) text = drawn.html;
          d = await importDesign(text, frame.current!, pictures);
        }
      }
      setDesign(d);
      setPages(d.pages.map((p) => p.key));
      setHeader(!!d.header);
      setFooter(!!d.footer);
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error && err.message ? `That design could not be read: ${err.message}` : "That design could not be read.");
      setStage("pick");
    }
  }

  async function bringIn() {
    if (!design) return;
    setStage("working");
    setError("");
    let skipped = 0;
    try {
      // Pictures the design carries inside itself, or beside it, onto the shop's media.
      const assets = design.assets;
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i]!;
        setProgress(`Uploading pictures… ${i + 1} of ${assets.length}`);
        try {
          const file = typeof a.source === "string"
            ? new File([await (await fetch(a.source)).blob()], a.name, { type: /^data:([^;,]+)/.exec(a.source)?.[1] ?? "image/png" })
            : a.source;
          placeUpload(a, await uploadImage(file));
        } catch {
          dropAsset(a);
          skipped++;
        }
      }
      // The header's links as one of the shop's menus, so it opens as a drawer on phones.
      let madeMenu = false;
      if (header && design.menu && design.menu.items.length) {
        setProgress("Making the header menu…");
        const made = await menusService.create(`Header (imported ${new Date().toLocaleDateString()})`);
        await menusService.update(made.id, { items: design.menu.items });
        (design.menu.node.props as Record<string, unknown>).menuId = made.id;
        madeMenu = true;
      }
      const { doc: next, slugs } = applyImport(doc, design, { pages, header, footer, look });
      onDone(next, { slugs, madeMenu, home: pages.includes("home"), skipped });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That did not work. Nothing was changed; try again.");
      setStage("ready");
    }
  }

  const tooBig = !!design && design.count > IMPORT_MAX_NODES;
  const nothing = !!design && !pages.length && !(header && design.header) && !(footer && design.footer);
  // The whole site with the design in it: over the limit, it could not be published.
  const after = design ? sizeAfter(doc, design, { pages, header, footer, look }) : 0;
  const overSite = after > SITE_MAX_NODES;

  return (
    <Modal wide title="Import a design" onClose={() => { if (!busy) onClose(); }}
      footer={stage === "ready" || stage === "working" ? (
        <>
          <button type="button" className="sbe-btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="sbe-btn primary" disabled={busy || tooBig || nothing || overSite} onClick={() => void bringIn()} data-import-go>
            {stage === "working" ? progress || "Bringing it in…" : "Bring it in"}
          </button>
        </>
      ) : undefined}>
      {/* The design is laid out here, out of sight, with nothing in it allowed to run. */}
      <iframe ref={frame} title="Design being read" sandbox="allow-same-origin" aria-hidden tabIndex={-1}
        style={{ position: "fixed", left: -20000, top: 0, width: 1280, height: 900, border: 0, pointerEvents: "none" }} />
      {/* Its scripts, if it has any, run here: their own sealed origin, nothing of this page reachable. */}
      <iframe ref={scripted} title="Design being drawn" sandbox="allow-scripts" aria-hidden tabIndex={-1}
        style={{ position: "fixed", left: -20000, top: 0, width: 1280, height: 900, border: 0, pointerEvents: "none" }} />
      {error && <div className="sbe-note bad" role="alert">{error}</div>}
      {(stage === "pick" || stage === "reading") && (
        <div data-import-pick>
          <p className="sbe-help" style={{ fontSize: 13, marginBottom: 12 }}>
            Choose a finished design: its <b>folder</b> (its pages, stylesheets, scripts and pictures together), or one
            <b> .html</b> file. Its pages, header and footer become this site&apos;s own sections, text, pictures and buttons, laid
            out as the design is on a computer, a tablet and a phone, and you edit them here like anything else. The header&apos;s
            links become a menu, its cart and sign-in the shop&apos;s own, and a grid of product cards shows your real products, not
            the design&apos;s sample ones.
          </p>
          {stage === "reading" ? (
            <div className="sbe-btn primary" style={{ cursor: "wait" }} role="status"><FileUp size={15} /> {boardNote || `Reading ${fileName}…`}</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="sbe-btn primary" style={{ cursor: "pointer" }}>
                <FileUp size={15} /> Choose the design&apos;s folder
                <input type="file" multiple hidden data-import-folder
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  onChange={(e) => { void read(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="sbe-btn" style={{ cursor: "pointer" }}>
                Choose files
                <input type="file" accept=".html,.htm,.css,.js,image/*" multiple hidden data-import-file
                  onChange={(e) => { void read(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          )}
        </div>
      )}
      {design && stage !== "pick" && stage !== "reading" && (
        <div data-import-ready>
          <p className="sbe-help" style={{ fontSize: 13, marginBottom: 10 }}>
            Read <b>{fileName}</b>: {design.pages.length === 1 ? "one page" : `${design.pages.length} pages`},
            {" "}{design.count} elements{design.fonts.length ? `, in ${design.fonts.map((f) => f.family).join(" and ")}` : ""}.
            {" "}Nothing changes on your shop until you publish.
          </p>
          {tooBig && <div className="sbe-note bad">That is more than a site can hold ({IMPORT_MAX_NODES} elements). Bring in fewer pages.</div>}
          {!tooBig && overSite && (
            <div className="sbe-note bad" data-import-over>
              With this, your site would have {after} elements; a site can hold {SITE_MAX_NODES} and would not publish.
              Untick some pages here, or delete pages you no longer need first (Pages, then a page&apos;s Settings).
            </div>
          )}
          <div className="sbe-sec">
            <div className="sbe-h"><span>Pages</span></div>
            {design.pages.map((p) => (
              <Toggle key={p.key} value={pages.includes(p.key)} onChange={(on) => setPages((list) => (on ? [...list, p.key] : list.filter((k) => k !== p.key)))}
                label={p.key === "home" ? `Home page (${p.sections} sections)` : `${p.title} (${p.sections} sections)`}
                help={p.key === "home" ? "Replaces your home page." : `A new page at /${p.key}.`} />
            ))}
            {shopPages.length > 0 && (
              <div className="sbe-note" style={{ marginTop: 8 }} data-import-shop-pages>
                <b>Your shop&apos;s own pages are used for:</b> {shopPages.map((s) => `${s.label} (${s.file.name})`).join(", ")}.
                {" "}They work with your real products, cart and orders, in this site&apos;s look; the design&apos;s links go to them.
              </div>
            )}
          </div>
          <div className="sbe-sec">
            <div className="sbe-h"><span>Around every page</span></div>
            {design.header && <Toggle value={header} onChange={setHeader} label={`Header${design.announcement ? " and the bar above it" : ""}`}
              help={`Replaces your header${design.announcement ? " and announcement bar" : " (and takes away the announcement bar, which the design does not have)"}.`
                + (design.menu ? ` Its ${design.menu.items.length} links become a new menu, a menu button on phones.` : "")} />}
            {design.footer && <Toggle value={footer} onChange={setFooter} label="Footer" help="Replaces your footer." />}
            <Toggle value={look} onChange={setLook} label="Fonts, colours and page width"
              help="The design's fonts and colours become this site's, so the rest of the shop (product pages, cart) matches." />
          </div>
          {design.assets.length > 0 && <p className="sbe-help">{design.assets.length} picture{design.assets.length === 1 ? "" : "s"} will be uploaded to your media library.</p>}
          {design.warnings.length > 0 && (
            <div className="sbe-note warn" style={{ marginTop: 10 }}>
              {design.warnings.slice(0, 6).map((w) => <div key={w}>{w}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
