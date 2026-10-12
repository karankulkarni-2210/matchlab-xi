import type { RuleSet } from "./types";

/**
 * Rule presets. Dream11 does not publish a machine-readable rule file and its rules page was
 * unreachable when we checked (2026-10-12). Two published variants exist:
 *  - "expanded" (announced Jan 2023): max 10 from one team, 1–8 per role.
 *  - "classic": max 7 from one team, WK 1–4, BAT 3–6, AR 1–4, BOWL 3–6.
 * A team that satisfies "strict" satisfies BOTH variants, so it is the default. The owner must still
 * confirm the rules shown in their contest before any team can be labelled Ready.
 */
export const RULE_PRESETS: Record<string, RuleSet> = {
  "dream11-t20-strict": {
    id: "dream11-t20-strict",
    version: "2026.10-strict",
    label: "Dream11 T20 · strict-compatible (default)",
    players: 11,
    creditCap: 100,
    maxFromOneTeam: 7,
    minFromEachTeam: 1,
    roleLimits: {
      WK: { min: 1, max: 4 },
      BAT: { min: 3, max: 6 },
      AR: { min: 1, max: 4 },
      BOWL: { min: 3, max: 6 },
    },
    captainMultiplier: 2,
    viceCaptainMultiplier: 1.5,
    source:
      "Intersection of published Dream11 T20 variants (classic 7/team & role 1–4/3–6/1–4/3–6; expanded 10/team & 1–8). Captain 2×, VC 1.5× per dream11.com how-to-play.",
    sourceAsOf: "2026-10-12",
  },
  "dream11-t20-expanded": {
    id: "dream11-t20-expanded",
    version: "2026.10-expanded",
    label: "Dream11 T20 · expanded limits (10/team, 1–8 per role)",
    players: 11,
    creditCap: 100,
    maxFromOneTeam: 10,
    minFromEachTeam: 1,
    roleLimits: {
      WK: { min: 1, max: 8 },
      BAT: { min: 1, max: 8 },
      AR: { min: 1, max: 8 },
      BOWL: { min: 1, max: 8 },
    },
    captainMultiplier: 2,
    viceCaptainMultiplier: 1.5,
    source: "Dream11 rule change announced 22 Jan 2023 (indiafantasy.com summary). Confirm in your contest.",
    sourceAsOf: "2026-10-12",
  },
};

export const DEFAULT_RULE_ID = "dream11-t20-strict";

export function getRules(id: string | null | undefined): RuleSet {
  return RULE_PRESETS[id ?? DEFAULT_RULE_ID] ?? RULE_PRESETS[DEFAULT_RULE_ID];
}
