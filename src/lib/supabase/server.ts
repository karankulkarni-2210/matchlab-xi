import "server-only";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | null = null;
/**
 * Service-role client. Used ONLY for: provider/AI caches and the isolated demo sandbox
 * (rows with is_demo = true) and Aryan's single-user workspace (owner_id null). Callers pass explicit scope filters. Returns null if not configured.
 */
export function supabaseAdmin(): SupabaseClient | null {
  if (!env.supabaseSecretKey || !env.supabaseUrl) return null;
  admin ??= createPlainClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Anonymous (publishable key) client without cookies, for public reads in cached contexts. */
export function supabasePublic(): SupabaseClient {
  return createPlainClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
