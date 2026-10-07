/**
 * The platform's sales-tax report: what each brand has charged its customers
 * in tax, for a range of dates. Maps to GET /api/v1/platform/taxes.
 */
import { apiClient } from "@/lib/api-client";

export interface TaxFigures {
  orders: number;
  /** Orders that carried any tax. */
  taxed_orders: number;
  /** Order subtotals — before shipping and tax. */
  sales: number;
  /** Tax charged on those orders. */
  tax: number;
  /** The part of it given back with refunds. */
  tax_refunded: number;
  net_tax: number;
}

export interface BrandTax extends TaxFigures {
  id: string;
  slug: string;
  name: string;
  status: string;
  last_order: string | null;
  /** Newest first. `month` is "2026-10". */
  months: (TaxFigures & { month: string })[];
  /** Most tax first. `region` is a state code, or "" when the order recorded none. */
  regions: (TaxFigures & { region: string })[];
}

export type TaxBasis = "paid" | "all";

export interface TaxReport {
  range: { from: string | null; to: string | null; tz: string };
  basis: TaxBasis;
  totals: TaxFigures & { brands: number; brands_with_tax: number };
  brands: BrandTax[];
}

export const platformTaxService = {
  /** `from` and `to` are whole days, "YYYY-MM-DD"; leave either out for no limit on that side. */
  report(q: { from?: string; to?: string; basis?: TaxBasis; tz?: string }): Promise<TaxReport> {
    const p = new URLSearchParams();
    if (q.from) p.set("date_from", q.from);
    if (q.to) p.set("date_to", q.to);
    p.set("basis", q.basis ?? "paid");
    if (q.tz) p.set("tz", q.tz);
    return apiClient.get<TaxReport>(`/api/v1/platform/taxes?${p.toString()}`);
  },
};
