import { redirect } from "next/navigation";

/**
 * The old address of Customers → Pricing tiers. Without this page the
 * customer page took "pricing-tiers" for a customer's id and showed the
 * server's raw "valid UUID" error (dev fix list, item 28).
 */
export default function PricingTiersMoved() {
  redirect("/admin/customers/tiers");
}
