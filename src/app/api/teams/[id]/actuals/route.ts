import { NextResponse } from "next/server";
import { handleError } from "@/lib/server/http";
import { ActualsSchema, loadTeam, saveActuals } from "@/lib/server/teams";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = ActualsSchema.parse(await req.json());
    const r = await saveActuals(id, body);
    const t = await loadTeam(id);
    return NextResponse.json({ ...r, metrics: t?.metrics ?? null });
  } catch (e) {
    return handleError(e);
  }
}
