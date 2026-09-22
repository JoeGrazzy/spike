-- Reconcile the production Feature Suite collaboration RPC.
-- The client calls this function when accepting/declining a collaboration request.
-- Keep authorization server-side and deny anonymous execution.

create or replace function public.spike_signal_collaboration_respond(
  p_post_id text,
  p_owner_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_status text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if p_owner_id is null or p_post_id is null or trim(p_post_id)='' then
    raise exception 'Invalid collaboration request';
  end if;

  if not exists (
    select 1
    from public.spike_signal_collaborators
    where post_id=trim(p_post_id)
      and owner_id=p_owner_id
      and collaborator_id=uid
      and status='pending'
  ) then
    raise exception 'Collaboration request not found';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.spike_signal_collaborators
  set status=v_status,
      responded_at=now()
  where post_id=trim(p_post_id)
    and owner_id=p_owner_id
    and collaborator_id=uid;

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'post_id',trim(p_post_id)
  );
end;
$$;

revoke all on function public.spike_signal_collaboration_respond(text,uuid,boolean) from public,anon;
grant execute on function public.spike_signal_collaboration_respond(text,uuid,boolean) to authenticated;
