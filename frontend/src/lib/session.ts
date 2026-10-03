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
import type { UserProfile } from "@/types/user.types";

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
  const claims = claimsOf(accessToken);
  // The token is the session. Fetching the profile makes it nicer — a name to
  // greet somebody by — but it must not be allowed to decide whether they are
  // signed in at all: a buyer whose account had just been created was thrown
  // back to the form by a failure here, and the form then told them the email
  // was already taken, which it was, by them, a second earlier.
  let profile: Partial<UserProfile>;
  try {
    profile = await authService.getProfile();
  } catch {
    profile = {
      id: (claims.user_id as string) || (claims.sub as string) || "",
      email: (claims.email as string) || (claims.sub as string) || "",
      first_name: (claims.first_name as string) || "",
      last_name: (claims.last_name as string) || "",
    };
  }
  const full = {
    ...profile,
    is_admin: !!claims.is_admin,
    is_platform_admin: !!claims.is_platform_admin,
    role: (claims.role as string) || undefined,
    tenant_id: (claims.tenant_id as string | null) ?? null,
    account_type: (claims.account_type as string) || "wholesale",
    company_id: (claims.company_id as string | null) ?? null,
  };
  useAuthStore.getState().setAuth(accessToken, full as UserProfile);
  return full;
}
