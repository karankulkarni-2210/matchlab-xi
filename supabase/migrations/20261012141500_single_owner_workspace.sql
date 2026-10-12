-- Single-owner workspace (no sign-in, by product decision: the app is built for one user, Aryan).
--   * Aryan's workspace rows: is_demo = false, owner_id IS NULL.
--   * Demo rows:              is_demo = true,  owner_id IS NULL (unchanged, still labelled synthetic).
-- The public (publishable) key can only READ. Every write goes through the Next.js server, which
-- validates input and uses the service role. Immutability triggers and the audit trail still apply.

alter table public.weight_versions drop constraint weight_versions_scope;
alter table public.weight_decisions drop constraint weight_decisions_scope;
alter table public.contest_inputs drop constraint contest_inputs_scope;
alter table public.teams drop constraint teams_scope;
alter table public.weight_versions add constraint weight_versions_scope check (not is_demo or owner_id is null);
alter table public.weight_decisions add constraint weight_decisions_scope check (not is_demo or owner_id is null);
alter table public.contest_inputs add constraint contest_inputs_scope check (not is_demo or owner_id is null);
alter table public.teams add constraint teams_scope check (not is_demo or owner_id is null);

-- uniqueness for the workspace (owner_id is null, so the per-owner indexes do not apply)
create unique index contest_inputs_workspace_match on public.contest_inputs (match_id) where not is_demo and owner_id is null;
create unique index weight_versions_one_active_workspace on public.weight_versions ((1)) where status = 'active' and not is_demo and owner_id is null;
create unique index weight_versions_version_workspace on public.weight_versions (version) where not is_demo and owner_id is null;

-- reads: demo + workspace rows are public (owner-scoped rows, if any, stay private)
do $$
declare t text;
begin
  foreach t in array array['weight_versions','weight_decisions','contest_inputs','teams','team_players','actuals','actuals_audit'] loop
    execute format('drop policy if exists "read demo or own" on public.%I', t);
    execute format('create policy "read demo, workspace or own" on public.%I for select to anon, authenticated using (owner_id is null or owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- writes: server only (service role). Remove client write grants entirely.
revoke insert, update, delete on public.weight_versions, public.weight_decisions, public.contest_inputs,
  public.teams, public.team_players, public.actuals from anon, authenticated;
