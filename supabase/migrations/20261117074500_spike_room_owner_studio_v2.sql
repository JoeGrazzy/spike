-- SPIKE Room Owner Studio v2. Host-only appearance controls for member-facing room presentation.
-- The internal routine is not directly executable by clients; the public wrapper enforces the host check.
create or replace function private.spike_room_update_appearance_internal(p_room_id uuid, p_appearance jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_clean jsonb; v_cover text := '';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.spike_require_verified_room_access(v_uid);
  if jsonb_typeof(coalesce(p_appearance, '{}'::jsonb)) <> 'object' then raise exception 'Room appearance must be an object'; end if;
  if octet_length(coalesce(p_appearance, '{}'::jsonb)::text) > 8000 then raise exception 'Room appearance settings are too large'; end if;
  if not exists(select 1 from public.spike_rooms where id=p_room_id and active_host_id=v_uid and status in ('live','scheduled') for update) then raise exception 'Only the active room host can customize this room'; end if;
  if coalesce(p_appearance->>'cover_url','') ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~:/?@!$&''*+,;=%-]*)?$' then v_cover := left(p_appearance->>'cover_url',500); end if;
  v_clean := jsonb_build_object(
    'theme',case when p_appearance->>'theme' in ('midnight','violet','ocean','ember','forest') then p_appearance->>'theme' else 'midnight' end,
    'accent',case when p_appearance->>'accent' ~ '^#[0-9A-Fa-f]{6}$' then upper(p_appearance->>'accent') else '#A855F7' end,
    'bubble_style',case when p_appearance->>'bubble_style' in ('soft','solid','glass') then p_appearance->>'bubble_style' else 'soft' end,
    'welcome_message',left(coalesce(p_appearance->>'welcome_message',''),160),
    'background_style',case when p_appearance->>'background_style' in ('gradient','solid','aurora') then p_appearance->>'background_style' else 'gradient' end,
    'cover_url',v_cover,
    'chat_density',case when p_appearance->>'chat_density' in ('compact','comfortable') then p_appearance->>'chat_density' else 'compact' end,
    'font_scale',case when p_appearance->>'font_scale' in ('small','normal','large') then p_appearance->>'font_scale' else 'small' end,
    'show_member_count',case when p_appearance->>'show_member_count' in ('true','false') then (p_appearance->>'show_member_count')::boolean else true end,
    'show_host_badge',case when p_appearance->>'show_host_badge' in ('true','false') then (p_appearance->>'show_host_badge')::boolean else true end);
  update public.spike_rooms set appearance=v_clean,updated_at=now() where id=p_room_id;
  return jsonb_build_object('ok',true,'appearance',v_clean);
end;
$function$;
revoke all on function private.spike_room_update_appearance_internal(uuid,jsonb) from public, anon, authenticated;
create or replace function public.spike_room_update_appearance(p_room_id uuid, p_appearance jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
begin
  return private.spike_room_update_appearance_internal(p_room_id,p_appearance);
end;
$function$;
revoke all on function public.spike_room_update_appearance(uuid,jsonb) from public, anon;
grant execute on function public.spike_room_update_appearance(uuid,jsonb) to authenticated;
