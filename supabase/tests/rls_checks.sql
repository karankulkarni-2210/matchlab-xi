-- RLS / immutability verification. Runs entirely inside one transaction and ALWAYS rolls back
-- (the final RAISE aborts it), so no users or rows persist. The exception message is the report.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  wv uuid;
  t uuid;
  tp uuid;
  n int;
  report text := '';
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@matchlab.test', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@matchlab.test', now(), now());

  -- ---------------- act as owner A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.weight_versions (owner_id, is_demo, version, weights, role_multipliers, status, origin)
  values (a, false, 1, '{"form":0.45,"opportunity":0.25,"venue":0.2,"matchup":0.1}', '{"WK":1,"BAT":1,"AR":1,"BOWL":1}', 'active', 'default')
  returning id into wv;
  insert into public.teams (owner_id, is_demo, match_id, match_label, match_snapshot, rule_id, rule_version, rules, weight_version_id, weight_version, weights_snapshot, forecast_version, captain_key, vice_captain_key, status, predicted_total, evidence_snapshot)
  values (a, false, 'm1', 'A v B', '{}', 'r', 'v', '{}', wv, 1, '{}', 'f1', 'p1', 'p2', 'valid_provisional', 100, '{}')
  returning id into t;
  insert into public.team_players (team_id, owner_id, is_demo, player_key, name, real_team, role, credits, lineup, predicted_base, ranking_score, coverage, uncertainty, factors, role_multiplier, multiplier)
  values (t, a, false, 'p1', 'P One', 'A', 'BAT', 9, 'squad', 40, 38, 0.5, 20, '{}', 1, 2)
  returning id into tp;
  insert into public.actuals (team_player_id, team_id, owner_id, is_demo, actual_base) values (tp, t, a, false, 0);
  report := report || 'A owner insert team+player+actual(0): ok; ';

  -- A cannot edit a frozen prediction
  ok := false;
  begin update public.teams set predicted_total = 1 where id = t; exception when others then ok := true; end;
  report := report || 'A update frozen team blocked: ' || ok || '; ';
  ok := false;
  begin update public.team_players set predicted_base = 1 where id = tp; exception when others then ok := true; end;
  report := report || 'A update frozen player blocked: ' || ok || '; ';
  ok := false;
  begin update public.weight_versions set weights = '{"form":1}' where id = wv; exception when others then ok := true; end;
  report := report || 'A edit weight contents blocked: ' || ok || '; ';

  -- A can correct an actual; audit records it
  update public.actuals set actual_base = 12 where team_player_id = tp;
  -- A cannot create demo or synthetic rows
  ok := false;
  begin
    insert into public.teams (owner_id, is_demo, is_synthetic, match_id, match_label, match_snapshot, rule_id, rule_version, rules, weight_version_id, weight_version, weights_snapshot, forecast_version, captain_key, vice_captain_key, status, predicted_total, evidence_snapshot)
    values (null, true, true, 'x', 'x', '{}', 'r', 'v', '{}', wv, 1, '{}', 'f1', 'p1', 'p2', 'ready', 1, '{}');
  exception when others then ok := true; end;
  report := report || 'A insert demo team blocked: ' || ok || '; ';
  reset role;

  -- ---------------- act as user B (attacker)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.teams where id = t;
  report := report || 'B sees A team rows: ' || n || '; ';
  ok := false;
  begin
    insert into public.actuals (team_player_id, team_id, owner_id, is_demo, actual_base) values (tp, t, b, false, 99);
  exception when others then ok := true; end;
  report := report || 'B insert actual on A team blocked: ' || ok || '; ';
  update public.actuals set actual_base = 99 where team_player_id = tp;
  get diagnostics n = row_count;
  report := report || 'B update A actual rows affected: ' || n || '; ';
  delete from public.actuals where team_player_id = tp;
  get diagnostics n = row_count;
  report := report || 'B delete A actual rows affected: ' || n || '; ';
  ok := false;
  begin
    insert into public.team_players (team_id, owner_id, is_demo, player_key, name, real_team, role, credits, lineup, predicted_base, ranking_score, coverage, uncertainty, factors, role_multiplier, multiplier)
    values (t, b, false, 'p9', 'Intruder', 'A', 'BAT', 9, 'squad', 40, 38, 0.5, 20, '{}', 1, 1);
  exception when others then ok := true; end;
  report := report || 'B add player to A team blocked: ' || ok || '; ';
  update public.weight_versions set status = 'rejected' where id = wv;
  get diagnostics n = row_count;
  report := report || 'B change A weight status rows affected: ' || n || '; ';
  reset role;

  -- ---------------- anonymous visitor
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.teams where owner_id = a;
  report := report || 'anon sees owner rows: ' || n || '; ';
  ok := false;
  begin
    insert into public.weight_decisions (owner_id, is_demo, decision, version_id) values (null, true, 'accept', wv);
  exception when others then ok := true; end;
  report := report || 'anon write decision blocked: ' || ok || '; ';
  ok := false;
  begin
    insert into public.provider_cache (key, provider, payload, ok) values ('x', 'x', '{}', true);
  exception when others then ok := true; end;
  report := report || 'anon write provider cache blocked: ' || ok || '; ';
  reset role;

  -- actual stored separately and audited; value stayed A's corrected 12
  select actual_base::int into n from public.actuals where team_player_id = tp;
  report := report || 'A actual after attacks: ' || n || '; ';
  select count(*) into n from public.actuals_audit where team_player_id = tp;
  report := report || 'audit rows: ' || n;

  raise exception 'RLS_REPORT % ', report;
end $$;

-- Second script (immutability incl. privileged role) — see docs/TEST_RESULTS.md for the recorded output.
-- Run with the Supabase SQL editor or MCP execute_sql; it also always rolls back.
