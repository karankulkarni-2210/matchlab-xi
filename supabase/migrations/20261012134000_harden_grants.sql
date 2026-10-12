-- Defense in depth: table privileges match the RLS intent (Supabase's default grants are broader).
revoke all on public.teams, public.team_players, public.actuals, public.weight_versions, public.weight_decisions,
  public.contest_inputs, public.actuals_audit, public.provider_cache, public.ai_cache from anon, authenticated;
grant select on public.teams, public.team_players, public.actuals, public.weight_versions, public.weight_decisions,
  public.contest_inputs, public.actuals_audit, public.provider_cache to anon, authenticated;
grant insert on public.teams, public.team_players, public.weight_decisions to authenticated;   -- frozen: no update/delete
grant insert, update on public.weight_versions to authenticated;                              -- status changes only (trigger guards contents)
grant insert, update, delete on public.contest_inputs, public.actuals to authenticated;
