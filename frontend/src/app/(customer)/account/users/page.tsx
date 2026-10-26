"use client";

/** Team, Members (and Groups at ?tab=groups): components/portal/TeamPage. */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeamPage } from "@/components/portal/TeamPage";
import { Loading } from "@/components/portal/ui";

function Team() {
  const tab = useSearchParams().get("tab") === "groups" ? "groups" : "members";
  return <TeamPage tab={tab} />;
}

export default function TeamMembersPage() {
  return <Suspense fallback={<Loading />}><Team /></Suspense>;
}
