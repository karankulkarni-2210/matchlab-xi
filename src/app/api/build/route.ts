import { NextResponse } from "next/server";
import { z } from "zod";
import { templateExplanation } from "@/lib/ai/explain";
import { buildMatch } from "@/lib/server/build";
import { handleError } from "@/lib/server/http";

const Body = z.object({
  matchId: z.string().min(1).max(80),
  selection: z
    .object({
      playerKeys: z.array(z.string().max(80)).max(15),
      captainKey: z.string().max(80).nullable(),
      viceCaptainKey: z.string().max(80).nullable(),
    })
    .optional(),
  lockedKeys: z.array(z.string().max(80)).max(11).optional(),
  excludedKeys: z.array(z.string().max(80)).max(60).optional(),
  practice: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const b = await buildMatch(body.matchId, body);
    return NextResponse.json({ ...b, template: templateExplanation(b) });
  } catch (e) {
    return handleError(e);
  }
}
