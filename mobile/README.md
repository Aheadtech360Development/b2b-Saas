# PrintCopilot mobile

React Native (Expo SDK 58). A buyer gets the shop: browse, cart, checkout
(card or cash on delivery), orders. A shop's own people get the console.

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
src/api/client.ts      every call: tokens, refresh-and-replay, error messages
src/api/auth.ts        sign in, 2FA, sign out, password reset
src/api/shop.ts        find a shop by code; the current shop's branding
src/api/account.ts     profile and recent orders
src/api/shopping.ts    the buyer's shop: products, cart, checkout, orders
src/session/store.ts   the session, in the Keychain / Keystore
src/shop/              the buyer's app: Shop, Cart, Orders, Account tabs,
                       product, checkout (pay.ts: Stripe's payment sheet), order
src/admin/             the console: Home, lists, records, actions, edit forms
src/ui/                palette, and the pieces every screen is built from
src/screens/           sign in, apply, account
```

## Paying by card

Checkout asks the server for the payment (`/checkout/intent`), which answers
with the shop's own Stripe account and key, and opens Stripe's payment sheet
for that account (`@stripe/stripe-react-native`, included in Expo Go). The
order is placed (`/checkout/confirm`) only once the card is charged; if that
fails, the button finishes the same order rather than charging again. Cash on
delivery is offered when the shop has it on.

What the app does not build itself (products from options, gang sheets, the
t-shirt designer) opens on the shop's website.

## Checks

`npm run typecheck` here, and `backend/tests/test_mobile_app_routes.py`,
which fails when the app calls a path or method the API does not have.
