import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactorWeights, RoleMultipliers } from "@/lib/domain/types";
import { DEFAULT_ROLE_MULTIPLIERS, DEFAULT_WEIGHTS } from "@/lib/domain/weights";
import { supabaseAdmin, supabasePublic } from "@/lib/supabase/server";

/**
 * Data scope. MatchLab is a single-user app (built for Aryan) with no sign-in:
 *  - workspace: Aryan's real teams, actuals, contest data and weight versions (is_demo = false, owner_id = null)
 *  - demo:      the isolated, labelled synthetic dataset (is_demo = true, owner_id = null)
 * Reads use the publishable key (RLS allows SELECT only). Writes go exclusively through these server
 * routes with the service role, after server-side validation; the database is read-only to the public key.
 */
export type Scope = { kind: "demo" } | { kind: "workspace" };

export function resolveScope(dataset: "demo" | "real"): Scope {
  return dataset === "demo" ? { kind: "demo" } : { kind: "workspace" };
}

export function readClient(): SupabaseClient {
  return supabasePublic();
}

export function writeClient(): { client: SupabaseClient } | { error: string; status: number } {
  const admin = supabaseAdmin();
  if (!admin) return { error: "Saving is disabled: the server has no SUPABASE_SECRET_KEY configured.", status: 503 };
  return { client: admin };
}

export const scopeFilter = (scope: Scope) => ({ is_demo: scope.kind === "demo", owner_id: null });

export interface ActiveWeights {
  id: string | null;
  version: number;
  weights: FactorWeights;
  roleMultipliers: RoleMultipliers;
}

/** Active weight version for the scope. The workspace gets a stored v1 on first use (when writes are possible). */
export async function getActiveWeights(scope: Scope): Promise<ActiveWeights> {
  const fallback: ActiveWeights = { id: null, version: 1, weights: DEFAULT_WEIGHTS, roleMultipliers: DEFAULT_ROLE_MULTIPLIERS };
  const { data } = await readClient()
    .from("weight_versions")
    .select("id, version, weights, role_multipliers")
    .eq("status", "active")
    .eq("is_demo", scope.kind === "demo")
    .is("owner_id", null)
    .maybeSingle();
  if (data) return { id: data.id, version: data.version, weights: data.weights, roleMultipliers: data.role_multipliers };
  if (scope.kind === "workspace") {
    const wc = writeClient();
    if ("client" in wc) {
      const { data: created } = await wc.client
        .from("weight_versions")
        .insert({
          owner_id: null,
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
  }
  return fallback;
}
