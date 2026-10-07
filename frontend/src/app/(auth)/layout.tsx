import { headers } from "next/headers";
import { loadStore } from "@/lib/store";
import { PlatformHeader, PlatformFooter } from "@/components/platform/PlatformChrome";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // A shop's own sign-in pages stay bare — the form and nothing else. The
  // platform's get its header and footer, so signing in at printcopilot.co
  // looks like the rest of printcopilot.co rather than a page on its own.
  // Sign-up draws its own, so it is left out here.
  const { brand } = await loadStore();
  const platformChrome = brand === null && !pathname.startsWith("/signup");

  return (
    <>
      {platformChrome && <PlatformHeader />}
      {children}
      {platformChrome && <PlatformFooter />}
    </>
  );
}
