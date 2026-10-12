-- MatchLab XI core schema.
-- Ownership model:
--   * Owner records: is_demo = false, owner_id = auth.uid(). Only the owner can read/write (RLS).
--   * Demo records:  is_demo = true, owner_id IS NULL. Readable by everyone, writable only by the
--     server (service role) after explicit is_demo checks. Demo is a labelled, resettable sandbox.
-- Frozen predictions (teams, team_players) are immutable once inserted (trigger-enforced).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- weight versions
create table public.weight_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  version integer not null check (version >= 1),
  weights jsonb not null,
  role_multipliers jsonb not null,
  status text not null check (status in ('active', 'proposed', 'rejected', 'superseded')),
  origin text not null check (origin in ('default', 'proposal')),
  parent_id uuid references public.weight_versions (id),
  rationale text,
  evidence jsonb,
  ai jsonb,
  backtest jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint weight_versions_scope check ((is_demo and owner_id is null) or (not is_demo and owner_id is not null))
);
create unique index weight_versions_one_active_owner on public.weight_versions (owner_id) where status = 'active' and not is_demo;
create unique index weight_versions_one_active_demo on public.weight_versions (is_demo) where status = 'active' and is_demo;
create unique index weight_versions_version_owner on public.weight_versions (owner_id, version) where not is_demo;
create unique index weight_versions_version_demo on public.weight_versions (version) where is_demo;

create table public.weight_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  decision text not null check (decision in ('accept', 'reject', 'rollback')),
  version_id uuid not null references public.weight_versions (id) on delete cascade,
  previous_active_id uuid references public.weight_versions (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  constraint weight_decisions_scope check ((is_demo and owner_id is null) or (not is_demo and owner_id is not null))
);

-- ---------------------------------------------------------------- contest inputs (credits, roles, lineups)
create table public.contest_inputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  match_id text not null,
  players jsonb not null,
  rule_id text not null,
  rules_confirmed_at timestamptz,
  lineups_confirmed jsonb not null default '{"teamA": false, "teamB": false}'::jsonb,
  source_label text not null default '',
  source_as_of timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contest_inputs_scope check ((is_demo and owner_id is null) or (not is_demo and owner_id is not null))
);
create unique index contest_inputs_owner_match on public.contest_inputs (owner_id, match_id) where not is_demo;
create unique index contest_inputs_demo_match on public.contest_inputs (match_id) where is_demo;

-- ---------------------------------------------------------------- frozen teams (predictions)
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  is_synthetic boolean not null default false,
  match_id text not null,
  match_label text not null,
  match_start timestamptz,
  match_snapshot jsonb not null,
  rule_id text not null,
  rule_version text not null,
  rules jsonb not null,
  weight_version_id uuid not null references public.weight_versions (id),
  weight_version integer not null,
  weights_snapshot jsonb not null,
  forecast_version text not null,
  captain_key text not null,
  vice_captain_key text not null,
  status text not null check (status in ('ready', 'valid_provisional')),
  predicted_total numeric not null,
  evidence_snapshot jsonb not null,
  explanation jsonb,
  created_at timestamptz not null default now(),
  constraint teams_c_vc_distinct check (captain_key <> vice_captain_key),
  constraint teams_scope check ((is_demo and owner_id is null) or (not is_demo and owner_id is not null)),
  constraint teams_synthetic_demo_only check (not is_synthetic or is_demo)
);
create index teams_owner_idx on public.teams (owner_id, created_at desc);
create index teams_demo_idx on public.teams (is_demo, created_at desc);

create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  player_key text not null,
  name text not null,
  real_team text not null,
  role text not null check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  credits numeric not null,
  lineup text not null,
  predicted_base numeric not null,
  ranking_score numeric not null,
  coverage numeric not null check (coverage between 0 and 1),
  uncertainty numeric not null,
  factors jsonb not null,
  role_multiplier numeric not null,
  multiplier numeric not null check (multiplier in (1, 1.5, 2)),
  unique (team_id, player_key)
);
create index team_players_team_idx on public.team_players (team_id);

-- ---------------------------------------------------------------- actual points (entered after the match)
create table public.actuals (
  id uuid primary key default gen_random_uuid(),
  team_player_id uuid not null unique references public.team_players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  actual_base numeric not null check (actual_base between -100 and 600),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index actuals_team_idx on public.actuals (team_id);

-- ---------------------------------------------------------------- server-only caches
create table public.provider_cache (
  key text primary key,
  provider text not null,
  payload jsonb,
  ok boolean not null,
  error text,
  fetched_at timestamptz not null default now()
);
create table public.ai_cache (
  key text primary key,
  kind text not null,
  model text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- immutability
create or replace function public.forbid_update_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Frozen prediction records are immutable (table %)', tg_table_name using errcode = 'P0001';
end $$;

create trigger teams_immutable before update on public.teams
  for each row execute function public.forbid_update_frozen();
create trigger team_players_immutable before update on public.team_players
  for each row execute function public.forbid_update_frozen();

create or replace function public.guard_weight_version_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.weights is distinct from old.weights
     or new.role_multipliers is distinct from old.role_multipliers
     or new.version is distinct from old.version
     or new.owner_id is distinct from old.owner_id
     or new.is_demo is distinct from old.is_demo then
    raise exception 'Weight version contents are immutable; create a new version instead' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger weight_versions_guard before update on public.weight_versions
  for each row execute function public.guard_weight_version_update();

-- actuals must belong to the same owner/demo scope as their team, and the team player must be in that team
create or replace function public.check_actual_scope() returns trigger
language plpgsql set search_path = '' as $$
declare t record; tp record;
begin
  select owner_id, is_demo into t from public.teams where id = new.team_id;
  select team_id into tp from public.team_players where id = new.team_player_id;
  if t is null or tp is null or tp.team_id <> new.team_id then
    raise exception 'Actual does not match a selected player of this team' using errcode = 'P0001';
  end if;
  if t.is_demo is distinct from new.is_demo or t.owner_id is distinct from new.owner_id then
    raise exception 'Actual scope does not match team scope' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger actuals_scope before insert or update on public.actuals
  for each row execute function public.check_actual_scope();

-- ---------------------------------------------------------------- row level security
alter table public.weight_versions enable row level security;
alter table public.weight_decisions enable row level security;
alter table public.contest_inputs enable row level security;
alter table public.teams enable row level security;
alter table public.team_players enable row level security;
alter table public.actuals enable row level security;
alter table public.provider_cache enable row level security;
alter table public.ai_cache enable row level security;
-- provider_cache / ai_cache: no policies => only the service role (server) can touch them.

-- read: demo rows for everyone, owner rows for the owner
create policy "read demo or own" on public.weight_versions for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
create policy "read demo or own" on public.weight_decisions for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
create policy "read demo or own" on public.contest_inputs for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
create policy "read demo or own" on public.teams for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
create policy "read demo or own" on public.team_players for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
create policy "read demo or own" on public.actuals for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));

-- write: owners only, never demo rows
create policy "owner inserts" on public.weight_versions for insert to authenticated
  with check (not is_demo and owner_id = (select auth.uid()));
create policy "owner updates status" on public.weight_versions for update to authenticated
  using (not is_demo and owner_id = (select auth.uid()))
  with check (not is_demo and owner_id = (select auth.uid()));

create policy "owner inserts" on public.weight_decisions for insert to authenticated
  with check (not is_demo and owner_id = (select auth.uid())
    and exists (select 1 from public.weight_versions v where v.id = version_id and v.owner_id = (select auth.uid())));

create policy "owner inserts" on public.contest_inputs for insert to authenticated
  with check (not is_demo and owner_id = (select auth.uid()));
create policy "owner updates" on public.contest_inputs for update to authenticated
  using (not is_demo and owner_id = (select auth.uid()))
  with check (not is_demo and owner_id = (select auth.uid()));
create policy "owner deletes" on public.contest_inputs for delete to authenticated
  using (not is_demo and owner_id = (select auth.uid()));

create policy "owner inserts" on public.teams for insert to authenticated
  with check (not is_demo and not is_synthetic and owner_id = (select auth.uid())
    and exists (select 1 from public.weight_versions v where v.id = weight_version_id and v.owner_id = (select auth.uid())));

create policy "owner inserts" on public.team_players for insert to authenticated
  with check (not is_demo and owner_id = (select auth.uid())
    and exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));

create policy "owner inserts" on public.actuals for insert to authenticated
  with check (not is_demo and owner_id = (select auth.uid())
    and exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));
create policy "owner updates" on public.actuals for update to authenticated
  using (not is_demo and owner_id = (select auth.uid()))
  with check (not is_demo and owner_id = (select auth.uid()));
create policy "owner deletes" on public.actuals for delete to authenticated
  using (not is_demo and owner_id = (select auth.uid()));

-- grants (RLS still applies)
grant select on public.weight_versions, public.weight_decisions, public.contest_inputs, public.teams,
  public.team_players, public.actuals to anon, authenticated;
grant insert, update on public.weight_versions to authenticated;
grant insert on public.weight_decisions, public.teams, public.team_players to authenticated;
grant insert, update, delete on public.contest_inputs, public.actuals to authenticated;
revoke all on public.provider_cache, public.ai_cache from anon, authenticated;
