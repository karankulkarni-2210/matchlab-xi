import { NextResponse } from "next/server";
import { envStatus } from "@/lib/env";
import { quotaSnapshot } from "@/lib/providers/cricketdata";

/** Configuration health: names and booleans only, never values. */
export async function GET() {
  return NextResponse.json({ env: envStatus(), cricketDataQuota: quotaSnapshot() });
}
