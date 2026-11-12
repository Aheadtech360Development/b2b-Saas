"use client";

/**
 * What a screen says when the shop's plan does not include it.
 *
 * Opening a screen that then fails with "Forbidden" reads as a broken
 * product. Saying which tier includes it, in the place the feature would have
 * been, reads as a price — which is the thing the shop can actually act on.
 * The same lock box as the Customers tabs that need Wholesale (PlanLock).
 */
import { useLock } from "@/lib/entitlements";
import { PlanLock } from "@/components/admin/customers/CustomersFrame";

export function UpgradeNotice({ feature, blurb, addOn = false, children }: {
  feature: string;
  /** What the screen is for, in a sentence, for the shop deciding to upgrade. */
  blurb: string;
  /** Sold on its own, in no plan (Inventory sync): the platform turns it on for a shop that buys it. */
  addOn?: boolean;
  children?: React.ReactNode;
}) {
  const lock = useLock(feature);
  if (!lock) return <>{children}</>;
  if (addOn && !lock.upgrade_to) {
    return <PlanLock title={`${lock.label} is an add-on`} blurb={`${blurb} Ask us to turn it on for your shop.`} cta={null} />;
  }

  // No plan to send the shop to: the platform switched it off for this shop.
  if (!lock.upgrade_to) {
    return <PlanLock title={`${lock.label} is switched off for your shop`}
      blurb="Ask us and we can turn it back on." cta={null} />;
  }
  return <PlanLock title={`Included from the ${lock.upgrade_to} plan`} blurb={`${blurb} Upgrade to turn this on.`} />;
}

export default UpgradeNotice;
