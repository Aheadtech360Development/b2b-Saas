"use client";

/**
 * Writing one of the shop's policies.
 *
 * A box of formatted text and a Save button, because that is all a policy is.
 * Behind it the policy is an ordinary page (lib/builder/policies), so it is
 * saved to the draft like everything else in the builder and reaches the shop
 * when the site is published.
 */
import { useState } from "react";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import type { SiteDoc } from "@/lib/builder/types";
import { isBlank, policyHtml, type Policy } from "@/lib/builder/policies";
import { cleanHtml } from "@/lib/builder/sanitize";
import { RichText } from "./fields";
import { Modal } from "./ui";

export function PolicyEditor({ policy, doc, onSave, onRemove, onOpenPage, onClose }: {
  policy: Policy;
  doc: SiteDoc;
  onSave: (html: string) => void;
  onRemove: () => void;
  /** Open the policy's page on the canvas, for anything beyond its text. */
  onOpenPage: () => void;
  onClose: () => void;
}) {
  const written = policyHtml(doc, policy);
  const [html, setHtml] = useState(written ?? "");
  const blank = isBlank(html);

  return (
    <Modal wide title={policy.label} onClose={onClose}
      footer={
        <>
          {written !== null && (
            <button type="button" className="sbe-btn danger" style={{ marginRight: "auto" }} onClick={() => {
              if (window.confirm(`Remove the ${policy.label.toLowerCase()} from your site? Its page goes with it. You can undo this.`)) onRemove();
            }}><Trash2 size={14} /> Remove</button>
          )}
          <button type="button" className="sbe-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="sbe-btn primary" disabled={blank} data-policy-save
            title={blank ? "Write something first" : undefined} onClick={() => onSave(cleanHtml(html))}>Save policy</button>
        </>
      }>
      <p className="sbe-help" style={{ margin: "0 0 12px" }}>{policy.blurb}</p>

      <RichText tall value={html} onChange={setHtml} />

      {blank && (
        <div className="sbe-note" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 240px", minWidth: 0 }}>
            Not sure where to begin? Start from an outline and replace everything in [brackets]. It is a starting point, not legal advice.
          </span>
          <button type="button" className="sbe-btn sm" data-policy-outline onClick={() => setHtml(policy.outline)}>
            <FileText size={14} /> Start from an outline
          </button>
        </div>
      )}

      <div className="sbe-help" style={{ marginTop: 12 }}>
        Shown at <b>/{policy.slug}</b> once you publish. To link it in your footer, open <b>Menus</b>, choose <b>Edit links</b> on a footer menu and pick this page.
      </div>
      {written !== null && (
        <button type="button" className="sbe-btn sm ghost" style={{ marginTop: 8 }} onClick={onOpenPage}>
          <ExternalLink size={14} /> Open the page in the builder
        </button>
      )}
    </Modal>
  );
}
