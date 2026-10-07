"use client";

/**
 * Log in and Sign up, for a shop's own customers — and, once they are signed
 * in, the way to their account instead.
 *
 * A shop's customers have a whole dashboard at /account: orders, invoices,
 * addresses, saved designs. The header only ever offered a small person icon
 * to reach it, which says nothing to somebody who does not have an account
 * yet. These are the two doors by name:
 *
 *   Log in  → /login, which lands a customer on /account
 *   Sign up → /create-account — name, email, password — and straight to /account
 *
 * The server always draws the two buttons, because it cannot know who is
 * reading; the swap to "My account" happens once the browser has said.
 *
 * On a phone the header has no room for two worded buttons beside the logo,
 * the cart and the menu button, so there they are shown inside the menu
 * instead (MenuNav reads what to show from this element's own attributes).
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { safeHref } from "@/lib/builder/sanitize";

export const LOGIN_HREF = "/login";
export const SIGNUP_HREF = "/create-account?next=/account";

const look = (style: string, fallback: "solid" | "outline") => {
  const s = style === "solid" || style === "outline" || style === "text" ? style : fallback;
  return s === "text" ? "b-btn b-auth-text" : s === "solid" ? "b-btn b-btn-solid" : "b-btn b-btn-outline";
};

export default function AuthButtons({
  id, show, loginLabel, signupLabel, accountLabel, loginStyle, signupStyle, size, phone, loginHref, signupHref, edit,
}: {
  id: string;
  /** "" both, "login" or "signup". */
  show: string;
  loginLabel: string;
  signupLabel: string;
  accountLabel: string;
  loginStyle: string;
  signupStyle: string;
  size: string;
  /** "" inside the menu on a phone, "bar" to stay in the header. */
  phone: string;
  loginHref: string;
  signupHref: string;
  edit?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  // Not until mounted: the server's HTML is the signed-out header, and the
  // first paint in the browser has to match it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && !edit && !isLoading && !!user;

  const login = safeHref(loginHref) || LOGIN_HREF;
  const signup = safeHref(signupHref) || SIGNUP_HREF;
  const showLogin = show !== "signup";
  const showSignup = show !== "login";
  const loginText = loginLabel.trim() || "Log in";
  const signupText = signupLabel.trim() || "Sign up";
  const accountText = accountLabel.trim() || "My account";

  return (
    <div data-b={id} className="b-auth" data-size={size === "regular" ? "regular" : "compact"}
         data-phone={phone === "bar" ? "bar" : "menu"} data-state={signedIn ? "in" : "out"}
         data-login={showLogin ? login : ""} data-login-label={loginText}
         data-signup={showSignup ? signup : ""} data-signup-label={signupText} data-account-label={accountText}>
      {signedIn ? (
        // Somebody who runs the shop goes to the shop's own dashboard.
        <a className={look(signupStyle, "solid")} href={user?.is_admin ? "/admin/dashboard" : "/account"}>
          {user?.is_admin ? "Dashboard" : accountText}
        </a>
      ) : (
        <>
          {showLogin && <a className={look(loginStyle, "outline")} href={login}>{loginText}</a>}
          {showSignup && <a className={look(signupStyle, "solid")} href={signup}>{signupText}</a>}
        </>
      )}
    </div>
  );
}
