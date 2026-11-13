/**
 * Paying by card, in Stripe's own payment sheet.
 *
 * The payment is a direct charge on the shop's own Stripe account (Connect),
 * so Stripe is set up for that account each time: the publishable key and the
 * account come back from the server with the payment it just created, the
 * same pair the website hands Stripe.js. The card details go from the sheet
 * to Stripe and never pass through this app or our server.
 */
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";

import type { CardIntent } from "@/api/shopping";

/** Where a bank's own page (3-D Secure) sends the buyer back to. In Expo Go
 *  the app's address is Expo's, so the scheme is taken from it. */
function returnScheme(): string {
  const inExpoGo = Constants.executionEnvironment === "storeClient";
  return inExpoGo ? Linking.createURL("/--/") : Linking.createURL("");
}

export type CardResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export async function payByCard(intent: CardIntent, shopName: string): Promise<CardResult> {
  if (!intent.clientSecret || !intent.publishableKey) {
    return { ok: false, cancelled: false, message: "The shop could not start a card payment. Try again." };
  }
  await initStripe({
    publishableKey: intent.publishableKey,
    stripeAccountId: intent.accountId || undefined,
    urlScheme: returnScheme(),
    setReturnUrlSchemeOnAndroid: true,
  });
  const ready = await initPaymentSheet({
    paymentIntentClientSecret: intent.clientSecret,
    merchantDisplayName: shopName || "Shop",
    returnURL: Linking.createURL("stripe-redirect"),
    // Card payments settle at once; nothing here waits days to clear.
    allowsDelayedPaymentMethods: false,
  });
  if (ready.error) return { ok: false, cancelled: false, message: ready.error.message };
  const paid = await presentPaymentSheet();
  if (paid.error) {
    return { ok: false, cancelled: paid.error.code === "Canceled", message: paid.error.message };
  }
  return { ok: true };
}
