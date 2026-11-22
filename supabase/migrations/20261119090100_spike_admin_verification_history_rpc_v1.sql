create or replace function public.spike_admin_get_verification_actions(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public','auth','private' as $$
begin
 if not private.is_admin() then raise exception 'Only the SPIKE owner can inspect verification history.'; end if;
 if p_user_id is null then raise exception 'An account is required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'created_at',e.created_at) order by e.created_at desc) from (select * from public.spike_admin_verification_events where target_user_id=p_user_id order by created_at desc limit 50) e),'[]'::jsonb);
end; $$;
revoke all on function public.spike_admin_get_verification_actions(uuid) from public,anon;
grant execute on function public.spike_admin_get_verification_actions(uuid) to authenticated;
