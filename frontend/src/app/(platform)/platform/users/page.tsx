"use client";

import { Suspense } from "react";
import { UsersPage } from "@/components/platform/console/UsersPage";

export default function PlatformUsersPage() {
  return (
    <Suspense fallback={<div className="pc-empty">Loading…</div>}>
      <UsersPage />
    </Suspense>
  );
}
