"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient, setAccessToken, setTokenRefreshCallback, setAuthExpiredCallback } from "@/lib/api-client";
import type { UserProfile } from "@/types/user.types";

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export function AuthInitializer() {
  useEffect(() => {
    setTokenRefreshCallback((newToken) => {
      const store = useAuthStore.getState();
      if (store.user) {
        store.setAuth(newToken, store.user);
      }
    });

    setAuthExpiredCallback(() => {
      const store = useAuthStore.getState();
      if (store.user) {
        store.clearAuth();
        window.location.href = "/login";
      }
    });

    // ── Impersonation entry ──────────────────────────────────────────────────
    // A platform admin 'entered' this brand — token arrives via the URL hash
    // (#session=…). Log in as the brand admin, clean the URL, and stop.
    if (typeof window !== "undefined" && window.location.hash.startsWith("#session=")) {
      const token = decodeURIComponent(window.location.hash.slice("#session=".length));
      if (token) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setAccessToken(token);
        const payload = decodeJwtPayload(token);

        const claims = {
          is_admin: !!payload.is_admin,
          is_platform_admin: !!payload.is_platform_admin,
          role: payload.role as string,
          tenant_id: (payload.tenant_id as string) ?? null,
        };

        // Apply the impersonated identity synchronously, before awaiting the
        // profile. A tab opened with window.open inherits a copy of the opener's
        // sessionStorage, so this tab starts out holding the *platform admin's*
        // session; the admin route guard would see that non-tenant-admin user and
        // bounce to /account before the fetch below ever resolved.
        useAuthStore.getState().setAuth(token, claims as unknown as UserProfile);

        apiClient
          .get<Record<string, unknown>>("/api/v1/auth/profile")
          .then((profile) => {
            useAuthStore.getState().setAuth(token, {
              ...(profile as object),
              ...claims,
            } as unknown as UserProfile);
          })
          .catch(() => useAuthStore.getState().clearAuth())
          .finally(() => useAuthStore.getState().setLoading(false));
        return;
      }
    }

    const found = useAuthStore.getState().initAuth();
    if (!found) {
      // No session in sessionStorage — try to restore from httpOnly refresh cookie.
      apiClient
        .post<{ access_token: string }>("/api/v1/refresh", undefined, { skipAuth: true })
        .then(async ({ access_token }) => {
          // Set token in memory so the subsequent profile request is authenticated.
          setAccessToken(access_token);
          try {
            const profile = await apiClient.get<UserProfile>("/api/v1/account/profile");
            const payload = decodeJwtPayload(access_token);
            useAuthStore.getState().setAuth(access_token, {
              ...profile,
              is_admin: !!payload.is_admin,
            });
          } catch {
            useAuthStore.getState().clearAuth();
          }
        })
        .catch(() => {
          // No valid refresh cookie — user must log in.
          useAuthStore.getState().clearAuth();
        })
        .finally(() => {
          // Safety net: ensure isLoading never stays true if any code path missed it.
          useAuthStore.getState().setLoading(false);
        });
    }
  }, []);

  return null;
}
