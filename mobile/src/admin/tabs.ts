/**
 * The four places somebody goes every day, and a way to the rest.
 *
 * Plain data, apart from the bar that draws it, so the rule about which tab
 * lights up can be checked without rendering anything.
 */
import type { IconName } from "@/ui/Icon";

export interface Tab {
  key: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

export const TABS: Tab[] = [
  { key: "dashboard", label: "Home", icon: "home-outline", iconActive: "home" },
  { key: "orders", label: "Orders", icon: "receipt-outline", iconActive: "receipt" },
  { key: "products", label: "Products", icon: "cube-outline", iconActive: "cube" },
  { key: "messages", label: "Messages", icon: "chatbubble-outline", iconActive: "chatbubble" },
  { key: "more", label: "More", icon: "ellipsis-horizontal", iconActive: "ellipsis-horizontal" },
];

/**
 * Whether a tab should be lit.
 *
 * A section opened from More keeps More lit, so the bar never claims you are
 * somewhere you are not.
 */
export function isTabActive(tabKey: string, current: string): boolean {
  if (tabKey === current) return true;
  return tabKey === "more" && !TABS.some((t) => t.key === current);
}
