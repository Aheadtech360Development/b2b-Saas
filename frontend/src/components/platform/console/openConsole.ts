/**
 * Open a brand's admin as platform support, with the reason on record.
 *
 * The visit is a short session (an hour unless the Support page chose
 * otherwise), marked as support's in the brand's admin and written to the
 * brand's activity log with this reason (backend platform/tenants.py impersonate).
 */
import { askText, tell } from "@/lib/dialog";
import { enterBrandDashboard } from "@/services/platform.service";
import { errorText } from "./ui";

export async function openConsole(slug: string, name: string, minutes = 60): Promise<boolean> {
  const reason = await askText(
    `Why are you opening ${name}'s admin? It is kept in the brand's activity log.`,
    "",
    { title: `Open ${name}'s console`, ok: "Open console", placeholder: "For example: checking order 1005 for the owner" },
  );
  if (reason === null) return false;
  if (!reason.trim()) {
    await tell("Say why you are going in: the reason is kept with the visit.");
    return false;
  }
  try {
    await enterBrandDashboard(slug, { reason: reason.trim(), minutes });
    return true;
  } catch (e) {
    await tell(errorText(e, "The brand's console could not be opened."));
    return false;
  }
}
