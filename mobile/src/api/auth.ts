/**
 * Signing in, and everything that has to happen around it.
 *
 * There is one door for everyone, exactly as on the web: an email and a
 * password, with no question about which shop. The token that comes back
 * names the shop, which is how the app knows whose branding to wear.
 */
import { call } from "@/api/client";
import { clearSession, readClaims, writeSession, type Session } from "@/session/store";

export interface LoginResult {
  /** A 2FA code is needed before this is a session. */
  requiresTwoFactor: boolean;
  challengeToken: string | null;
  session: Session | null;
}

interface LoginResponse {
  access_token?: string;
  refresh_token?: string | null;
  requires_2fa?: boolean;
  challenge_token?: string | null;
}

/** Roles that run a shop rather than buy from one. */
const ADMIN_ROLES = ["tenant_admin", "tenant_staff", "platform_admin"];

function sessionFrom(res: LoginResponse, email: string): Session {
  const claims = readClaims(res.access_token ?? "");
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const role = str(claims.role);
  return {
    accessToken: res.access_token ?? "",
    refreshToken: res.refresh_token ?? null,
    tenantSlug: str(claims.tenant_slug),
    tenantId: str(claims.tenant_id),
    email,
    // The claim first, since the server derives it; the role is read as well
    // so a token minted before that claim existed still lands the right way.
    isAdmin: claims.is_admin === true || (role !== null && ADMIN_ROLES.includes(role)),
    role,
    companyId: str(claims.company_id),
  };
}

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const res = await call<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    anonymous: true,
    body: { email: email.trim(), password },
  });

  if (res.requires_2fa) {
    return {
      requiresTwoFactor: true,
      challengeToken: res.challenge_token ?? null,
      session: null,
    };
  }

  const session = sessionFrom(res, email.trim());
  await writeSession(session);
  return { requiresTwoFactor: false, challengeToken: null, session };
}

/** Second step, when the account has two-factor turned on. */
export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
  email: string,
): Promise<Session> {
  const res = await call<LoginResponse>("/api/v1/auth/2fa/verify", {
    method: "POST",
    anonymous: true,
    body: { challenge_token: challengeToken, code: code.trim() },
  });
  const session = sessionFrom(res, email);
  await writeSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  // Tell the server first, so the token is revoked rather than left valid
  // until it expires. A failure here is not a reason to keep somebody signed
  // in on the device.
  try {
    await call("/api/v1/auth/logout", { method: "POST" });
  } catch {
    // Offline, or already expired. Clearing locally is what matters.
  }
  await clearSession();
}

export async function requestPasswordReset(email: string, tenantSlug?: string): Promise<void> {
  // Not under /auth — this one sits at the top level. Checked against the
  // running app rather than assumed, because a wrong path here fails as a
  // 404 that reads like "no such account".
  await call("/api/v1/forgot-password", {
    method: "POST",
    anonymous: true,
    tenantSlug,
    body: { email: email.trim() },
  });
}
