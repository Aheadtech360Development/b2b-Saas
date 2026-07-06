// frontend/src/stores/auth.store.ts
/**
 * Zustand auth store — access token held in memory and persisted to
 * sessionStorage (cleared when the browser tab is closed).
 * Refresh token is stored in an httpOnly cookie by the server.
 *
 * Session is read synchronously at module load time (not in a useEffect) so
 * the very first render already has the correct auth state — this eliminates
 * the "Loading…" flash on every cold mount of the admin layout.
 */
import { create } from "zustand";
import { setAccessToken } from "@/lib/api-client";
import type { UserProfile } from "@/types/user.types";


const SESSION_KEY = "af_session";

interface PersistedSession {
  token: string;
  user: UserProfile;
}

function readSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

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

// ---------------------------------------------------------------------------
// Synchronous init — runs at module import time, before any React render.
// On the server (SSR), window is undefined so we skip and default to loading.
// On the client, we read sessionStorage synchronously so the first render
// already has the correct auth state (no useEffect round-trip delay).
// ---------------------------------------------------------------------------
interface SyncAuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
}

function buildSyncState(): SyncAuthState {
  if (typeof window === "undefined") {
    // SSR: no session available; AuthInitializer will resolve after hydration
    return { accessToken: null, user: null, isLoading: true };
  }
  const session = readSession();
  if (!session) {
    return { accessToken: null, user: null, isLoading: true };
  }
  const payload = decodeJwtPayload(session.token);
  const exp = payload.exp as number | undefined;
  const isExpired = exp ? (Date.now() / 1000) > exp - 30 : false;
  if (isExpired) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    return { accessToken: null, user: null, isLoading: true };
  }
  // Valid session — set token immediately so API calls work from the first render
  setAccessToken(session.token);
  return {
    accessToken: session.token,
    user: {
      ...session.user,
      is_admin: !!payload.is_admin,
      is_platform_admin: !!payload.is_platform_admin,
      role: (payload.role as string) ?? session.user.role,
      tenant_id: (payload.tenant_id as string | null) ?? session.user.tenant_id ?? null,
    },
    isLoading: false,
  };
}

const _sync = buildSyncState();

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;

  // Actions
  setAuth: (token: string, user: UserProfile) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  /** Restore session from sessionStorage on app init. Returns true if a session was found. */
  initAuth: () => boolean;

  // Derived helpers
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  isPlatformAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Use the synchronously-computed initial state so the first render is correct
  accessToken: _sync.accessToken,
  user: _sync.user,
  isLoading: _sync.isLoading,

  setAuth: (token, user) => {
    setAccessToken(token);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
    } catch {}
    set({ accessToken: token, user, isLoading: false });
  },

  clearAuth: () => {
    setAccessToken(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    set({ accessToken: null, user: null, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  initAuth: () => {
    // If sync init already resolved the session, nothing to do
    if (get().accessToken !== null) {
      return true;
    }
    // Otherwise try to read session now (e.g. if module was imported on server)
    const session = readSession();
    if (session) {
      const payload = decodeJwtPayload(session.token);
      const user = {
        ...session.user,
        is_admin: !!payload.is_admin,
        is_platform_admin: !!payload.is_platform_admin,
        role: (payload.role as string) ?? session.user.role,
        tenant_id: (payload.tenant_id as string | null) ?? session.user.tenant_id ?? null,
      };
      const exp = payload.exp as number | undefined;
      const isExpired = exp ? (Date.now() / 1000) > exp - 30 : false;
      if (isExpired) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        set({ isLoading: true });
        return false;
      }
      setAccessToken(session.token);
      set({ accessToken: session.token, user, isLoading: false });
      return true;
    }
    set({ isLoading: true });
    return false;
  },

  isAuthenticated: () => get().accessToken !== null,
  isAdmin: () => get().user?.is_admin === true,
  isPlatformAdmin: () => get().user?.is_platform_admin === true,
}));
