// frontend/src/lib/api-client.ts
const API_BASE =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

// The SPA calls the API on a fixed origin (e.g. localhost:8001), so the browser's
// subdomain (which identifies the tenant/brand) is lost from the Host header.
// We derive it from window.location and forward it in the X-Tenant-Slug header so
// the backend can scope every request to the correct brand.
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost";

const TENANT_OVERRIDE_KEY = "tenant_slug_override";

export function currentTenantSlug(): string | null {
  if (typeof window === "undefined") return null;

  const host = window.location.hostname; // e.g. "puma-wholesale.localhost"

  // 1. Subdomain — the real production mechanism, always wins.
  if (
    host !== PLATFORM_DOMAIN &&
    host !== `www.${PLATFORM_DOMAIN}` &&
    host !== "localhost" &&
    host.endsWith(`.${PLATFORM_DOMAIN}`)
  ) {
    return host.slice(0, -(PLATFORM_DOMAIN.length + 1));
  }

  // 2. `?tenant=<slug>` fallback — lets the app be demoed on a host that has no
  //    wildcard subdomains (e.g. a preview deployment). Sticky for the tab so
  //    normal in-app navigation keeps the brand.
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("tenant");
    if (fromQuery) {
      sessionStorage.setItem(TENANT_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = sessionStorage.getItem(TENANT_OVERRIDE_KEY);
    if (stored) return stored;
  } catch {
    // sessionStorage unavailable (private mode) — fall through.
  }

  return null; // root domain — platform level, no tenant
}

// In-memory token store (never persisted to localStorage for XSS safety)
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// Callback to update sessionStorage when token is silently refreshed
let onTokenRefreshed: ((token: string) => void) | null = null;

export function setTokenRefreshCallback(cb: (token: string) => void) {
  onTokenRefreshed = cb;
}

// Callback fired when refresh fails — used to trigger clean logout + redirect
let onAuthExpired: (() => void) | null = null;

export function setAuthExpiredCallback(cb: () => void) {
  onAuthExpired = cb;
}

// ── Refresh logic ─────────────────────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshSlug = currentTenantSlug();
  refreshPromise = fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include", // httpOnly refresh cookie
    headers: refreshSlug ? { "X-Tenant-Slug": refreshSlug } : undefined,
  })
    .then(async (res) => {
      if (!res.ok) {
        setAccessToken(null);
        if (onAuthExpired) onAuthExpired();
        return null;
      }
      const data = (await res.json()) as { access_token: string };
      setAccessToken(data.access_token);
      if (onTokenRefreshed) onTokenRefreshed(data.access_token);
      return data.access_token;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// ── Core request function ─────────────────────────────────────────────────────

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown[]
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);

  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (!skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Forward the current brand (subdomain) so the backend scopes the request.
  const slug = currentTenantSlug();
  if (slug) {
    headers.set("X-Tenant-Slug", slug);
  }

  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  // cache: 'no-store' prevents Next.js from caching server-component fetches,
  // ensuring product listings and other data are always fresh on navigation.
  const cacheOption: RequestInit = typeof window === "undefined" ? { cache: "no-store" } : {};

  let response = await fetch(fullUrl, { ...cacheOption, ...fetchOptions, headers, credentials: "include" });

  // ── Auto-refresh on 401 ───────────────────────────────────────────────────
  // Guard: never retry when the failing request IS the refresh endpoint itself —
  // that would cause an infinite retry loop.
  const isRefreshEndpoint = fullUrl.includes("/api/v1/auth/refresh");
  if (response.status === 401 && !skipAuth && !isRefreshEndpoint) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(fullUrl, { ...fetchOptions, headers, credentials: "include" });
    }
  }

  if (!response.ok) {
    let errorBody: { error?: { code: string; message: string; details?: unknown[] } };
    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      errorBody = { error: { code: "UNKNOWN", message: response.statusText } };
    }
    throw new ApiClientError(
      response.status,
      errorBody.error?.code ?? "UNKNOWN",
      errorBody.error?.message ?? "Request failed",
      errorBody.error?.details
    );
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ── Convenience methods ───────────────────────────────────────────────────────

export const apiClient = {
  get: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: "GET" }),

  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: "DELETE" }),

  postForm: <T>(url: string, formData: FormData, options?: RequestOptions) =>
    request<T>(url, { ...options, method: "POST", body: formData }),
};
