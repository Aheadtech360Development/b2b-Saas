/**
 * Turning an access token into a signed-in session.
 *
 * The sign-in page worked this out for itself, which was fine while it was the
 * only door. It is not any more — a buyer can now open an account from inside
 * the gang sheet builder, mid-order — and two copies of "what does this token
 * make you" is how one of them ends up missing a claim nobody notices until a
 * customer sees the wrong prices.
 */
import { setAccessToken } from "@/lib/api-client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";

/** What the token itself says, without trusting it for anything but display. */
function claimsOf(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Put the session in place and return the profile, so the caller can decide
 * where to go — or, in the builder's case, simply carry on.
 */
export async function establishSession(accessToken: string) {
  setAccessToken(accessToken);
  const profile = await authService.getProfile();
  const claims = claimsOf(accessToken);
  const full = {
    ...profile,
    is_admin: !!claims.is_admin,
    is_platform_admin: !!claims.is_platform_admin,
    role: (claims.role as string) || undefined,
    tenant_id: (claims.tenant_id as string | null) ?? null,
    account_type: (claims.account_type as string) || "wholesale",
    company_id: (claims.company_id as string | null) ?? null,
  };
  useAuthStore.getState().setAuth(accessToken, full);
  return full;
}
