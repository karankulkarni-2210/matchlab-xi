import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** User-scoped client: every query runs under the caller's RLS identity. */
export async function supabaseUser(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component; the proxy refreshes the session instead
        }
      },
    },
  });
}

export async function currentUser() {
  const sb = await supabaseUser();
  const { data } = await sb.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

let admin: SupabaseClient | null = null;
/**
 * Service-role client. Used ONLY for: provider/AI caches and the isolated demo sandbox
 * (rows with is_demo = true). Callers must check scope explicitly. Returns null if not configured.
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
