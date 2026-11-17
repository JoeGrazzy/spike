-- SPIKE room owner customization settings. Safe additive migration.
alter table public.spike_rooms
  add column if not exists appearance jsonb not null default '{}'::jsonb;

create or replace function public.spike_room_update_appearance(p_room_id uuid, p_appearance jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_clean jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.spike_require_verified_room_access(v_uid);
  if jsonb_typeof(coalesce(p_appearance, '{}'::jsonb)) <> 'object' then raise exception 'Room appearance must be an object'; end if;
  if octet_length(coalesce(p_appearance, '{}'::jsonb)::text) > 4000 then raise exception 'Room appearance settings are too large'; end if;
  if not exists (select 1 from public.spike_rooms where id=p_room_id and active_host_id=v_uid and status in ('live','scheduled') for update) then raise exception 'Only the active room host can customize this room'; end if;
  v_clean := jsonb_build_object(
    'theme', case when p_appearance->>'theme' in ('midnight','violet','ocean','ember','forest') then p_appearance->>'theme' else 'midnight' end,
    'accent', case when p_appearance->>'accent' ~ '^#[0-9A-Fa-f]{6}$' then upper(p_appearance->>'accent') else '#A855F7' end,
    'bubble_style', case when p_appearance->>'bubble_style' in ('soft','solid','glass') then p_appearance->>'bubble_style' else 'soft' end,
    'welcome_message', left(coalesce(p_appearance->>'welcome_message',''),160));
  update public.spike_rooms set appearance=v_clean,updated_at=now() where id=p_room_id;
  return jsonb_build_object('ok',true,'appearance',v_clean);
end;
$function$;
revoke all on function public.spike_room_update_appearance(uuid,jsonb) from public, anon;
grant execute on function public.spike_room_update_appearance(uuid,jsonb) to authenticated;
