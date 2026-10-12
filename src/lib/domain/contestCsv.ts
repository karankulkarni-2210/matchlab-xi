import Papa from "papaparse";
import { z } from "zod";
import { ROLES, type ContestPlayer, type LineupStatus } from "./types";

/**
 * Owner-supplied contest data (credits, contest roles, lineup status). Everything here is DATA:
 * names and notes are never interpreted as instructions.
 *
 * CSV columns: name, team, role (WK|BAT|AR|BOWL), credits, lineup (xi|out|probable|squad), history_name (optional)
 */
const LINEUP_MAP: Record<string, LineupStatus> = {
  xi: "confirmed_xi",
  confirmed_xi: "confirmed_xi",
  playing: "confirmed_xi",
  out: "confirmed_out",
  confirmed_out: "confirmed_out",
  bench: "confirmed_out",
  probable: "probable",
  squad: "squad",
  "": "squad",
};

export const ContestPlayerSchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  team: z.string().min(1).max(60),
  role: z.enum(ROLES).nullable(),
  credits: z
    .number()
    .min(4)
    .max(12)
    .refine((n) => Math.round(n * 2) === n * 2, "credits use .5 steps")
    .nullable(),
  lineup: z.enum(["confirmed_xi", "confirmed_out", "probable", "squad"]),
  historyName: z.string().max(80).nullable().optional(),
  providerRole: z.string().max(40).nullable().optional(),
});

export const ContestSaveSchema = z.object({
  matchId: z.string().min(1).max(80),
  players: z.array(ContestPlayerSchema).min(2).max(60),
  ruleId: z.string().min(1).max(60),
  rulesConfirmed: z.boolean(),
  lineupsConfirmed: z.object({ teamA: z.boolean(), teamB: z.boolean() }),
  sourceLabel: z.string().max(120),
  sourceAsOf: z.string().datetime().nullable(),
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export interface CsvResult {
  players: ContestPlayer[];
  errors: { row: number; message: string }[];
  matched: number;
  added: number;
}

/** Merge CSV rows onto the existing pool by (name, team). Unknown players are added with a csv: key. */
export function applyContestCsv(csv: string, pool: ContestPlayer[], teams: [string, string]): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const errors: { row: number; message: string }[] = [];
  const out = pool.map((p) => ({ ...p }));
  let matched = 0;
  let added = 0;
  if (!parsed.meta.fields?.includes("name") || !parsed.meta.fields.includes("credits"))
    return { players: pool, errors: [{ row: 0, message: "CSV needs at least 'name' and 'credits' columns." }], matched, added };
  parsed.data.forEach((r, i) => {
    const row = i + 2;
    const name = (r.name ?? "").trim();
    if (!name) return errors.push({ row, message: "Missing name" });
    const teamRaw = (r.team ?? "").trim();
    const team = teams.find((t) => norm(t) === norm(teamRaw) || norm(t).startsWith(norm(teamRaw)) && norm(teamRaw).length >= 2) ?? null;
    if (teamRaw && !team) return errors.push({ row, message: `Unknown team "${teamRaw}" (expected ${teams.join(" or ")})` });
    const roleRaw = (r.role ?? "").trim().toUpperCase();
    const role = roleRaw === "" ? undefined : (ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as ContestPlayer["role"]) : null;
    if (role === null) return errors.push({ row, message: `Invalid role "${r.role}" (WK, BAT, AR, BOWL)` });
    const creditsRaw = (r.credits ?? "").trim();
    let credits: number | null | undefined = undefined;
    if (creditsRaw !== "") {
      const c = Number(creditsRaw);
      if (!Number.isFinite(c) || c < 4 || c > 12 || Math.round(c * 2) !== c * 2)
        return errors.push({ row, message: `Invalid credits "${creditsRaw}" (4–12 in .5 steps)` });
      credits = c;
    }
    const lineupRaw = (r.lineup ?? "").trim().toLowerCase();
    const lineup = LINEUP_MAP[lineupRaw];
    if (lineupRaw && !lineup) return errors.push({ row, message: `Invalid lineup "${r.lineup}" (xi, out, probable, squad)` });
    const historyName = (r.history_name ?? "").trim() || undefined;

    const idx = out.findIndex((p) => norm(p.name) === norm(name) && (!team || p.team === team));
    if (idx >= 0) {
      matched++;
      out[idx] = {
        ...out[idx],
        role: role ?? out[idx].role,
        credits: credits === undefined ? out[idx].credits : credits,
        lineup: lineup ?? out[idx].lineup,
        historyName: historyName ?? out[idx].historyName ?? null,
      };
    } else {
      if (!team) return errors.push({ row, message: `"${name}" is not in the squad; add a team column to include them` });
      added++;
      out.push({
        key: `csv:${team}:${name}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-").slice(0, 80),
        name: name.slice(0, 80),
        team,
        role: role ?? null,
        credits: credits ?? null,
        lineup: lineup ?? "squad",
        historyName: historyName ?? null,
        providerRole: null,
      });
    }
  });
  return { players: out, errors, matched, added };
}

export function contestCsvTemplate(pool: ContestPlayer[]) {
  const rows = pool.map((p) => ({
    name: p.name,
    team: p.team,
    role: p.role ?? "",
    credits: p.credits ?? "",
    lineup: p.lineup === "confirmed_xi" ? "xi" : p.lineup === "confirmed_out" ? "out" : p.lineup,
    history_name: p.historyName ?? "",
  }));
  return Papa.unparse(rows);
}
