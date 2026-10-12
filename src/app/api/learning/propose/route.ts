import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/server/http";
import { proposeAdjustment } from "@/lib/server/learning";

const Body = z.object({ dataset: z.enum(["demo", "real"]) });

export async function POST(req: Request) {
  try {
    const { dataset } = Body.parse(await req.json());
    return NextResponse.json(await proposeAdjustment(dataset), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
