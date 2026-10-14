"use client";

import { METHODS } from "@/components/partners/states";
import { Chip, type Tone } from "@/components/partners/ui";
import { money } from "@/lib/partnerApi";

export const PARTNER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  suspended: { label: "Suspended", tone: "bad" },
  terminated: { label: "Terminated", tone: "mut" },
};

export function StatusChip({ status }: { status: string }) {
  const s = PARTNER_STATUS[status] ?? { label: status, tone: "mut" as Tone };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export const FLAG_WORDS: Record<string, string> = {
  self_referral: "Self referral",
  domain_match: "Domain match",
  added_by_admin: "Added by admin",
  existing_customer: "Existing customer",
  duplicate_email: "Duplicate email",
  spam: "Spam check failed",
};

export function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="muted">None</span>;
  return (
    <span className="row" style={{ gap: 4 }}>
      {flags.map((f) => (
        <Chip key={f} tone={f === "added_by_admin" ? "mut" : f === "self_referral" || f === "spam" ? "bad" : "warn"}>
          {FLAG_WORDS[f] ?? f.replace(/_/g, " ")}
        </Chip>
      ))}
    </span>
  );
}

type Activity = {
  action: string; actor_kind: string; actor_name: string | null; actor_email: string | null;
  partner_name?: string | null; subject_kind: string | null; subject_id: string | null;
  reason: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
};

const CENTS_KEYS = new Set(["amount_cents", "base_cents", "total_cents"]);

function cents(a: Record<string, unknown> | null, key: string) {
  const v = a?.[key];
  return typeof v === "number" ? money(v) : "";
}

/** What an activity entry did, in the words the Activity log shows. */
export function activityWords(a: Activity): string {
  const after = a.after ?? {};
  switch (a.action) {
    case "application_received": return "Application received";
    case "application_approved": return `Application approved: ${after.rate_plan ?? ""} rate, code ${after.code ?? ""}`.trim();
    case "application_rejected": return "Application rejected";
    case "info_requested": return "More information requested";
    case "note": return "Note added";
    case "affiliate_added": return "Affiliate added by hand";
    case "invite_sent": return "Invite sent again";
    case "invite_accepted": return "Invite accepted, password set";
    case "rate_changed": return after.custom_rate !== null && after.custom_rate !== undefined
      ? `Custom rate override set: ${Number(after.custom_rate) / 100}%` : "Rate plan changed";
    case "code_changed": return `Code changed to ${after.code ?? ""}`;
    case "status_paused": return "Affiliate paused";
    case "status_suspended": return "Affiliate suspended, commission held";
    case "status_terminated": return after.forfeit ? "Affiliate terminated, pending commission voided" : "Affiliate terminated";
    case "status_active": return "Affiliate reactivated";
    case "referral_attributed": return `Referral saved: ${after.shop ?? "a shop"} by ${after.source ?? "link"}`;
    case "referral_exclude": return "Referral excluded from commission";
    case "referral_reassign": return `Referral reassigned to ${after.partner ?? "another affiliate"}`;
    case "referral_received": return "Referral moved here from another affiliate";
    case "referral_clear": return "Not a self referral: flag cleared, lines released";
    case "referral_note": return "Note on a referral";
    case "referral_added": return `Referral added by hand: ${after.shop ?? ""}`;
    case "referral_ended": return `Subscription ended: ${after.shop ?? "a shop"}`;
    case "shop_returned": return `Shop came back within the window: ${after.shop ?? ""}`;
    case "line_created": return `Commission line created: ${cents(after, "amount_cents")}${after.shop ? ` from ${after.shop}` : ""}`;
    case "clawback_created": return `Clawback created: ${cents(after, "amount_cents")} from ${String(after.why ?? "a refund").toLowerCase()}`;
    case "line_held": return "Line held";
    case "line_released": return "Line released";
    case "line_voided": return "Line voided";
    case "adjustment_added": return `Adjustment added: ${cents(after, "amount_cents")}`;
    case "batch_created": return `Batch ${after.name ?? ""} created: ${cents(after, "total_cents")}`;
    case "batch_included": return `Included in batch ${after.batch ?? ""}: ${cents(after, "amount_cents")}`;
    case "batch_cancelled": return "Batch cancelled, lines unlocked";
    case "payout_recorded": return `Payout recorded: ${cents(after, "amount_cents")} via ${METHODS[after.method as keyof typeof METHODS] ?? after.method ?? ""}`;
    case "terms_published": return `Terms version ${after.version ?? ""} published`;
    case "terms_accepted": return `Terms version ${after.version ?? ""} accepted`;
    case "settings_changed": return `Setting changed: ${Object.keys(after).map((k) => k.replace(/_/g, " ")).join(", ")}`;
    case "rate_plan_changed": return "Rate plan changed";
    case "rate_plan_added": return "Rate plan added";
    case "asset_removed": return "Banner removed";
    case "w9_uploaded": return "W-9 uploaded";
    case "w9_viewed": return "W-9 downloaded";
    case "viewed_as_affiliate": return "Viewed as affiliate, read only";
    case "password_reset": return "Password reset by email";
    case "password_changed": return "Password changed";
    case "two_factor_on": return "Two step sign in turned on";
    case "two_factor_off": return "Two step sign in turned off";
    case "profile_changed": return "Profile changed";
    case "payout_details_changed": return "Payout details changed";
    case "stripe_event_retried": return "Stripe event retried";
    default: return a.action.replace(/_/g, " ");
  }
}

export function actorWords(a: Activity): string {
  if (a.actor_kind === "stripe") return "Stripe";
  if (a.actor_kind === "system") return a.actor_name && a.actor_name !== "Auto approve" ? "System" : (a.actor_name ?? "System");
  return a.actor_email || a.actor_name || a.actor_kind;
}

/** before/after as the log's two small boxes, money read as money. */
export function diffLines(v: Record<string, unknown> | null): string {
  if (!v) return "";
  return Object.entries(v)
    .map(([k, val]) => `${k}: ${CENTS_KEYS.has(k) && typeof val === "number" ? money(val) : JSON.stringify(val)}`)
    .join("\n");
}

export type { Activity };
