import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactorWeights, RoleMultipliers } from "@/lib/domain/types";
import { DEFAULT_ROLE_MULTIPLIERS, DEFAULT_WEIGHTS } from "@/lib/domain/weights";
import { currentUser, supabaseAdmin, supabasePublic, supabaseUser } from "@/lib/supabase/server";

/**
 * Data scope for a request.
 *  - demo:  isolated synthetic dataset; reads via public client, writes via service role restricted to is_demo rows.
 *  - owner: signed-in user; every read/write goes through the user-scoped client so RLS applies.
 *  - guest: signed-out visitor on a real match: read-only, nothing persisted.
 */
export type Scope =
  | { kind: "demo"; userId: string | null }
  | { kind: "owner"; userId: string }
  | { kind: "guest"; userId: null };

export async function resolveScope(dataset: "demo" | "real"): Promise<Scope> {
  const user = await currentUser();
  if (dataset === "demo") return { kind: "demo", userId: user?.id ?? null };
  return user ? { kind: "owner", userId: user.id } : { kind: "guest", userId: null };
}

/** Client for reads in this scope. */
export async function readClient(scope: Scope): Promise<SupabaseClient> {
  return scope.kind === "owner" ? supabaseUser() : supabasePublic();
}

/** Client for writes in this scope, or an explanation why writing is not allowed. */
export async function writeClient(scope: Scope): Promise<{ client: SupabaseClient } | { error: string; status: number }> {
  if (scope.kind === "owner") return { client: await supabaseUser() };
  if (scope.kind === "demo") {
    const admin = supabaseAdmin();
    if (!admin) return { error: "Demo sandbox writes need SUPABASE_SECRET_KEY on the server.", status: 503 };
    return { client: admin };
  }
  return { error: "Sign in to save. Signed-out visitors can explore and edit the labelled demo.", status: 401 };
}

export const scopeFilter = (scope: Scope) =>
  scope.kind === "owner" ? { is_demo: false, owner_id: scope.userId } : { is_demo: true, owner_id: null };

export interface ActiveWeights {
  id: string | null;
  version: number;
  weights: FactorWeights;
  roleMultipliers: RoleMultipliers;
}

/** Active weight version for the scope. Owners get a v1 row created on first use. */
export async function getActiveWeights(scope: Scope): Promise<ActiveWeights> {
  const fallback: ActiveWeights = { id: null, version: 1, weights: DEFAULT_WEIGHTS, roleMultipliers: DEFAULT_ROLE_MULTIPLIERS };
  if (scope.kind === "guest") return fallback;
  const sb = await readClient(scope);
  let q = sb.from("weight_versions").select("id, version, weights, role_multipliers").eq("status", "active");
  q = scope.kind === "owner" ? q.eq("is_demo", false).eq("owner_id", scope.userId) : q.eq("is_demo", true);
  const { data } = await q.maybeSingle();
  if (data) return { id: data.id, version: data.version, weights: data.weights, roleMultipliers: data.role_multipliers };
  if (scope.kind === "owner") {
    const { data: created } = await (await supabaseUser())
      .from("weight_versions")
      .insert({
        owner_id: scope.userId,
        is_demo: false,
        version: 1,
        weights: DEFAULT_WEIGHTS,
        role_multipliers: DEFAULT_ROLE_MULTIPLIERS,
        status: "active",
        origin: "default",
        rationale: "System default weights (v1).",
      })
      .select("id, version")
      .single();
    if (created) return { ...fallback, id: created.id, version: created.version };
  }
  return fallback;
}
