import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { demoSeedRows } from "@/lib/demo/seedRows";
import { handleError } from "@/lib/server/http";
import { supabaseAdmin } from "@/lib/supabase/server";

let lastReset = 0;

/** Restores the isolated synthetic demo dataset. Touches ONLY rows with is_demo = true. */
export async function POST() {
  try {
    const admin = supabaseAdmin();
    if (!admin) return NextResponse.json({ error: "Demo reset needs SUPABASE_SECRET_KEY on the server." }, { status: 503 });
    if (Date.now() - lastReset < 20_000) return NextResponse.json({ error: "Demo was just reset; try again in a few seconds." }, { status: 429 });
    lastReset = Date.now();
    const { weightVersion, teams, teamPlayers, actuals } = demoSeedRows(randomUUID);
    for (const [table, filter] of [
      ["weight_decisions", "is_demo"],
      ["teams", "is_demo"],
      ["weight_versions", "is_demo"],
    ] as const) {
      const { error } = await admin.from(table).delete().eq(filter, true).is("owner_id", null);
      if (error) throw new Error(`reset ${table}: ${error.message}`);
    }
    for (const [table, rows] of [
      ["weight_versions", [weightVersion]],
      ["teams", teams],
      ["team_players", teamPlayers],
      ["actuals", actuals],
    ] as const) {
      const { error } = await admin.from(table).insert(rows as Record<string, unknown>[]);
      if (error) throw new Error(`seed ${table}: ${error.message}`);
    }
    return NextResponse.json({ ok: true, teams: teams.length, actuals: actuals.length });
  } catch (e) {
    return handleError(e);
  }
}
