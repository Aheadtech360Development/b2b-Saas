"use client";

import { CheckCircle2, AlertTriangle, Eraser, SlidersHorizontal, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ImageEditorModal } from "@/components/storefront/ImageEditorModal";
import { BackgroundRemovalError, removeImageBackground } from "@/lib/backgroundRemoval";
import { ACCEPTED, ImageError, prepareImage, printQuality } from "@/lib/designer/images";
import { useDesigner } from "@/stores/designer.store";
import { useCtrl, useNotice, useUploads } from "../context";
import s from "../designer.module.css";
import { Section, ArrangeSection } from "../ui";

/** Add a picked, pasted or dropped file to the canvas. Shared with the stage and the shell. */
export async function addImageFile(file: File, ctrl: ReturnType<typeof useCtrl>) {
  const { show } = useNotice.getState();
  if (!ctrl) return;
  try {
    const img = await prepareImage(file);
    useUploads.getState().add(img);
    await ctrl.addImage(img);
  } catch (e) {
    show(e instanceof ImageError ? e.message : "That image couldn't be added. Try another file.", "error");
  }
}

async function dataUrlToFile(src: string, name: string) {
  const blob = await (await fetch(src)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function UploadPanel() {
  const ctrl = useCtrl();
  const sel = useDesigner((st) => st.selection);
  const uploads = useUploads((st) => st.items);
  const show = useNotice((st) => st.show);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const image = sel?.kind === "image" ? sel : null;
  const quality = image?.dpi ? printQuality(image.dpi) : null;

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) await addImageFile(f, ctrl);
    if (input.current) input.current.value = "";
  }

  async function removeBg() {
    const src = ctrl?.activeImageSrc();
    if (!ctrl || !src) return;
    setBusy("Removing the background…");
    try {
      const out = await removeImageBackground(await dataUrlToFile(src, "artwork.png"));
      const img = await prepareImage(out);
      // The canvas copy is what was processed; keep the original's resolution for print quality.
      await ctrl.replaceImage({ ...img, width: Math.max(img.width, image?.dpi ? Math.round(image.dpi * image.widthIn) : img.width) });
      show("Background removed");
    } catch (e) {
      show(e instanceof BackgroundRemovalError ? e.message : "The background couldn't be removed. Your image is unchanged.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Section>
        <input ref={input} type="file" accept={ACCEPTED.join(",")} className={s.srOnly} tabIndex={-1}
          onChange={(e) => void pick(e.target.files)} />
        <button
          type="button"
          className={`${s.drop} ${over ? s.dropOver : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); void pick(e.dataTransfer.files); }}
        >
          <Upload size={22} />
          <strong>Upload an image</strong>
          <span>PNG, JPG, WEBP, GIF or SVG, up to 25 MB</span>
        </button>
        <p className={s.hint}>For the sharpest print, use a file at least 3000 px wide, or a vector SVG.</p>
      </Section>

      {image && (
        <>
          {quality && (
            <Section label="Print quality">
              <div className={`${s.quality} ${s[`quality_${quality.tone}`]}`}>
                {quality.tone === "low" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                <span>{quality.label} <span className={s.num}>({image.dpi} DPI)</span></span>
              </div>
            </Section>
          )}
          <ArrangeSection sel={image} ctrl={ctrl} />
          <Section label="Image tools">
            <div style={{ display: "grid", gap: 8 }}>
              <button type="button" className={`${s.btn} ${s.btnBlock}`} disabled={!!busy} onClick={() => void removeBg()}>
                <Eraser size={16} /> {busy ?? "Remove background"}
              </button>
              <button type="button" className={`${s.btn} ${s.btnBlock}`} disabled={!!busy}
                onClick={() => setEditing(ctrl?.activeImageSrc() ?? null)}>
                <SlidersHorizontal size={16} /> Crop, adjust and recolour
              </button>
            </div>
          </Section>
        </>
      )}

      {uploads.length > 0 && (
        <Section label="Your uploads">
          <div className={`${s.tiles} ${s.tiles3}`}>
            {uploads.map((u) => (
              <button key={u.src.slice(-40)} type="button" className={s.tile} title={`Add ${u.name} again`}
                onClick={() => void ctrl?.addImage(u)}>
                <img src={u.src} alt={u.name} />
              </button>
            ))}
          </div>
        </Section>
      )}

      {editing && (
        <ImageEditorModal
          src={editing}
          fileName="artwork.png"
          onClose={() => setEditing(null)}
          onApply={async (file) => {
            setEditing(null);
            try {
              const img = await prepareImage(file);
              await ctrl?.replaceImage(img);
            } catch (e) {
              show(e instanceof ImageError ? e.message : "The edit couldn't be applied.", "error");
            }
          }}
        />
      )}
    </>
  );
}
