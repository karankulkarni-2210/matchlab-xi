import { NextResponse } from "next/server";
import { handleError } from "@/lib/server/http";
import { decide, DecideSchema } from "@/lib/server/learning";

export async function POST(req: Request) {
  try {
    return NextResponse.json(await decide(DecideSchema.parse(await req.json())));
  } catch (e) {
    return handleError(e);
  }
}
