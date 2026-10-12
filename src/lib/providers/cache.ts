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
  fetcher: () => Promise<T>,
  opts: { forceRefresh?: boolean } = {},
): Promise<Sourced<T>> {
  const row = await readRow(key);
  const age = row ? (Date.now() - new Date(row.fetchedAt).getTime()) / 1000 : Infinity;
  if (row && age < ttlSeconds && !opts.forceRefresh) {
    return { data: row.payload as T, fetchedAt: row.fetchedAt, provider, status: "cached" };
  }
  try {
    const data = await fetcher();
    const fetchedAt = new Date().toISOString();
    await writeRow(key, provider, data, fetchedAt);
    return { data, fetchedAt, provider, status: "fresh" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (row) return { data: row.payload as T, fetchedAt: row.fetchedAt, provider, status: "stale", error: msg };
    throw e instanceof ProviderError ? e : new ProviderError(msg);
  }
}

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status === 429 ? "quota" : "http");
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error).name === "AbortError") throw new ProviderError("Request timed out", "timeout");
    throw new ProviderError((e as Error).message);
  } finally {
    clearTimeout(t);
  }
}
