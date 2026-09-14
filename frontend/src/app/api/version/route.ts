/**
 * Which build is live right now.
 *
 * Answered by the server of the deployment that currently owns the domain, so a
 * tab still running an older build can compare its own baked-in id against this
 * and notice it has been replaced. See DeployRefresh.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA || "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
