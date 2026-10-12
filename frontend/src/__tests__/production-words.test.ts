/**
 * What a print job's card says: what it is, whether it is paid, and the
 * same-day cutoff against the clock.
 */
import { describe, expect, it } from "vitest";
import { cutoffNote, cutoffWords, jobSummary, paymentPill } from "@/services/production.service";

describe("a print job's card", () => {
  it("says what the job is: kind, size, how many and the price", () => {
    expect(jobSummary({ kind: "gang_sheet", sheet_name: "22 × 48", width_in: 22, height_in: 48, quantity: 1, subtotal: 26 }))
      .toBe("Gang sheet, 22 × 48, $26.00");
    expect(jobSummary({ kind: "gang_sheet", sheet_name: "4 feet", width_in: 22, height_in: 48, quantity: 2, subtotal: 52 }))
      .toBe("Gang sheet, 4 feet ×2, $52.00");
    // A design ordered by size is named by its own size, not the product's name.
    expect(jobSummary({ kind: "upload_by_size", sheet_name: "DTF by Size — 2\"x1.33\"", width_in: 2, height_in: 1.333, quantity: 40, subtotal: 50 }))
      .toBe("By size, 2″ × 1.33″ ×40, $50.00");
  });

  it("calls an order not paid yet unpaid, and says when it is cash on delivery", () => {
    expect(paymentPill({ paid: true, order_id: "o1" })).toEqual({ label: "Paid", tone: "green" });
    expect(paymentPill({ paid: false, payment_method: "cod", order_id: "o1" })).toEqual({ label: "Unpaid · COD", tone: "amber" });
    expect(paymentPill({ paid: false, payment_method: "card", order_id: "o1" }).label).toBe("Unpaid");
    expect(paymentPill({ paid: false, order_id: null }).label).toBe("Not ordered");
  });
});

describe("the same-day cutoff", () => {
  it("is said the way a person says a time", () => {
    expect(cutoffWords("12:00")).toBe("12 PM");
    expect(cutoffWords("09:30")).toBe("9:30 AM");
    expect(cutoffWords("15:05")).toBe("3:05 PM");
    expect(cutoffWords("00:00")).toBe("12 AM");
  });

  it("asks for approval before it, and says when today's has passed", () => {
    const morning = new Date(2026, 9, 12, 10, 15);
    const evening = new Date(2026, 9, 12, 16, 0);
    expect(cutoffNote("12:00", morning)).toEqual({ text: "Approve by 12 PM to ship today", late: false });
    expect(cutoffNote("12:00", evening)).toEqual({ text: "Past today's 12 PM cutoff", late: true });
    expect(cutoffNote(null, morning)).toBeNull();
  });
});
