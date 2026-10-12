import { NextResponse } from "next/server";
import { handleError } from "@/lib/server/http";
import { saveTeam, SaveTeamSchema } from "@/lib/server/teams";

export async function POST(req: Request) {
  try {
    const body = SaveTeamSchema.parse(await req.json());
    return NextResponse.json(await saveTeam(body), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
