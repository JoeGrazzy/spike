-- Keep collaborative Room features live across multiple connected members.
do $migration$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_poll_votes') then
    alter publication supabase_realtime add table public.room_poll_votes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_message_pins') then
    alter publication supabase_realtime add table public.room_message_pins;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_settings') then
    alter publication supabase_realtime add table public.room_settings;
  end if;
end
$migration$;
