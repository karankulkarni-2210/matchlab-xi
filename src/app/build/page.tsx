import { redirect } from "next/navigation";
import { listMatches } from "@/lib/server/match";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";

export const dynamic = "force-dynamic";

/** Opens the next upcoming real T20 fixture, or the labelled demo if none can be loaded. */
export default async function BuildIndex() {
  const { matches } = await listMatches().catch(() => ({ matches: [] as Awaited<ReturnType<typeof listMatches>>["matches"] }));
  const next = matches.find((m) => !m.ended && new Date(m.startsAt).getTime() > Date.now() - 6 * 3600e3);
  redirect(`/build/${next?.id ?? DEMO_MATCH_ID}`);
}
