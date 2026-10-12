// Prints SQL that loads REAL CricketData responses saved under .cache/cd/ into provider_cache, stamped with
// the time each response was actually fetched (file mtime). Used when the free-plan daily limit is exhausted.
// Usage: npx tsx --conditions=react-server scripts/snapshot-cache-sql.ts
import fs from "node:fs";
import path from "node:path";
import { normaliseMatch } from "../src/lib/providers/cricketdata";

const dir = path.join(process.cwd(), ".cache", "cd");
const rows: { key: string; provider: string; payload: unknown; fetchedAt: string }[] = [];
const read = (f: string) => {
  const p = path.join(dir, f);
  return { json: JSON.parse(fs.readFileSync(p, "utf8")), at: fs.statSync(p).mtime.toISOString() };
};
for (const [file, id] of [
  ["series_wi.json", "702ce6cb-a551-4aab-961e-0ed1548a3c74"],
  ["series_slpak.json", "a67cb0af-300c-4449-8e80-e006301e5706"],
]) {
  const { json, at } = read(file);
  if (json.status !== "success") continue;
  const list = json.data.matchList.map(normaliseMatch);
  rows.push({ key: `cd:series:${id}`, provider: "CricketData series_info", payload: list, fetchedAt: at });
  // fixture/status for each match comes from the same real series_info response
  for (const m of list.filter((x: { format: string }) => x.format === "T20"))
    rows.push({ key: `cd:match:${m.id}`, provider: "CricketData series_info", payload: m, fetchedAt: at });
}
{
  const { json, at } = read("info_4t20.json");
  if (json.status === "success") rows.push({ key: `cd:match:${json.data.id}`, provider: "CricketData match_info", payload: normaliseMatch(json.data), fetchedAt: at });
}
{
  const { json, at } = read("squad_4t20.json");
  // keep only the fields MatchLab reads (id, name, role)
  const squad = json.data.map((t: { teamName: string; shortname?: string; players: { id: string; name: string; role?: string | null }[] }) => ({
    teamName: t.teamName,
    shortname: t.shortname,
    players: t.players.map((p) => ({ id: p.id, name: p.name, role: p.role ?? null })),
  }));
  if (json.status === "success") rows.push({ key: "cd:squad:3c451481-9fa8-400b-a7b6-27cffc21e1a8", provider: "CricketData match_squad", payload: squad, fetchedAt: at });
}
// last write wins per key (match_info beats the series-derived fixture)
const byKey = new Map(rows.map((r) => [r.key, r]));
const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
process.stdout.write(
  `insert into public.provider_cache (key, provider, payload, ok, error, fetched_at) values\n` +
    [...byKey.values()].map((r) => `(${lit(r.key).replace(/^'"|"'$/g, "'")}, '${r.provider}', ${lit(r.payload)}::jsonb, true, null, '${r.fetchedAt}')`).join(",\n") +
    `\non conflict (key) do update set payload = excluded.payload, provider = excluded.provider, ok = true, error = null, fetched_at = excluded.fetched_at\n  where public.provider_cache.fetched_at <= excluded.fetched_at;\n`,
);
