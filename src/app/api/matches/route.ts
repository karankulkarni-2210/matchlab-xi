import { NextResponse } from "next/server";
import { listMatches } from "@/lib/server/match";
import { handleError } from "@/lib/server/http";

export async function GET() {
  try {
    return NextResponse.json(await listMatches());
  } catch (e) {
    return handleError(e);
  }
}
