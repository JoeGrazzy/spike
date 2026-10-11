-- Ensure an approved policy appeal can safely restore the original Signal.
-- The public-document policy trigger protects removed content from ordinary
-- client edits. An approved appeal must explicitly mark the restoration so
-- that trigger knows this UPDATE is an authorized restoration.

create or replace function public.admin_spike_policy_decide_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  a public.spike_policy_appeals;
  c public.spike_policy_cases;
  p public.app_documents;
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;

  select * into a from public.spike_policy_appeals where id=p_appeal_id for update;
  if not found then raise exception 'Appeal not found'; end if;
  if a.status not in ('pending','under_review') then raise exception 'Appeal is already decided'; end if;

  select * into c from public.spike_policy_cases where id=a.case_id for update;
  if not found then raise exception 'Policy case not found'; end if;

  update public.spike_policy_appeals
  set status=p_decision,
      decided_at=now(),
      decided_by=uid,
      decision_note=left(coalesce(p_note,''),3000)
  where id=a.id;

  if p_decision='approved' then
    update public.spike_policy_cases
    set status='restored',resolved_at=now(),resolved_by=uid,resolution='Appeal approved'
    where id=c.id;

    if c.content_type in ('post','post_edit') and c.content_id is not null then
      select * into p
      from public.app_documents
      where collection_name='posts' and document_id=c.content_id
      limit 1
      for update;

      if found then
        update public.app_documents
        set data=jsonb_set(
              jsonb_set(
                jsonb_set(p.data,'{deleted}','false'::jsonb,true),
                '{content}',
                to_jsonb(coalesce(c.original_content,p.data->>'content')),
                true
              ),
              '{moderation}',
              jsonb_build_object(
                'status','restored',
                'appeal_restored',true,
                'appeal_id',a.id,
                'restored_at',now(),
                'restored_by',uid
              ),
              true
            ),
            updated_at=now()
        where path=p.path;
      end if;
    end if;

    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(
      a.appellant_id,
      'spike_policy_appeal_decision',
      jsonb_build_object(
        'title','Your SPIKE Policy appeal was approved',
        'message','Your appeal was approved and the affected content has been restored when eligible.',
        'case_id',c.id,
        'appeal_id',a.id,
        'decision','approved',
        'policy_id',c.policy_id,
        'post_id',c.content_id,
        'source_page','policy_appeals.html'
      ),
      'high',
      'spike_policy_appeal:'||a.id::text,
      'spike_policy_case:'||c.id::text
    )
    on conflict (user_id,event_key) where event_key is not null do nothing;
  else
    update public.spike_policy_cases
    set status='upheld',resolved_at=now(),resolved_by=uid,resolution='Appeal rejected'
    where id=c.id;

    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(
      a.appellant_id,
      'spike_policy_appeal_decision',
      jsonb_build_object(
        'title','Your SPIKE Policy appeal was rejected',
        'message','Your appeal was reviewed and the original enforcement remains in place.',
        'case_id',c.id,
        'appeal_id',a.id,
        'decision','rejected',
        'policy_id',c.policy_id,
        'post_id',c.content_id,
        'source_page','policy_appeals.html'
      ),
      'high',
      'spike_policy_appeal:'||a.id::text,
      'spike_policy_case:'||c.id::text
    )
    on conflict (user_id,event_key) where event_key is not null do nothing;
  end if;

  return jsonb_build_object('ok',true,'appeal_id',a.id,'decision',p_decision);
end;
$$;

revoke all on function public.admin_spike_policy_decide_appeal(uuid,text,text) from public,anon;
grant execute on function public.admin_spike_policy_decide_appeal(uuid,text,text) to authenticated;

-- Direct moderator restoration uses the same explicit bypass marker so the
-- public-document policy trigger cannot immediately re-remove the Signal.
create or replace function public.admin_spike_policy_decide_case(
  p_case_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  c public.spike_policy_cases;
  p public.app_documents;
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('upheld','dismissed','restored') then raise exception 'Invalid case decision'; end if;

  select * into c from public.spike_policy_cases where id=p_case_id for update;
  if not found then raise exception 'Policy case not found'; end if;

  update public.spike_policy_cases
  set status=p_decision,
      resolved_at=now(),
      resolved_by=uid,
      resolution=left(coalesce(p_note,''),3000)
  where id=c.id;

  if p_decision='restored' and c.content_type in ('post','post_edit') and c.content_id is not null then
    select * into p
    from public.app_documents
    where collection_name='posts' and document_id=c.content_id
    limit 1
    for update;

    if found then
      update public.app_documents
      set data=jsonb_set(
            jsonb_set(
              jsonb_set(p.data,'{deleted}','false'::jsonb,true),
              '{content}',
              to_jsonb(coalesce(c.original_content,p.data->>'content')),
              true
            ),
            '{moderation}',
            jsonb_build_object(
              'status','restored',
              'appeal_restored',true,
              'restored_at',now(),
              'restored_by',uid,
              'source','admin'
            ),
            true
          ),
          updated_at=now()
      where path=p.path;
    end if;
  end if;

  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values(
    c.owner_id,
    'spike_policy_case_update',
    jsonb_build_object(
      'title','SPIKE Policy case updated',
      'message',coalesce(p_note,'A moderator updated your policy case.'),
      'case_id',c.id,
      'decision',p_decision,
      'policy_id',c.policy_id,
      'post_id',c.content_id,
      'source_page','policy_appeals.html'
    ),
    'high',
    'spike_policy_case_update:'||c.id::text||':'||p_decision,
    'spike_policy_case:'||c.id::text
  )
  on conflict (user_id,event_key) where event_key is not null do nothing;

  return jsonb_build_object('ok',true,'case_id',c.id,'decision',p_decision);
end;
$$;

revoke all on function public.admin_spike_policy_decide_case(uuid,text,text) from public,anon;
grant execute on function public.admin_spike_policy_decide_case(uuid,text,text) to authenticated;
