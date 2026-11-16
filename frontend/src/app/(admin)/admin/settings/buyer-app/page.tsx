"use client";

/**
 * Settings → Buyer app: the branded buyer app, sold on Scale.
 *
 * One PrintCoPilot app serves every shop; a buyer gets into this shop with its
 * six-character code, or by scanning its QR square, which opens
 * printcopilot.co/get-app and from there the app. Inside, the shop wears its
 * own name, logo and colour. A shop on another plan sees what it would get.
 */
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import { BuyerAppPanel } from "@/components/admin/settings/BuyerAppPanel";
import UpgradeNotice from "@/components/admin/UpgradeNotice";

const BLURB =
  "Your buyers shop with you in the PrintCoPilot app, under your shop's name, logo and colour, and get in with a code and QR square of your own.";

export default function BuyerAppPage() {
  return (
    <SettingsFrame active="app" title="Buyer app" sub="Your shop in the PrintCoPilot app, with your name, logo and colour.">
      <UpgradeNotice feature="mobile_app" blurb={BLURB}>
        <BuyerAppPanel />
      </UpgradeNotice>
    </SettingsFrame>
  );
}
