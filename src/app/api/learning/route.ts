import { NextResponse } from "next/server";
import { handleError } from "@/lib/server/http";
import { learningOverview } from "@/lib/server/learning";

export async function GET(req: Request) {
  try {
    const ds = new URL(req.url).searchParams.get("dataset") === "real" ? "real" : "demo";
    return NextResponse.json(await learningOverview(ds));
  } catch (e) {
    return handleError(e);
  }
}
