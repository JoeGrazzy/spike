create or replace function private.spike_record_verified_activity(p_user_id uuid, p_event_type text, p_category text, p_source_table text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
begin
  if p_user_id is null or p_event_type is null or p_category is null then return; end if;
  if exists (select 1 from public.profiles p where p.id=p_user_id) then
    insert into private.spike_verified_activity_events(user_id,event_type,category,source_table)
    values(p_user_id,left(p_event_type,120),left(p_category,24),left(p_source_table,64));
  end if;
exception when others then return;
end;
$function$;

create or replace function private.spike_log_verified_user_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare v_actor uuid; v_type text; v_actor_column text;
begin
  v_actor_column := case tg_table_name
    when 'posts' then 'author_id'
    when 'comments' then 'author_id'
    when 'messages' then 'sender_id'
    when 'room_messages' then 'sender_id'
    else 'id' end;
  v_actor := nullif(to_jsonb(new)->>v_actor_column, '')::uuid;
  if v_actor is null then return new; end if;
  v_type := case tg_table_name
    when 'posts' then 'Published a post'
    when 'comments' then 'Posted a comment'
    when 'messages' then 'Sent a direct message'
    when 'room_messages' then 'Sent a room message'
    else 'Account activity' end;
  perform private.spike_record_verified_activity(v_actor,v_type,
    case when tg_table_name in ('posts','comments') then 'content' else 'social' end,
    tg_table_name);
  return new;
exception when others then return new;
end;
$function$;

create or replace function private.spike_log_verified_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
begin
  if new.username is distinct from old.username or new.display_name is distinct from old.display_name or
     new.bio is distinct from old.bio or new.avatar_path is distinct from old.avatar_path or
     new.cover_path is distinct from old.cover_path or new.website is distinct from old.website or
     new.location is distinct from old.location then
    perform private.spike_record_verified_activity(new.id,'Updated profile','profile','profiles');
  end if;
  return new;
end;
$function$;
