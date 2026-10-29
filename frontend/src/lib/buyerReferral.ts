/**
 * A friend's referral link (?bref=CODE, backend services/loyalty), kept in
 * this browser until the buyer is signed in, then claimed once. Apart from
 * the partner program's ?ref= on purpose: different people, different money.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

const KEY = "pc_bref";

/** Keep the code from the address, if there is one. Every page calls it. */
export function captureBuyerReferral(): void {
  if (typeof window === "undefined") return;
  try {
    const code = new URLSearchParams(window.location.search).get("bref");
    if (code && /^[A-Za-z0-9]{4,16}$/.test(code)) localStorage.setItem(KEY, code.toUpperCase());
  } catch { /* private mode: nothing to keep it in */ }
}

let claiming = false;

/** Claim the kept code for the signed-in buyer. Forgotten once the shop has
 *  answered for good (claimed, already referred, own code, no program); kept
 *  for another try after a passing failure. */
export async function claimBuyerReferral(): Promise<void> {
  if (typeof window === "undefined" || claiming) return;
  let code: string | null = null;
  try { code = localStorage.getItem(KEY); } catch { return; }
  if (!code) return;
  claiming = true;
  try {
    await apiClient.post("/api/v1/account/rewards/referral", { code });
    localStorage.removeItem(KEY);
  } catch (err) {
    const status = err instanceof ApiClientError ? err.status : 0;
    if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
      try { localStorage.removeItem(KEY); } catch { /* nothing to undo */ }
    }
  } finally {
    claiming = false;
  }
}
