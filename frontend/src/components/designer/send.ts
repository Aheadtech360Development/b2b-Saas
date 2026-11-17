/**
 * Sending a finished design to the shop: the job record first, then its
 * finished files, one shirt and side at a time.
 *
 * For every shirt being ordered and every side with art on it, two files: the
 * preview (the garment in its colour with the design on it) and the print
 * artwork alone at 300 DPI. A side carrying names and numbers gets one print
 * file per player on that shirt's roster, each with that player's name and
 * number in place, so the print team prints them as they come. The server
 * keeps them in the shop's ImageKit folder. A design sent before is updated,
 * not sent again (`remote`): its old files are cleared and these replace
 * them. Without one, a new design is made.
 */
import type { Garment, DesignDoc, RosterRow, ViewKey, ViewObjects } from "@/lib/designer/types";
import { tshirtDesignsService, type TShirtDesignRecord } from "@/services/tshirtDesigns.service";
import { designOf, shirtKeys, shirtSides } from "@/stores/designer.store";
import { renderPrintArt, renderView } from "./render";

export interface SendProgress {
  done: number;
  total: number;
  label: string;
}

interface Job {
  key: string;
  garment: Garment;
  hex: string;
  colorName: string;
  view: ViewKey;
  /** This shirt's players, when this side carries their names and numbers. */
  players: RosterRow[];
}

const hasNames = (objects: ViewObjects) => objects.some((o) => o.nn === "name" || o.nn === "number");

async function dataUrlBlob(url: string) {
  return (await fetch(url)).blob();
}

/** The shirts with sizes chosen, and their printed sides. */
function jobs(doc: DesignDoc, catalog: Garment[]): Job[] {
  const out: Job[] = [];
  for (const key of shirtKeys(doc)) {
    const ordered = Object.values(doc.quantities[key] ?? {}).some((n) => (n ?? 0) > 0)
      || doc.roster.some((r) => r.line === key);
    if (!ordered) continue;
    const [gid = "", cid = ""] = key.split(":");
    const garment = catalog.find((g) => g.id === gid);
    const color = garment?.colors.find((c) => c.id === cid);
    if (!garment || !color) continue;
    const players = doc.roster.filter((r) => r.line === key);
    for (const view of shirtSides(doc, key)) {
      const named = hasNames(designOf(doc, key)[view]);
      out.push({ key, garment, hex: color.hex, colorName: color.name, view, players: named ? players : [] });
    }
  }
  return out;
}

export async function sendDesign(
  doc: DesignDoc,
  catalog: Garment[],
  quotedTotal: number,
  onProgress: (p: SendProgress) => void,
  /** The design to update, when this one was sent before and may still be
   *  changed; a new design otherwise. */
  remote: DesignDoc["remote"],
): Promise<TShirtDesignRecord> {
  const work = jobs(doc, catalog);
  const total = 1 + work.reduce((n, j) => n + 1 + Math.max(1, j.players.length), 0);
  let done = 0;
  const step = (label: string) => onProgress({ done, total, label });

  step("Sending your design");
  // Bought through the cart: the buyer is known from the order, so no email here.
  const payload = { document: doc, quoted_total: quotedTotal, customer_notes: doc.notes || undefined, for_cart: true };
  const record = remote
    ? await tshirtDesignsService.update(remote.id, payload)
    : await tshirtDesignsService.submit(payload);
  done++;

  for (const j of work) {
    const objects = designOf(doc, j.key)[j.view];
    // The preview shows this shirt's first player (or the first on the roster).
    const row = j.players[0] ?? doc.roster.find((r) => r.line === j.key) ?? doc.roster[0];
    step(`Preview: ${j.garment.name}, ${j.colorName}, ${j.view}`);
    const preview = await renderView({ silhouette: j.garment.silhouette, view: j.view, hex: j.hex, objects, size: 1600, roster: row });
    await tshirtDesignsService.uploadOutput(record.id, await dataUrlBlob(preview), { shirt_key: j.key, view: j.view, kind: "preview" });
    done++;

    if (!j.players.length) {
      step(`Print file: ${j.garment.name}, ${j.colorName}, ${j.view}`);
      const art = await renderPrintArt(objects, row);
      if (art) await tshirtDesignsService.uploadOutput(record.id, art.blob, { shirt_key: j.key, view: j.view, kind: "print" });
      done++;
      continue;
    }
    for (const p of j.players) {
      step(`Print file: ${j.colorName}, ${j.view}, ${[p.name, p.number].filter(Boolean).join(" ") || "player"}`);
      const art = await renderPrintArt(objects, p);
      if (art) await tshirtDesignsService.uploadOutput(record.id, art.blob, { shirt_key: j.key, view: j.view, kind: "print", player: p.id });
      done++;
    }
  }
  onProgress({ done, total, label: "Sent" });
  return record;
}
