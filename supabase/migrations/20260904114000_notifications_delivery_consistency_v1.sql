-- SPIKE notification delivery consistency: route remaining privileged broadcast
-- and announcement delivery through the same private emitter.

create or replace function private.admin_process_broadcast(p_broadcast_id uuid, p_batch_size integer default 250)
returns integer
language plpgsql
security definer
set search_path=public,private
as $$
declare
  b public.broadcasts;
  n integer:=0;
  batch integer:=greatest(1,least(coalesce(p_batch_size,250),500));
  offset_n integer;
  r record;
begin
  if not admin_guard() then raise exception 'admin required'; end if;
  select * into b from public.broadcasts where id=p_broadcast_id for update;
  if not found then raise exception 'broadcast not found'; end if;
  if b.status='completed' then return 0; end if;
  offset_n:=greatest(0,b.processed_count);
  for r in
    select p.id
    from public.profiles p
    where b.audience='all'
       or (b.audience='active' and exists(select 1 from public.user_presence up where up.user_id=p.id and up.last_seen>=now()-interval '30 days'))
       or (b.audience='room_members' and exists(select 1 from public.room_members rm where rm.room_id=b.room_id and rm.user_id=p.id))
    order by p.id offset offset_n limit batch
  loop
    if b.channel in ('notification','both') then
      perform private.emit_notification(r.id,'broadcast',jsonb_build_object('broadcast_id',b.id,'title',b.title,'body',b.body),'high','broadcast:'||b.id::text||':'||r.id::text,null,null);
    end if;
    if b.channel in ('private_message','both') then
      insert into public.private_messages(sender_id,recipient_id,body,message_type)
      values(b.created_by,r.id,b.title||E'\n\n'||b.body,'broadcast');
    end if;
    n:=n+1;
  end loop;
  update public.broadcasts
  set processed_count=processed_count+n,
      recipient_count=case when n < batch then greatest(recipient_count,processed_count+n) else recipient_count end,
      status=case when n < batch then 'completed' else 'processing' end,
      updated_at=now()
  where id=b.id;
  return n;
end;
$$;

create or replace function public.admin_process_announcement(p_campaign_id uuid, p_batch_size integer default 250)
returns integer
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  n integer:=0;
  v public.announcement_campaigns;
  r record;
begin
  perform public.admin_guard();
  select * into v from public.announcement_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Announcement not found'; end if;
  if v.status in ('completed','cancelled') or v.publish_at>now() then return 0; end if;
  for r in select user_id from public.announcement_recipients where campaign_id=v.id and delivered_at is null limit greatest(1,least(coalesce(p_batch_size,250),500)) loop
    perform private.emit_notification(r.user_id,'announcement',jsonb_build_object('campaign_id',v.id,'title',v.title,'body',v.body,'severity',v.severity),'high','announcement:'||v.id::text||':'||r.user_id::text,null,null);
    update public.announcement_recipients set delivered_at=now() where campaign_id=v.id and user_id=r.user_id and delivered_at is null;
    n:=n+1;
  end loop;
  update public.announcement_campaigns set delivered_count=coalesce(delivered_count,0)+n,status=case when not exists(select 1 from public.announcement_recipients where campaign_id=v.id and delivered_at is null) then 'completed' else 'processing' end,updated_at=now() where id=v.id;
  return n;
end;
$$;
