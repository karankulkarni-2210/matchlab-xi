import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { applyContestCsv } from "@/lib/domain/contestCsv";
import { makePool, TEAM_A, TEAM_B } from "./fixtures";

// Server modules read env at import time: configure a Flash model and no Supabase (memory caches only).
beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-test-flash";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.SUPABASE_SECRET_KEY = "";
});
afterEach(() => vi.unstubAllGlobals());

const geminiReply = (text: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status }));

const Schema = z.object({ verdict: z.string().max(40), playerKey: z.string() });
const validate = (allowed: string[]) => (raw: unknown) => {
  const p = Schema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  if (!allowed.includes(p.data.playerKey)) return { ok: false as const, error: `unknown key ${p.data.playerKey}` };
  return { ok: true as const, value: p.data };
};

describe("Gemini output handling", () => {
  it("rejects non-JSON and schema-violating output instead of using it", async () => {
    const { geminiJson } = await import("@/lib/ai/gemini");
    vi.stubGlobal("fetch", geminiReply("Sure! Here is my answer: captain Kohli"));
    const a = await geminiJson({ kind: "t1", evidence: { n: 1 }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) });
    expect(a.status).toBe("invalid");
    expect(a.output).toBeNull();

    vi.stubGlobal("fetch", geminiReply(JSON.stringify({ verdict: "pick", playerKey: "invented-player" })));
    const b = await geminiJson({ kind: "t1", evidence: { n: 2 }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) });
    expect(b.status).toBe("invalid");
    expect(b.error).toMatch(/unknown key/);
  });

  it("caches valid output by evidence hash and labels it cached (not fresh) on reuse", async () => {
    const { geminiJson } = await import("@/lib/ai/gemini");
    const f = geminiReply(JSON.stringify({ verdict: "pick", playerKey: "p1" }));
    vi.stubGlobal("fetch", f);
    const args = { kind: "t2", evidence: { match: "x" }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) };
    const first = await geminiJson(args);
    expect(first.status).toBe("fresh");
    const second = await geminiJson(args);
    expect(second.status).toBe("cached");
    expect(f).toHaveBeenCalledTimes(1);
    // different evidence => different key => new call
    await geminiJson({ ...args, evidence: { match: "y" } });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("on 429 returns rate_limited, or the cached result clearly marked as cached", async () => {
    const { geminiJson } = await import("@/lib/ai/gemini");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const none = await geminiJson({ kind: "t3", evidence: { z: 1 }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) });
    expect(none.status).toBe("rate_limited");
    expect(none.output).toBeNull();

    vi.stubGlobal("fetch", geminiReply(JSON.stringify({ verdict: "pick", playerKey: "p1" })));
    await geminiJson({ kind: "t4", evidence: { z: 2 }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const regen = await geminiJson({ kind: "t4", evidence: { z: 2 }, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]), regenerate: true });
    expect(regen.status).toBe("cached");
    expect(regen.error).toMatch(/rate_limited/);
  });

  it("refuses to run a non-Flash model", async () => {
    vi.resetModules();
    process.env.GEMINI_MODEL = "gemini-pro-large";
    const { geminiJson } = await import("@/lib/ai/gemini");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await geminiJson({ kind: "t5", evidence: {}, system: "s", prompt: "p", responseSchema: {}, validate: validate(["p1"]) });
    expect(r.status).toBe("disabled");
    expect(f).not.toHaveBeenCalled();
    process.env.GEMINI_MODEL = "gemini-test-flash";
    vi.resetModules();
  });
});

describe("provider cache freshness", () => {
  it("serves the last good snapshot as STALE (with the error) when a refresh fails", async () => {
    const { cachedFetch, ProviderError } = await import("@/lib/providers/cache");
    const good = await cachedFetch("k-stale", "TestProvider", 60, async () => ({ v: 1 }));
    expect(good.status).toBe("fresh");
    const hit = await cachedFetch("k-stale", "TestProvider", 60, async () => ({ v: 2 }));
    expect(hit.status).toBe("cached");
    expect(hit.data).toEqual({ v: 1 });
    const stale = await cachedFetch(
      "k-stale",
      "TestProvider",
      60,
      async () => {
        throw new ProviderError("hits today exceeded", "quota");
      },
      { forceRefresh: true },
    );
    expect(stale.status).toBe("stale");
    expect(stale.data).toEqual({ v: 1 });
    expect(stale.error).toMatch(/exceeded/);
  });

  it("throws (no invented data) when nothing was ever cached", async () => {
    const { cachedFetch } = await import("@/lib/providers/cache");
    await expect(
      cachedFetch("k-never", "TestProvider", 60, async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow(/network down/);
  });

  it("infers T20 format when the provider mislabels it", async () => {
    const { inferFormat } = await import("@/lib/providers/cricketdata");
    const r = inferFormat({ name: "India vs West Indies, 4th T20I, West Indies tour of India", matchType: "odi" });
    expect(r.format).toBe("T20");
    expect(r.note).toMatch(/odi/);
  });
});

describe("contest CSV import", () => {
  it("applies credits/roles/lineups by name and reports row errors without saving bad rows", () => {
    const pool = makePool({ A1: { credits: null } });
    const csv = [
      "name,team,role,credits,lineup",
      `${pool[0].name},${TEAM_A},WK,8.5,xi`,
      `${pool[1].name},${TEAM_A},XX,8,xi`,
      `${pool[2].name},${TEAM_A},BAT,8.3,out`,
      `New Guy,${TEAM_B},BOWL,7,squad`,
      `Ghost,Zeta,BAT,7,xi`,
    ].join("\n");
    const r = applyContestCsv(csv, pool, [TEAM_A, TEAM_B]);
    expect(r.players.find((p) => p.key === "A1")!.credits).toBe(8.5);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 6]);
    expect(r.errors[0].message).toMatch(/Invalid role/);
    expect(r.errors[1].message).toMatch(/Invalid credits/);
    expect(r.errors[2].message).toMatch(/Unknown team/);
    expect(r.added).toBe(1);
    expect(r.players.find((p) => p.name === "New Guy")!.credits).toBe(7);
  });

  it("requires name and credits columns", () => {
    const r = applyContestCsv("player,cost\nA,9", makePool(), [TEAM_A, TEAM_B]);
    expect(r.errors[0].message).toMatch(/name/);
  });
});
