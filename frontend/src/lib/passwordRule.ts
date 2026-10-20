/**
 * The site's one password rule, said the same way on every screen that sets a
 * password. The server holds the same line (backend/app/schemas/auth.py and
 * api/v1/signup.py: at least 8 characters).
 */
export const PASSWORD_MIN = 8;

export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters. One password rule for the whole site.`;

/** Typed, but not long enough yet. Empty is not "too short": nothing has been typed. */
export const passwordTooShort = (password: string): boolean =>
  password.length > 0 && password.length < PASSWORD_MIN;
