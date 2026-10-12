-- Single-owner workspace checks (current model). Always rolls back; the exception message is the report.
-- Expected: anon/authenticated can READ workspace rows but every INSERT/UPDATE/DELETE is blocked;
-- the server (service role) can write; frozen predictions stay immutable even for the server.
do $$
declare wv uuid; t uuid; tp uuid; n int; report text := ''; ok boolean;
begin
  insert into public.weight_versions (owner_id, is_demo, version, weights, role_multipliers, status, origin)
  values (null, false, 99, '{"form":0.45,"opportunity":0.25,"venue":0.2,"matchup":0.1}', '{"WK":1,"BAT":1,"AR":1,"BOWL":1}', 'proposed', 'default') returning id into wv;
  insert into public.teams (owner_id, is_demo, match_id, match_label, match_snapshot, rule_id, rule_version, rules, weight_version_id, weight_version, weights_snapshot, forecast_version, captain_key, vice_captain_key, status, predicted_total, evidence_snapshot)
  values (null, false, 'm-rls', 'RLS test', '{}', 'r', 'v', '{}', wv, 99, '{}', 'f1', 'p1', 'p2', 'valid_provisional', 100, '{}') returning id into t;
  insert into public.team_players (team_id, owner_id, is_demo, player_key, name, real_team, role, credits, lineup, predicted_base, ranking_score, coverage, uncertainty, factors, role_multiplier, multiplier)
  values (t, null, false, 'p1', 'P One', 'A', 'BAT', 9, 'squad', 40, 38, 0.5, 20, '{}', 1, 2) returning id into tp;
  insert into public.actuals (team_player_id, team_id, owner_id, is_demo, actual_base) values (tp, t, null, false, 0);
  report := report || 'server write workspace team+actual(0): ok; ';
  for i in 1..2 loop
    if i = 1 then perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
    else perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true); set local role authenticated; end if;
    select count(*) into n from public.teams where id = t;
    report := report || (case when i=1 then 'anon' else 'authed' end) || ' reads workspace team: ' || n || '; ';
    ok := false; begin insert into public.actuals (team_player_id, team_id, owner_id, is_demo, actual_base) values (tp, t, null, false, 5); exception when others then ok := true; end;
    report := report || 'insert actual blocked: ' || ok || '; ';
    ok := false; begin update public.actuals set actual_base = 99 where team_player_id = tp; exception when others then ok := true; end;
    report := report || 'update actual blocked: ' || ok || '; ';
    ok := false; begin delete from public.teams where id = t; exception when others then ok := true; end;
    report := report || 'delete team blocked: ' || ok || '; ';
    ok := false; begin insert into public.contest_inputs (owner_id, is_demo, match_id, players, rule_id) values (null, false, 'x', '[]', 'r'); exception when others then ok := true; end;
    report := report || 'insert contest blocked: ' || ok || '; ';
    ok := false; begin update public.weight_versions set status = 'active' where id = wv; exception when others then ok := true; end;
    report := report || 'update weights blocked: ' || ok || '; ';
    reset role;
  end loop;
  ok := false; begin update public.team_players set predicted_base = 1 where id = tp; exception when others then ok := true; end;
  report := report || 'server edit frozen prediction blocked: ' || ok || '; ';
  select actual_base::int into n from public.actuals where team_player_id = tp;
  report := report || 'actual still: ' || n;
  raise exception 'WORKSPACE_REPORT %', report;
end $$;
