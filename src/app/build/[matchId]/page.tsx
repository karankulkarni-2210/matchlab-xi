import Link from "next/link";
import { CloudOff, FlaskConical } from "lucide-react";
import { BuildXI } from "@/components/build/BuildXI";
import { templateExplanation } from "@/lib/ai/explain";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";
import { buildMatch } from "@/lib/server/build";

export const dynamic = "force-dynamic";
export const metadata = { title: "Build XI · MatchLab XI" };

export default async function BuildPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ practice?: string }> }) {
  const { matchId } = await params;
  const practice = (await searchParams).practice === "1";
  let result: Awaited<ReturnType<typeof buildMatch>> | null = null;
  let error: string | null = null;
  try {
    result = await buildMatch(decodeURIComponent(matchId), { practice });
  } catch (e) {
    error = (e as Error).message;
  }
  if (result) return <BuildXI initial={{ ...result, template: templateExplanation(result) }} />;

  // Live provider unavailable (quota, outage, unknown id): explain calmly and point to the demo. Never invent data.
  const quota = /limit|quota/i.test(error ?? "");
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-10">
      <div className="flex items-center gap-3">
        <CloudOff className="text-warn" size={28} aria-hidden />
        <h1 className="text-2xl font-bold tracking-tight">Live data for this fixture isn&apos;t available right now</h1>
      </div>
      <p className="panel p-4 text-sm text-muted" role="status">
        {quota
          ? "CricketData's free plan allows 100 calls a day and today's limit has been used. Fixtures fetched earlier still appear on Match Desk with their age; this match has no saved snapshot yet. Live data returns after the daily reset (05:30 IST)."
          : `The live data provider could not supply this fixture (${error}). MatchLab never fills gaps with invented data.`}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/build/${DEMO_MATCH_ID}`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-ink">
          <FlaskConical size={16} /> Open the demo match
        </Link>
        <Link href="/" className="focus-ring rounded-lg border border-line-2 px-4 py-2.5 text-sm">
          Back to Match Desk
        </Link>
      </div>
    </div>
  );
}
