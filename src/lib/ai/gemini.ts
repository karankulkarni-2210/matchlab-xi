import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Gemini Flash JSON calls. Only sourced evidence and validated IDs go in; output is schema-checked
 * before use. Results are cached by a hash of (kind, model, prompt version, evidence). Cached output is
 * always labelled as cached — never presented as a fresh generation.
 */
export const PROMPT_VERSION = "p1";

export type AiStatus = "fresh" | "cached" | "rate_limited" | "unavailable" | "invalid" | "disabled";

export interface AiResult<T> {
  status: AiStatus;
  output: T | null;
  model: string;
  generatedAt: string | null;
  error?: string;
  cacheKey: string;
}

const memory = new Map<string, { output: unknown; createdAt: string; model: string }>();
const calls: number[] = [];
const MAX_CALLS_PER_MINUTE = 8;

export function aiCacheKey(kind: string, parts: unknown) {
  return createHash("sha256")
    .update(`${kind}|${env.geminiModel}|${PROMPT_VERSION}|${JSON.stringify(parts)}`)
    .digest("hex")
    .slice(0, 40);
}

async function readCache(key: string) {
  const m = memory.get(key);
  if (m) return m;
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from("ai_cache").select("output, created_at, model").eq("key", key).maybeSingle();
  if (!data) return null;
  const v = { output: data.output as unknown, createdAt: data.created_at as string, model: data.model as string };
  memory.set(key, v);
  return v;
}

async function writeCache(key: string, kind: string, output: unknown) {
  const createdAt = new Date().toISOString();
  memory.set(key, { output, createdAt, model: env.geminiModel });
  const admin = supabaseAdmin();
  if (admin) await admin.from("ai_cache").upsert({ key, kind, model: env.geminiModel, output, created_at: createdAt }).then(() => undefined, () => undefined);
  return createdAt;
}

export async function geminiJson<T>(opts: {
  kind: string;
  evidence: unknown; // everything the model sees; also the cache key
  system: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  validate: (raw: unknown) => { ok: true; value: T } | { ok: false; error: string };
  regenerate?: boolean;
  timeoutMs?: number;
}): Promise<AiResult<T>> {
  const key = aiCacheKey(opts.kind, opts.evidence);
  const model = env.geminiModel;
  const cached = await readCache(key);
  if (cached && !opts.regenerate) {
    const v = opts.validate(cached.output);
    if (v.ok) return { status: "cached", output: v.value, model: cached.model, generatedAt: cached.createdAt, cacheKey: key };
  }
  const fallbackCached = (status: AiStatus, error: string): AiResult<T> => {
    if (cached) {
      const v = opts.validate(cached.output);
      if (v.ok) return { status: "cached", output: v.value, model: cached.model, generatedAt: cached.createdAt, error: `${status}: ${error}`, cacheKey: key };
    }
    return { status, output: null, model, generatedAt: null, error, cacheKey: key };
  };

  if (!env.geminiApiKey) return fallbackCached("disabled", "GEMINI_API_KEY not configured");
  if (!/flash/i.test(model)) return fallbackCached("disabled", `GEMINI_MODEL "${model}" is not a Flash model`);

  const now = Date.now();
  while (calls.length && now - calls[0] > 60000) calls.shift();
  if (calls.length >= MAX_CALLS_PER_MINUTE) return fallbackCached("rate_limited", "Local generation limit reached (8/min). Try again shortly.");
  calls.push(now);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: opts.responseSchema,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
      cache: "no-store",
    });
    if (res.status === 429) return fallbackCached("rate_limited", "Gemini rate limit (429). Showing cached output if available.");
    if (!res.ok) return fallbackCached("unavailable", `Gemini HTTP ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fallbackCached("invalid", `Model returned non-JSON output (finish: ${body.candidates?.[0]?.finishReason ?? "?"})`);
    }
    const v = opts.validate(raw);
    if (!v.ok) return fallbackCached("invalid", `Output failed validation: ${v.error}`);
    const generatedAt = await writeCache(key, opts.kind, v.value);
    return { status: "fresh", output: v.value, model, generatedAt, cacheKey: key };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "Gemini request timed out" : (e as Error).message;
    return fallbackCached("unavailable", msg);
  } finally {
    clearTimeout(timer);
  }
}
