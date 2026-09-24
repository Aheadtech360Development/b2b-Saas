"use client";

/**
 * What this shop's plan actually includes.
 *
 * The API refuses a feature the plan does not sell. This is so the console
 * does not pretend otherwise: a locked screen says which tier has it, rather
 * than opening and failing, or quietly not being there at all — a shop that
 * cannot see a feature never buys the tier that includes it.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface LockedFeature {
  feature: string;
  label: string;
  group: string;
  /** The cheapest tier that includes it, or null when no tier sells it. */
  upgrade_to: string | null;
  upgrade_key: string | null;
}

export interface Entitlements {
  features: string[];
  plan: { key: string; name: string; price_display: string } | null;
  locked: LockedFeature[];
  loaded: boolean;
}

const EMPTY: Entitlements = { features: [], plan: null, locked: [], loaded: false };

const Ctx = createContext<Entitlements>(EMPTY);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Entitlements>(EMPTY);

  useEffect(() => {
    let live = true;
    apiClient
      .get<Omit<Entitlements, "loaded">>("/api/v1/admin/entitlements")
      .then((r) => { if (live) setState({ ...r, loaded: true }); })
      // If we cannot tell, show everything: a console that hides real features
      // because one request failed is worse than one that lets the API refuse.
      .catch(() => { if (live) setState({ ...EMPTY, loaded: true }); });
    return () => { live = false; };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useEntitlements(): Entitlements {
  return useContext(Ctx);
}

/** Whether this shop may use one feature. Unknown until loaded → allowed. */
export function useCan(feature: string): boolean {
  const { features, loaded } = useEntitlements();
  if (!loaded || features.length === 0) return true;
  return features.includes(feature);
}

/** Why a feature is locked, or null when it isn't. */
export function useLock(feature: string): LockedFeature | null {
  const { locked, loaded } = useEntitlements();
  if (!loaded) return null;
  return locked.find((l) => l.feature === feature) ?? null;
}
