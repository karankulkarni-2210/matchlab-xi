// Prints SQL that (re)seeds the isolated synthetic demo dataset. Usage: npx tsx scripts/demo-seed-sql.ts > supabase/seed.sql
import { randomUUID } from "node:crypto";
import { demoSeedRows } from "../src/lib/demo/seedRows";

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const insert = (table: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return `insert into public.${table} (${cols.join(", ")}) values\n${rows
    .map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`)
    .join(",\n")};\n`;
};

const { weightVersion, teams, teamPlayers, actuals } = demoSeedRows(randomUUID);
process.stdout.write(`-- Synthetic demo dataset (fictional). Safe to re-run: removes only is_demo rows.
begin;
delete from public.weight_decisions where is_demo;
delete from public.teams where is_demo;
delete from public.weight_versions where is_demo;
${insert("weight_versions", [weightVersion])}${insert("teams", teams)}${insert("team_players", teamPlayers)}${insert("actuals", actuals)}commit;
`);
