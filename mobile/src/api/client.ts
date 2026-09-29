/**
 * Every call to the backend goes through here.
 *
 * Two things make this different from the web client. There is no subdomain
 * to say which shop a request belongs to, so the brand travels in the token
 * and — before anyone has signed in — in a header. And there is no cookie
 * jar, so the refresh token is kept in the Keychain and sent explicitly; the
 * server hands it over because of the X-Client-Type header below.
 */
import Constants from "expo-constants";

import { clearSession, readSession, writeSession } from "@/session/store";

const API = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl
  ?? "http://localhost:8000";

/** Marks us as native, which is what makes the server hand over tokens
 *  instead of setting a cookie it knows we cannot keep. */
const CLIENT = "native";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** What the server said went wrong, in the shape it says it. */
function messageFrom(body: unknown, fallback: string): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const detail = b.detail;
    if (typeof detail === "string" && detail) return detail;
    // FastAPI validation errors arrive as a list of objects.
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    const err = b.error as { message?: string } | undefined;
    if (err?.message) return err.message;
  }
  return fallback;
}

interface CallOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the access token — for signing in, and for a shop code lookup. */
  anonymous?: boolean;
  /** Which shop, when no token says so yet. */
  tenantSlug?: string;
  /** Set once, internally, so a failed refresh cannot loop. */
  retried?: boolean;
}

export async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, tenantSlug, retried = false } = options;
  const session = anonymous ? null : await readSession();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client-Type": CLIENT,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  // Only needed before sign-in. Afterwards the token names the brand, and the
  // server trusts the token over this header — a header cannot move a session
  // to another shop.
  const slug = tenantSlug ?? (anonymous ? undefined : session?.tenantSlug);
  if (slug) headers["X-Tenant-Slug"] = slug;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // An expired access token is the ordinary case, not an error: refresh once
  // and replay. Guarded by `retried` so a dead session fails rather than
  // spinning.
  if (res.status === 401 && !anonymous && !retried) {
    const renewed = await refresh();
    if (renewed) return call<T>(path, { ...options, retried: true });
    await clearSession();
  }

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(parsed ?? text, `Request failed (${res.status})`));
  }
  return (parsed ?? {}) as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Trade the stored refresh token for a new pair.
 *
 * Refreshing rotates the refresh token, so the new one has to be stored or
 * the next attempt would present a spent token and sign the person out.
 */
export async function refresh(): Promise<boolean> {
  const session = await readSession();
  if (!session?.refreshToken) return false;

  try {
    const res = await fetch(`${API}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Client-Type": CLIENT,
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token) return false;
    await writeSession({
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? session.refreshToken,
    });
    return true;
  } catch {
    // Offline, or the server is unreachable. Not a reason to sign anybody out.
    return false;
  }
}

export const apiBase = API;
