/**
 * Where the session lives between launches.
 *
 * The tokens go in SecureStore — the iOS Keychain and the Android Keystore —
 * rather than AsyncStorage, which is a plain file any process with the
 * device's filesystem can read. This is the whole reason the server hands a
 * native client its refresh token at all.
 *
 * Reads are defensive: SecureStore can throw on a device with no passcode or
 * a corrupted entry, and a crash on launch is a worse outcome than a sign-in
 * screen.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "printcopilot.session";

export interface Session {
  accessToken: string;
  refreshToken: string | null;
  /** Read off the token at sign-in, so calls can name the shop and the app
   *  can fetch its branding without asking the person which shop they are in. */
  tenantSlug: string | null;
  tenantId: string | null;
  email: string | null;
  /** Null until a wholesale application is approved. Its absence is what
   *  stops the buy screens being offered to somebody still waiting. */
  companyId: string | null;
}

let cached: Session | null = null;
let loaded = false;

export async function readSession(): Promise<Session | null> {
  if (loaded) return cached;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

export async function writeSession(session: Session): Promise<void> {
  cached = session;
  loaded = true;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  } catch {
    // Kept in memory for this run even if the store refuses. Signing the
    // person out because their device would not persist a token is worse
    // than a session that ends when the app does.
  }
}

export async function clearSession(): Promise<void> {
  cached = null;
  loaded = true;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Already gone, or unreadable. Either way there is nothing to keep.
  }
}

/**
 * The claims inside an access token, without verifying it.
 *
 * The server verifies; the app only needs to know which shop it is in and
 * whether a company has been attached yet. Nothing here decides access — it
 * decides which screen to show, and a tampered token would simply be refused
 * by the API on the next call.
 */
export function readClaims(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeBase64(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

/** React Native has no atob, and a JWT payload is plain base64. */
function decodeBase64(input: string): string {
  let str = input.replace(/=+$/, "");
  let out = "";
  let bits = 0;
  let buffer = 0;
  for (const ch of str) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  // JWT claims are UTF-8; decodeURIComponent turns the bytes back into text
  // so a shop named in any script survives the trip.
  try {
    return decodeURIComponent(
      out.split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""),
    );
  } catch {
    return out;
  }
}
