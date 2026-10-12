"use client";

/**
 * All print jobs (/admin/production/all): every gang sheet job whatever its
 * status, with the numbers over them. The print queue (/admin/production)
 * keeps only what is still to be printed; finished and rejected jobs are here.
 * The status is in the address (?status=).
 */
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AllJobs, GangSheetNumbers } from "@/components/admin/production/AllJobs";

export default function AllPrintJobsPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading the print jobs…</div></div>}>
      <AllPrintJobs />
    </Suspense>
  );
}

function AllPrintJobs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const href = (s: string) => `${pathname}${s ? `?status=${encodeURIComponent(s)}` : ""}`;
  return (
    <div className="pc-page" data-all-jobs>
      <Link href="/admin/production" className="pc-back">← Production</Link>
      <div className="pc-head" style={{ marginTop: "10px" }}>
        <div>
          <div className="pc-eyebrow">Production</div>
          <h1 className="pc-h1">All print jobs</h1>
          <p className="pc-sub-line">Every gang sheet job, finished and rejected ones too. The print queue keeps only what is still to print.</p>
        </div>
        <Link href="/admin/production" className="pc-btn" data-kind="primary">Open the print queue</Link>
      </div>
      <div className="pc-stack" style={{ gap: "18px" }}>
        <GangSheetNumbers statusHref={href} />
        <AllJobs status={status} onStatus={(s) => router.replace(href(s), { scroll: false })} />
      </div>
    </div>
  );
}
