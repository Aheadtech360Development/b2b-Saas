/**
 * A shop sign-up between its two screens.
 *
 * The owner gives an email and a password first (design screen 6), and the
 * shop is made one screen later, once it has a name (onboarding step 1), so
 * its address comes from the business's own name rather than from an email.
 * In between, the details live here: in this tab's memory and nowhere else.
 * A password is never written to storage; a reload in between asks for it
 * again, which is the price of that. Only the email is noted in the tab's
 * session storage, so a reload can send the owner back to the first screen
 * with it filled in rather than to a sign-in page they have no account for.
 */
export interface PendingSignup {
  email: string;
  password: string;
  plan: string | null;
  referralCookie: string | null;
  referralCode: string | null;
}

const EMAIL_KEY = "pc_signup_email";

let pending: PendingSignup | null = null;

export function holdSignup(details: PendingSignup): void {
  pending = { ...details };
  try { sessionStorage.setItem(EMAIL_KEY, details.email); } catch { /* private mode */ }
}

export function readSignup(): PendingSignup | null {
  return pending;
}

/** The email of a sign-up this tab started and lost to a reload, if any. */
export function interruptedSignupEmail(): string | null {
  if (pending) return null;
  try { return sessionStorage.getItem(EMAIL_KEY); } catch { return null; }
}

export function dropSignup(): void {
  pending = null;
  try { sessionStorage.removeItem(EMAIL_KEY); } catch { /* private mode */ }
}
