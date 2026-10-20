"use client";

/**
 * The owner's setup steps (design screens 7 to 11), on a screen of their own
 * like the website builder: the steps are the work, and the console's sidebar
 * beside them would only be in the way.
 *
 * Two ways in. Straight from the sign-up's first screen, with the email and
 * password held in this tab (lib/pendingSignup): step 1 makes the shop. Or as
 * the shop's owner, signed in (from Home's "Finish setting up your store", or
 * after that step 1): the steps from where they left off.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminGate from "@/app/site-builder/AdminGate";
import { useAuthStore } from "@/stores/auth.store";
import { interruptedSignupEmail, readSignup, type PendingSignup } from "@/lib/pendingSignup";
import { CreateShop } from "@/components/onboarding/CreateShop";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
// The carrier dialog in step 4 is the console's own, drawn with its parts.
import "@/app/(admin)/admin-shell.css";

type Mode = { kind: "wait" } | { kind: "create"; held: PendingSignup } | { kind: "shop" };

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuthStore();
  const [mode, setMode] = useState<Mode>({ kind: "wait" });

  useEffect(() => {
    // Decided once: what the page shows does not change under the owner's feet.
    const decide = (next: Mode) => setMode((now) => (now.kind === "wait" ? next : now));
    const held = readSignup();
    if (held) { decide({ kind: "create", held }); return; }
    // A sign-up this tab started and lost to a reload: its password was never
    // kept, so it is asked for again on the first screen, with the email in.
    const lost = interruptedSignupEmail();
    if (lost) {
      if (isLoading) return;
      if (!isAuthenticated()) {
        router.replace(`/signup?email=${encodeURIComponent(lost)}`);
        return;
      }
    }
    decide({ kind: "shop" });
  }, [isLoading, isAuthenticated, router]);

  if (mode.kind === "wait") return null;
  if (mode.kind === "create") return <CreateShop held={mode.held} />;
  return (
    <AdminGate>
      <OnboardingWizard />
    </AdminGate>
  );
}
