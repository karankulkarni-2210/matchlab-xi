import { NextResponse } from "next/server";
import { z } from "zod";
import { explainTeam } from "@/lib/ai/explain";
import { buildMatch } from "@/lib/server/build";
import { handleError } from "@/lib/server/http";

const Body = z.object({
  matchId: z.string().min(1).max(80),
  selection: z.object({
    playerKeys: z.array(z.string().max(80)).length(11),
    captainKey: z.string().max(80),
    viceCaptainKey: z.string().max(80),
  }),
  regenerate: z.boolean().optional(),
  practice: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const b = await buildMatch(body.matchId, { selection: body.selection, practice: body.practice });
    if (!b.validation?.valid) return NextResponse.json({ error: "Team is invalid; fix violations before generating reasons." }, { status: 422 });
    const r = await explainTeam(b, !!body.regenerate);
    return NextResponse.json(r);
  } catch (e) {
    return handleError(e);
  }
}
