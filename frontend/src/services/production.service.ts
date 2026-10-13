import { apiClient } from "@/lib/api-client";
import { minutesIntoDay } from "@/lib/shopClock";

/** Where a job is on the board. "customer" waits in the review column. */
export type JobStage = "draft" | "review" | "customer" | "approved" | "production" | "ready" | "shipped" | "rejected" | "cancelled";
export type JobColumn = "review" | "approved" | "production" | "ready";
export type JobKind = "gang_sheet" | "upload_by_size" | "upload_own";

export interface JobNext { key: "review" | "open" | "start" | "finish" | "order"; label: string; to: string | null }

export interface ProductionJob {
  id: string;
  reference: string;
  status: string;
  stage: JobStage;
  column: JobColumn | null;
  next: JobNext | null;
  kind: JobKind;
  sheet_name: string;
  width_in: number;
  height_in: number;
  quantity: number;
  subtotal: number;
  customer: string;
  contact_email: string | null;
  revision_count: number;
  paid: boolean;
  order_id: string | null;
  order_number: string | null;
  order_status: string | null;
  payment_method: string | null;
  pickup: boolean;
  ordered_at: string | null;
  updated_at: string | null;
}

export interface ProductionBoard {
  counts: {
    queue: number; value: number; unpaid: number; customer: number;
    review: number; approved: number; production: number; ready: number;
    drafts: number; drafts_value: number;
  };
  jobs: ProductionJob[];
  /** "HH:MM", 24-hour, or null when the shop has none. */
  cutoff: string | null;
  /** The clock the cutoff is read on; none means each person's own. */
  timezone?: string | null;
}

export interface JobStep { key: string; label: string; state: "done" | "current" | "todo" | "stopped" }

/** What the job's own page reads on top of the job (the gang sheet routes add it). */
export interface JobStanding {
  stage: JobStage;
  steps: JobStep[];
  next: JobNext | null;
  job_kind: JobKind;
  order_paid: boolean;
  order_number: string | null;
  order_status: string | null;
  order_payment_status: string | null;
  order_payment_method: string | null;
  order_shipping_method: string | null;
}

export const productionService = {
  board: () => apiClient.get<ProductionBoard>("/api/v1/admin/production"),
  drafts: (limit = 50) => apiClient.get<{ drafts: ProductionJob[] }>(`/api/v1/admin/production/drafts?limit=${limit}`),
  settings: () => apiClient.get<ProductionSettings>("/api/v1/admin/production/settings"),
  saveCutoff: (cutoff: string) => apiClient.put<ProductionSettings>("/api/v1/admin/production/settings", { cutoff }),
  /** The cutoff and the clock it is read on, together (Settings, Shipping and pickup). */
  saveSettings: (cutoff: string, timezone: string) =>
    apiClient.put<ProductionSettings>("/api/v1/admin/production/settings", { cutoff, timezone }),
};

/** "HH:MM" or none, and the shop's time zone or none (each person's own clock). */
export interface ProductionSettings { cutoff: string | null; timezone?: string | null }

// ── Words, said once ─────────────────────────────────────────────────────────

const KIND_WORDS: Record<JobKind, string> = { gang_sheet: "Gang sheet", upload_by_size: "By size", upload_own: "Own sheet" };

const inches = (n: number) => `${Number(n.toFixed(2))}″`;

/** "Gang sheet, 22 × 24, $26.00" — what the job is, in the words on a card. */
export function jobSummary(j: Pick<ProductionJob, "kind" | "sheet_name" | "width_in" | "height_in" | "quantity" | "subtotal">): string {
  const size = j.kind === "upload_by_size" ? `${inches(j.width_in)} × ${inches(j.height_in)}` : j.sheet_name;
  return `${KIND_WORDS[j.kind] ?? "Gang sheet"}, ${size}${j.quantity > 1 ? ` ×${j.quantity}` : ""}, $${j.subtotal.toFixed(2)}`;
}

/** "12:00" → "12 PM", "15:30" → "3:30 PM". */
export function cutoffWords(cutoff: string): string {
  const [h, m] = cutoff.split(":").map(Number) as [number, number];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The same-day cutoff, against the shop's clock (this computer's when the shop
 * has set no time zone): before it, "approve by" it to ship today; after it,
 * that today's has passed. Nothing without one.
 */
export function cutoffNote(cutoff: string | null, now = new Date(), timeZone?: string | null): { text: string; late: boolean } | null {
  if (!cutoff) return null;
  const [h, m] = cutoff.split(":").map(Number) as [number, number];
  return minutesIntoDay(timeZone, now) < h * 60 + m
    ? { text: `Approve by ${cutoffWords(cutoff)} to ship today`, late: false }
    : { text: `Past today's ${cutoffWords(cutoff)} cutoff`, late: true };
}

export function paymentPill(j: { paid: boolean; payment_method?: string | null; order_id?: string | null }): { label: string; tone: string } {
  if (!j.order_id) return { label: "Not ordered", tone: "" };
  if (j.paid) return { label: "Paid", tone: "green" };
  return { label: j.payment_method === "cod" ? "Unpaid · COD" : "Unpaid", tone: "amber" };
}
