-- Audit trail for actual-points edits (insert/update/delete). Readable under the same scope rules; written only by trigger.
create table public.actuals_audit (
  id bigint generated always as identity primary key,
  team_id uuid not null,
  team_player_id uuid not null,
  owner_id uuid,
  is_demo boolean not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_value numeric,
  new_value numeric,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index actuals_audit_team_idx on public.actuals_audit (team_id, changed_at desc);

create or replace function public.audit_actuals() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.actuals_audit (team_id, team_player_id, owner_id, is_demo, action, old_value, new_value, changed_by)
    values (old.team_id, old.team_player_id, old.owner_id, old.is_demo, 'delete', old.actual_base, null, auth.uid());
    return old;
  elsif tg_op = 'UPDATE' then
    if new.actual_base is distinct from old.actual_base then
      insert into public.actuals_audit (team_id, team_player_id, owner_id, is_demo, action, old_value, new_value, changed_by)
      values (new.team_id, new.team_player_id, new.owner_id, new.is_demo, 'update', old.actual_base, new.actual_base, auth.uid());
    end if;
    return new;
  else
    insert into public.actuals_audit (team_id, team_player_id, owner_id, is_demo, action, old_value, new_value, changed_by)
    values (new.team_id, new.team_player_id, new.owner_id, new.is_demo, 'insert', null, new.actual_base, auth.uid());
    return new;
  end if;
end $$;
revoke execute on function public.audit_actuals() from public, anon, authenticated;

create trigger actuals_audit_trg after insert or update or delete on public.actuals
  for each row execute function public.audit_actuals();

alter table public.actuals_audit enable row level security;
create policy "read demo or own" on public.actuals_audit for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
grant select on public.actuals_audit to anon, authenticated;
