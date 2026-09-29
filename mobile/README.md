# PrintCopilot mobile

React Native (Expo). Phase 1: signing in and your own account.

## Running it

```
npm install
npx expo start
```

Then open it in Expo Go on a phone, or press `i` / `a` for a simulator.

The backend it talks to is `expo.extra.apiUrl` in `app.json`. Point that at a
local server while developing.

## How it finds a shop

There is no subdomain on a phone, so:

* **Signing in** needs no shop at all. One email, one password; the token that
  comes back names the brand, and the app reads it from there.
* **Applying** needs a shop first, so it asks for the shop code the supplier
  hands out (Settings → Shop code in their admin).

## Tokens

The server keeps a browser's refresh token in an httpOnly cookie, which is the
safest place for one. A phone has no such cookie jar and does have the Keychain,
so this app sends `X-Client-Type: native` and is handed the token to store in
`expo-secure-store`. Refreshing rotates it; the new one replaces the old.

## What is here

```
src/api/client.ts     every call: tokens, refresh-and-replay, error messages
src/api/auth.ts       sign in, 2FA, sign out, password reset
src/api/shop.ts       find a shop by code; the current shop's branding
src/api/account.ts    profile and recent orders
src/session/store.ts  the session, in the Keychain / Keystore
src/ui/               palette, and the pieces every screen is built from
src/screens/          sign in, apply, account
```

## Next

Phase 2 is browsing and the cart, which is when a navigation library earns its
place — there are three screens here and one rule between them.
