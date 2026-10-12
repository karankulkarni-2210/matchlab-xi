import Link from "next/link";
import { BuildXI } from "@/components/build/BuildXI";
import { templateExplanation } from "@/lib/ai/explain";
import { buildMatch } from "@/lib/server/build";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Build XI · MatchLab XI" };

export default async function BuildPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ practice?: string }> }) {
  const { matchId } = await params;
  const practice = (await searchParams).practice === "1";
  const user = await currentUser().catch(() => null);
  let result: Awaited<ReturnType<typeof buildMatch>> | null = null;
  let error: string | null = null;
  try {
    result = await buildMatch(decodeURIComponent(matchId), { practice });
  } catch (e) {
    error = (e as Error).message;
  }
  if (result) return <BuildXI initial={{ ...result, template: templateExplanation(result) }} signedIn={!!user} />;
  {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <h1 className="text-2xl font-bold">Could not load this match</h1>
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-4 text-sm text-bad">
          {error}
        </p>
        <p className="text-sm text-muted">If the CricketData daily quota is exhausted and no snapshot was cached, try again later. The labelled demo works without the provider.</p>
        <div className="flex gap-3">
          <Link href="/" className="focus-ring rounded-lg border border-line-2 px-4 py-2 text-sm">Back to Match Desk</Link>
          <Link href="/build/demo-hh-dd" className="focus-ring rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink">Open demo</Link>
        </div>
      </div>
    );
  }
}
