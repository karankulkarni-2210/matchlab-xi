import "server-only";
import { supabaseAdmin, supabasePublic } from "@/lib/supabase/server";

export type FreshnessStatus = "fresh" | "cached" | "stale";

export interface Sourced<T> {
  data: T;
  fetchedAt: string;
  provider: string;
  status: FreshnessStatus;
  error?: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: "quota" | "http" | "timeout" | "invalid" | "config" = "http",
  ) {
    super(message);
  }
}

const memory = new Map<string, { payload: unknown; fetchedAt: string }>();

async function readRow(key: string) {
  const mem = memory.get(key);
  try {
    const { data } = await supabasePublic()
      .from("provider_cache")
      .select("payload, fetched_at, ok")
      .eq("key", key)
      .maybeSingle();
    if (data?.ok && data.payload !== null) {
      if (!mem || new Date(data.fetched_at) >= new Date(mem.fetchedAt))
        return { payload: data.payload as unknown, fetchedAt: data.fetched_at as string };
    }
  } catch {
    // DB unavailable: fall back to memory
  }
  return mem ?? null;
}

async function writeRow(key: string, provider: string, payload: unknown, fetchedAt: string) {
  memory.set(key, { payload, fetchedAt });
  const admin = supabaseAdmin();
  if (!admin) return;
  await admin
    .from("provider_cache")
    .upsert({ key, provider, payload, ok: true, error: null, fetched_at: fetchedAt })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Cache-first provider fetch with explicit freshness. A failed refresh never discards the last good
 * snapshot: it is returned with status "stale" and the error, so the UI can say so.
 */
export async function cachedFetch<T>(
  key: string,
  provider: string,
  ttlSeconds: number,
  fetcher: (ctx: { setAsOf: (iso: string | null) => void }) => Promise<T>,
  opts: { forceRefresh?: boolean } = {},
): Promise<Sourced<T>> {
  const row = await readRow(key);
  const age = row ? (Date.now() - new Date(row.fetchedAt).getTime()) / 1000 : Infinity;
  if (row && age < ttlSeconds && !opts.forceRefresh) {
    return { data: row.payload as T, fetchedAt: row.fetchedAt, provider, status: "cached" };
  }
  try {
    let asOf: string | null = null;
    const data = await fetcher({ setAsOf: (iso) => (asOf = iso) });
    // asOf = provider's own Date header (survives Vercel's data cache), else now
    const fetchedAt = asOf && !Number.isNaN(new Date(asOf).getTime()) ? new Date(asOf).toISOString() : new Date().toISOString();
    await writeRow(key, provider, data, fetchedAt);
    const ageS = (Date.now() - new Date(fetchedAt).getTime()) / 1000;
    return { data, fetchedAt, provider, status: ageS > 120 ? "cached" : "fresh" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (row) return { data: row.payload as T, fetchedAt: row.fetchedAt, provider, status: "stale", error: msg };
    throw e instanceof ProviderError ? e : new ProviderError(msg);
  }
}

/**
 * JSON fetch with timeout. With `revalidate`, the response is kept in Next's persistent data cache
 * (shared across serverless instances on Vercel) — a quota guard that works even without DB writes.
 */
export async function fetchJson(url: string, init: { timeoutMs?: number; revalidate?: number; onDate?: (d: string | null) => void } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      ...(init.revalidate ? { next: { revalidate: init.revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status === 429 ? "quota" : "http");
    init.onDate?.(res.headers.get("date"));
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error).name === "AbortError") throw new ProviderError("Request timed out", "timeout");
    throw new ProviderError((e as Error).message);
  } finally {
    clearTimeout(t);
  }
}
