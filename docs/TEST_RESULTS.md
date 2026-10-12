# MatchLab XI — test results

Recorded 12 Oct 2026 (IST). Re-run with `npm test`, `npx tsc --noEmit`, `npx eslint src tests scripts`, `npm run build`, and the SQL scripts in `supabase/tests/`.

## 1. Unit & behaviour tests (vitest) — 50/50 passed

What they cover (mapped to the brief): valid / invalid / impossible XI · credit and role boundaries · duplicates · C = VC · confirmed non-participant · unknown credits · swap re-validation · optimizer optimality against brute force · absent vs zero actuals · C/VC multiplied exactly once · MAE and signed bias arithmetic · insufficient-N blocking · bounded proposals and rejection of malformed AI numbers · future weight versions vs deterministic replay of frozen inputs · no history leakage · stale provider snapshot fallback · malformed / non-JSON / invented-ID Gemini output · 429 handling and honest "cached" labelling · non-Flash model refusal · CSV row validation · Dream11 points approximation.

```
 ✓ tests/scoring.test.ts > scoring basics > exports version and gives every lineup player +4
 ✓ tests/scoring.test.ts > batting > awards +1/run, +4 boundary bonus, +6 six bonus; non_boundary 4 gets no bonus
 ✓ tests/scoring.test.ts > batting > awards only the highest milestone (80 -> +12, 100 -> +16)
 ✓ tests/scoring.test.ts > batting > applies duck -2 only to non-bowlers dismissed for 0
 ✓ tests/scoring.test.ts > batting > does not apply duck for retired hurt; applies to non-striker run out
 ✓ tests/scoring.test.ts > batting > applies strike-rate bands with 10-ball minimum, excluding wides from balls faced
 ✓ tests/scoring.test.ts > batting > skips SR penalty for players who bowled >= 12 legal balls
 ✓ tests/scoring.test.ts > bowling > awards +30 per wicket and +8 for lbw/bowled; run out not credited to bowler
 ✓ tests/scoring.test.ts > bowling > awards haul bonus (highest only): 3w +4, 5w +12
 ✓ tests/scoring.test.ts > bowling > counts dot balls including byes/legbyes but not wides/noballs; awards maiden
 ✓ tests/scoring.test.ts > bowling > applies economy bands with a 2-over minimum
 ✓ tests/scoring.test.ts > fielding > awards +8 per catch and +4 once for 3+ catches; caught-and-bowled goes to bowler
 ✓ tests/scoring.test.ts > fielding > gives substitute fielders nothing
 ✓ tests/scoring.test.ts > fielding > awards +12 per stumping
 ✓ tests/scoring.test.ts > fielding > run out: one fielder = direct hit +12; two fielders = +6 each
 ✓ tests/scoring.test.ts > super over > excludes super-over innings entirely
 ✓ tests/metrics-learning.test.ts > actual points input > distinguishes blank (not entered) from zero
 ✓ tests/metrics-learning.test.ts > team metrics > applies C/VC multipliers exactly once and hides the final total until complete
 ✓ tests/metrics-learning.test.ts > team metrics > computes MAE and signed bias (predicted − actual) over entered players only
 ✓ tests/metrics-learning.test.ts > learning loop > blocks proposals below the minimum-evidence gate
 ✓ tests/metrics-learning.test.ts > learning loop > flags a repeated, consistent role bias and proposes a bounded correction
 ✓ tests/metrics-learning.test.ts > learning loop > rejects out-of-bounds or malformed AI proposals instead of clipping them
 ✓ tests/metrics-learning.test.ts > learning loop > a new weight version changes future predictions but replays past inputs deterministically
 ✓ tests/metrics-learning.test.ts > forecast formulas > separates predicted base, ranking score, coverage and uncertainty
 ✓ tests/metrics-learning.test.ts > forecast formulas > falls back to the role prior with zero coverage when no history matches
 ✓ tests/metrics-learning.test.ts > forecast formulas > does not use history on or after the as-of date (no leakage in replays)
 ✓ tests/metrics-learning.test.ts > forecast formulas > applies lower availability to unconfirmed lineups in ranking only
 ✓ tests/providers-ai.test.ts > Gemini output handling > rejects non-JSON and schema-violating output instead of using it
 ✓ tests/providers-ai.test.ts > Gemini output handling > caches valid output by evidence hash and labels it cached (not fresh) on reuse
 ✓ tests/providers-ai.test.ts > Gemini output handling > on 429 returns rate_limited, or the cached result clearly marked as cached
 ✓ tests/providers-ai.test.ts > Gemini output handling > refuses to run a non-Flash model
 ✓ tests/providers-ai.test.ts > provider cache freshness > serves the last good snapshot as STALE (with the error) when a refresh fails
 ✓ tests/providers-ai.test.ts > provider cache freshness > throws (no invented data) when nothing was ever cached
 ✓ tests/providers-ai.test.ts > provider cache freshness > infers T20 format when the provider mislabels it
 ✓ tests/providers-ai.test.ts > contest CSV import > applies credits/roles/lineups by name and reports row errors without saving bad rows
 ✓ tests/providers-ai.test.ts > contest CSV import > requires name and credits columns
 ✓ tests/team.test.ts > validateTeam > accepts a valid XI and marks it ready only when every external fact is confirmed
 ✓ tests/team.test.ts > validateTeam > is only provisional when lineups or rules are unconfirmed
 ✓ tests/team.test.ts > validateTeam > rejects duplicates, wrong size and players outside the pool
 ✓ tests/team.test.ts > validateTeam > enforces credit cap at the boundary (exactly 100 ok, 100.5 not)
 ✓ tests/team.test.ts > validateTeam > enforces role min/max under strict rules but not under expanded rules
 ✓ tests/team.test.ts > validateTeam > enforces max players from one real team
 ✓ tests/team.test.ts > validateTeam > rejects captain = vice-captain and C/VC outside the XI
 ✓ tests/team.test.ts > validateTeam > rejects a confirmed non-participant and unknown credits (never estimated)
 ✓ tests/team.test.ts > optimizeTeam > finds the exact optimum (matches brute force) and returns a valid team with distinct C/VC
 ✓ tests/team.test.ts > optimizeTeam > never selects confirmed-out or unknown-credit players
 ✓ tests/team.test.ts > optimizeTeam > returns useful violations instead of relaxing rules when no XI is possible
 ✓ tests/team.test.ts > optimizeTeam > explains unknown credits when they make the pool too small
 ✓ tests/team.test.ts > optimizeTeam > respects locked players and gives bench reasons with valid swaps
 ✓ tests/team.test.ts > optimizeTeam > revalidates swaps: an invalid swap is reported, a valid one passes
 Test Files  4 passed (4)
      Tests  50 passed (50)
```

## 2. Database security & immutability (run against the live Supabase project via SQL; all scripts roll back)

**Current model: single-user workspace with no sign-in** (`supabase/tests/workspace_checks.sql`):

```
server write workspace team+actual(0): ok
anon reads workspace team: 1      insert actual blocked: true   update actual blocked: true
                                  delete team blocked: true     insert contest blocked: true   update weights blocked: true
authed reads workspace team: 1    insert actual blocked: true   update actual blocked: true
                                  delete team blocked: true     insert contest blocked: true   update weights blocked: true
server edit frozen prediction blocked: true
actual still: 0
```

Earlier owner-account model (before sign-in was removed at the owner's request), kept for reference:

`supabase/tests/rls_checks.sql` — two throwaway users A (owner) and B (attacker) plus the anon role:

```
A owner insert team+player+actual(0): ok
A edit weight contents blocked: true
A insert demo team blocked: true
B sees A team rows: 0
B insert actual on A team blocked: true
B update A actual rows affected: 0
B delete A actual rows affected: 0
B add player to A team blocked: true
B change A weight status rows affected: 0
anon sees owner rows: 0
anon write decision blocked: true
anon write provider cache blocked: true
A actual after attacks: 12        (A's own correction 0 → 12 survived; B's 99 never landed)
audit rows: 2                     (insert 0, update 0→12 recorded in actuals_audit)
```

Immutability after narrowing grants (`20261012134000_harden_grants.sql`):

```
owner update frozen team rejected: true
owner update frozen player rejected: true
owner delete frozen team rejected: true
owner status change allowed rows: 1          (only weight-version status may change)
service update frozen team rejected by trigger: true
service update frozen player rejected by trigger: true
stored predicted_base still: 40
```

Supabase security advisor: only the informational note that `ai_cache` has RLS enabled with no policies, which is intentional (server-only table).

## 3. Static checks & build

- `npx tsc --noEmit` — clean
- `npx eslint src tests scripts` — clean
- `npm run build` (Next.js 16.4, Turbopack) — success, 18 routes

## 4. Live integration checks

- **CricketData** (real key, free plan): `currentMatches`, `series` search, `series_info`, `match_info` and `match_squad` all returned `status: success` for India vs West Indies, 4th T20I (`3c451481-…`, Hyderabad, 14 Oct 13:30 GMT). Observed facts the app handles: matchType mislabelled `odi`; the squad is the whole tour (India 28, West Indies 22); two players have a null role; the squad costs 10 hits.
- **Gemini**: `models.list` on the provided key showed `gemini-3.8-flash` available. A structured JSON call (`responseJsonSchema`) succeeded, and `thinkingLevel: low` cut a small call to ~4.5 s. End-to-end "Generate reasons" on the demo XI returned validated, evidence-cited reasons (status `fresh`).
- **Open-Meteo**: forecast for Hyderabad at the scheduled start hour returned (30.3 °C, 0% rain at the time of testing).
- **Deployment** `https://matchlab-xi-two.vercel.app`, fetched signed out: `/`, `/build/demo-hh-dd`, `/review`, `/learning`, `/api/health` all returned HTTP 200. `/api/health` reports configuration by name/boolean only.
- **Persistence**: the synthetic demo dataset (9 frozen teams, 99 predictions, 93 actuals, weight v1) is stored in Supabase and rendered by Match Review / Learning Lab after reloads. The Learning Lab detects the seeded pattern ("All-rounders overpredicted by 9.44 pts; same direction in 8 of 8 matches").
