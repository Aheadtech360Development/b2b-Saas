"use client";

// import { useEffect } from "react";
// import { useAuthStore } from "@/stores/auth.store";

// export function Providers({ children }: { children: React.ReactNode }) {
//   const { initAuth } = useAuthStore();

//   useEffect(() => {
//     // Restore session from sessionStorage if available.
//     // Do NOT attempt a refresh call if no session exists — avoids noisy 401s
//     // when the user is not logged in (no refresh cookie present).
//     initAuth();
//   }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   return <>{children}</>;
// }


import { AuthInitializer } from "./AuthInitializer";
import { BrandingProvider } from "./BrandingProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthInitializer />
      <BrandingProvider>{children}</BrandingProvider>
    </>
  );
}