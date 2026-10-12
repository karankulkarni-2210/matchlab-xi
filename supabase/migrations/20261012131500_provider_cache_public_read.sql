-- Provider snapshots are public match data (no secrets): anyone may read them; only the server writes.
create policy "public read provider snapshots" on public.provider_cache for select to anon, authenticated using (true);
grant select on public.provider_cache to anon, authenticated;
