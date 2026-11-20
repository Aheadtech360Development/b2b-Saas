"use client";

/**
 * The shop's gang sheet builder settings, as a buyer's builder reads them
 * (backend gang_sheets.public_settings): whether a sign-in is needed before a
 * sheet goes into the cart, the text tool, the builder's colours.
 *
 * "Require customer login" (Products → Gang sheet setup → Settings) is off
 * unless the shop switched it on. Off, a guest builds, uploads and adds to the
 * cart like any other product, and makes the account at checkout. The
 * builders asked for an account whatever the switch said (dev fix list,
 * item 3, 2026-11-20).
 *
 * Read once per page and shared. When it cannot be read, nothing is asked:
 * the checkout asks for an account anyway.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface GangSheetPublicSettings {
  require_login: boolean;
  disable_text?: boolean;
  enable_flip?: boolean;
  min_resolution?: number;
  welcome_popup?: boolean;
  welcome_message?: string;
  theme_primary?: string;
  theme_text?: string;
  show_gallery?: boolean;
  allow_reorder?: boolean;
}

const OPEN: GangSheetPublicSettings = { require_login: false };
let cached: Promise<GangSheetPublicSettings> | null = null;

export function loadGangSheetSettings(): Promise<GangSheetPublicSettings> {
  if (!cached) {
    cached = apiClient
      .get<GangSheetPublicSettings>("/api/v1/gang-sheets/settings", { skipAuth: true })
      .then((s) => ({ ...OPEN, ...(s ?? {}), require_login: s?.require_login === true }))
      .catch(() => { cached = null; return OPEN; });
  }
  return cached;
}

/** Whether this buyer must sign in before a sheet goes into the cart. */
export async function signInNeeded(signedIn: boolean): Promise<boolean> {
  if (signedIn) return false;
  return (await loadGangSheetSettings()).require_login;
}

export function useGangSheetSettings(): GangSheetPublicSettings | null {
  const [s, setS] = useState<GangSheetPublicSettings | null>(null);
  useEffect(() => {
    let live = true;
    void loadGangSheetSettings().then((v) => { if (live) setS(v); });
    return () => { live = false; };
  }, []);
  return s;
}

/** Tests: read the settings afresh. */
export function forgetGangSheetSettings(): void {
  cached = null;
}
