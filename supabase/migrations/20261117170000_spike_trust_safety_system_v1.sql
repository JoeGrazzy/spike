-- SPIKE Trust & Safety Management System v1
-- Consolidated, idempotent source migration for the live deployment.
-- Existing reporting tables and moderation functions are reused; this migration
-- centralizes intake, owner-only review, evidence, enforcement, appeals and audit.

alter table public.spike_abuse_cases
  add column if not exists resolved_at timestamptz,
  add column if not exists evidence jsonb;

alter table public.comments add column if not exists moderation_status text not null default 'visible';
do $block$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.comments'::regclass and conname='comments_moderation_status_check') then
    alter table public.comments add constraint comments_moderation_status_check check(moderation_status in ('visible','hidden'));
  end if;
end $block$;
drop policy if exists comments_select_authenticated on public.comments;
create policy comments_select_authenticated on public.comments for select to authenticated using(moderation_status='visible');

-- A reported user must never be able to read the reporter's identity or private
-- report details. Their own sanitized decision history is provided by RPC below.
drop policy if exists spike_abuse_select_reporter_subject_admin on public.spike_abuse_cases;
drop policy if exists spike_abuse_select_reporter_owner_only on public.spike_abuse_cases;
create policy spike_abuse_select_reporter_owner_only
on public.spike_abuse_cases for select to authenticated
using (reporter_id=(select auth.uid()) or private.spike_is_owner());

drop policy if exists spike_abuse_insert_reporter_or_admin on public.spike_abuse_cases;
create policy spike_abuse_insert_reporter_or_admin
on public.spike_abuse_cases for insert to authenticated
with check (
  (reporter_id=(select auth.uid()) and status='open' and severity=1
   and assigned_to is null and resolution is null)
  or private.spike_is_owner()
);

create table if not exists public.spike_abuse_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.spike_abuse_cases(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (char_length(btrim(note)) between 1 and 3000),
  created_at timestamptz not null default now()
);
alter table public.spike_abuse_case_notes enable row level security;
drop policy if exists spike_abuse_case_notes_deny_all on public.spike_abuse_case_notes;
create policy spike_abuse_case_notes_deny_all on public.spike_abuse_case_notes
for all to authenticated using(false) with check(false);
revoke all on table public.spike_abuse_case_notes from public,anon,authenticated;
create index if not exists spike_abuse_case_notes_case_created_idx
on public.spike_abuse_case_notes(case_id,created_at desc);

create table if not exists public.spike_abuse_case_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.spike_abuse_cases(id) on delete cascade,
  appellant_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  decision_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id,appellant_id)
);
alter table public.spike_abuse_case_appeals enable row level security;
drop policy if exists spike_abuse_case_appeals_deny_all on public.spike_abuse_case_appeals;
create policy spike_abuse_case_appeals_deny_all on public.spike_abuse_case_appeals
for all to authenticated using(false) with check(false);
revoke all on table public.spike_abuse_case_appeals from public,anon,authenticated;
create index if not exists spike_abuse_case_appeals_queue_idx
on public.spike_abuse_case_appeals(status,created_at desc);

create or replace function public.spike_abuse_case_resolution_clock()
returns trigger language plpgsql set search_path=''
as $$ begin
  if new.status in ('actioned','dismissed','closed') then
    if tg_op='INSERT' or old.status is distinct from new.status then new.resolved_at:=coalesce(new.resolved_at,now()); end if;
  else new.resolved_at:=null; end if;
  return new;
end $$;
revoke all on function public.spike_abuse_case_resolution_clock() from public,anon,authenticated;
drop trigger if exists spike_abuse_case_resolution_clock on public.spike_abuse_cases;
create trigger spike_abuse_case_resolution_clock before insert or update of status
on public.spike_abuse_cases for each row execute function public.spike_abuse_case_resolution_clock();
update public.spike_abuse_cases set resolved_at=updated_at where status in ('actioned','dismissed','closed') and resolved_at is null;

create or replace function public.spike_notify_owner_abuse_case()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_owner uuid; v_priority text;
begin
  select owner_user_id into v_owner from private.spike_owner_authority
  where singleton=true and active=true limit 1;
  if v_owner is not null then
    v_priority:=case when new.severity>=5 then 'critical' when new.severity>=4 then 'high' else 'normal' end;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(v_owner,'spike_abuse_report',jsonb_build_object(
      'title','New SPIKE safety report','message','A new '||new.source||' report requires review.',
      'case_id',new.id,'source',new.source,'category',new.category,'severity',new.severity),
      v_priority,'spike_abuse_report:'||new.id::text,'spike_abuse_reports')
    on conflict(user_id,event_key) where event_key is not null do nothing;
  end if;
  return new;
end $$;
revoke all on function public.spike_notify_owner_abuse_case() from public,anon,authenticated;
drop trigger if exists spike_abuse_case_owner_notification on public.spike_abuse_cases;
create trigger spike_abuse_case_owner_notification after insert on public.spike_abuse_cases
for each row execute function public.spike_notify_owner_abuse_case();

create unique index if not exists spike_abuse_cases_active_reporter_content_uq
on public.spike_abuse_cases(reporter_id,source,source_id)
where source<>'room' and source_id is not null and status in ('open','reviewing');
create unique index if not exists spike_room_reports_room_reporter_uq
on public.spike_room_reports(room_id,reporter_id);

-- Unified report submission RPC. User-submitted severity is never trusted;
-- suggested priority is derived server-side from the selected category.
create or replace function public.spike_submit_abuse_report(
  p_source text,p_source_id text,p_subject_user_id uuid,p_category text,p_details text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_id uuid; v_duplicate boolean:=false; v_severity integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_source not in ('profile','post','comment','call','payment','system') then raise exception 'Unsupported report source'; end if;
  if nullif(btrim(coalesce(p_source_id,'')),'') is null or char_length(p_source_id)>256 then raise exception 'A valid content reference is required'; end if;
  if p_category not in ('spam','harassment','hate','sexual','violence','fraud','impersonation','privacy','other') then raise exception 'Choose a valid report category'; end if;
  if char_length(coalesce(p_details,''))>3000 then raise exception 'Report details are too long'; end if;
  if p_subject_user_id=v_uid then raise exception 'You cannot report your own account or content'; end if;
  if p_source='profile' and p_subject_user_id is null then raise exception 'The reported profile could not be identified'; end if;
  v_severity:=case p_category when 'violence' then 5 when 'sexual' then 4 when 'hate' then 4
    when 'harassment' then 3 when 'fraud' then 3 when 'impersonation' then 3 when 'privacy' then 3 else 1 end;
  insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
  values(v_uid,p_subject_user_id,p_source,btrim(p_source_id),p_category,nullif(btrim(coalesce(p_details,'')),''),'open',v_severity)
  on conflict(reporter_id,source,source_id)
    where source<>'room' and source_id is not null and status in ('open','reviewing') do nothing
  returning id into v_id;
  if v_id is null then
    v_duplicate:=true;
    select id into v_id from public.spike_abuse_cases
    where reporter_id=v_uid and source=p_source and source_id=btrim(p_source_id)
      and status in ('open','reviewing') order by created_at desc limit 1;
  end if;
  if v_id is null then raise exception 'Report could not be saved'; end if;
  return jsonb_build_object('ok',true,'case_id',v_id,'duplicate',v_duplicate,'suggested_severity',v_severity);
end $$;
revoke all on function public.spike_submit_abuse_report(text,text,uuid,text,text) from public,anon;
grant execute on function public.spike_submit_abuse_report(text,text,uuid,text,text) to authenticated;

-- Room report bridge and room-message report intake.
create or replace function public.spike_room_report(p_room_id uuid,p_reason text,p_details text default '')
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_report_id uuid; v_case_id uuid; v_host_id uuid; v_title text; v_severity integer; v_details text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('harassment','hate','spam','sexual','violence','other') then raise exception 'Choose a valid report reason'; end if;
  if char_length(coalesce(p_details,''))>500 then raise exception 'Report details are too long'; end if;
  select host_id,title into v_host_id,v_title from public.spike_rooms where id=p_room_id;
  if not found then raise exception 'Room not found'; end if;
  v_severity:=case p_reason when 'violence' then 5 when 'sexual' then 4 when 'hate' then 4 when 'harassment' then 3 else 1 end;
  insert into public.spike_room_reports(room_id,reporter_id,reason,details)
  values(p_room_id,v_uid,p_reason,btrim(coalesce(p_details,'')))
  on conflict(room_id,reporter_id) do update set reason=excluded.reason,details=excluded.details,created_at=now()
  returning id into v_report_id;
  v_details:=left('Room report ID: '||v_report_id::text||E'\nRoom ID: '||p_room_id::text||E'\nRoom title: '||coalesce(v_title,'Untitled room')||
    case when nullif(btrim(coalesce(p_details,'')),'') is null then '' else E'\nReporter notes: '||btrim(p_details) end,3000);
  insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
  select v_uid,v_host_id,'room',p_room_id::text,p_reason,v_details,'open',v_severity
  where not exists(select 1 from public.spike_abuse_cases a where a.reporter_id=v_uid and a.source='room'
    and a.source_id=p_room_id::text and a.status in ('open','reviewing')
    and position(('Room report ID: '||v_report_id::text) in coalesce(a.details,''))>0)
  returning id into v_case_id;
  return v_report_id;
end $$;
revoke all on function public.spike_room_report(uuid,text,text) from public,anon;
grant execute on function public.spike_room_report(uuid,text,text) to authenticated;

create or replace function public.spike_room_report_message(p_message_id uuid,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_message public.spike_room_messages; v_report_id uuid; v_case_id uuid; v_severity integer; v_details text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.spike_require_verified_room_access(v_uid);
  if p_reason not in ('harassment','hate','spam','sexual','violence','other') then raise exception 'Choose a valid report reason'; end if;
  if char_length(coalesce(p_details,''))>500 then raise exception 'Details must be 500 characters or fewer'; end if;
  select * into v_message from public.spike_room_messages where id=p_message_id and deleted_at is null;
  if not found then raise exception 'This message is no longer available'; end if;
  if not exists(select 1 from public.spike_room_members where room_id=v_message.room_id and user_id=v_uid and member_state='active') then raise exception 'Join the room before reporting a message'; end if;
  v_severity:=case p_reason when 'violence' then 5 when 'sexual' then 4 when 'hate' then 4 when 'harassment' then 3 else 1 end;
  insert into public.spike_room_message_reports(room_id,message_id,reporter_id,reason,details)
  values(v_message.room_id,v_message.id,v_uid,p_reason,btrim(coalesce(p_details,'')))
  on conflict(message_id,reporter_id) do update set reason=excluded.reason,details=excluded.details,created_at=now()
  returning id into v_report_id;
  v_details:=left('Room message ID: '||v_message.id::text||E'\nReported message: '||left(v_message.body,1200)||
    case when nullif(btrim(coalesce(p_details,'')),'') is null then '' else E'\nReporter notes: '||btrim(p_details) end,3000);
  insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
  select v_uid,v_message.sender_id,'room',v_message.room_id::text,p_reason,v_details,'open',v_severity
  where not exists(select 1 from public.spike_abuse_cases a where a.reporter_id=v_uid and a.source='room'
    and a.source_id=v_message.room_id::text and a.category=p_reason and a.status in ('open','reviewing')
    and position(('Room message ID: '||v_message.id::text) in coalesce(a.details,''))>0)
  returning id into v_case_id;
  return jsonb_build_object('ok',true,'report_id',v_report_id,'moderation_case_id',v_case_id,'suggested_severity',v_severity);
end $$;
revoke all on function public.spike_room_report_message(uuid,text,text) from public,anon;
grant execute on function public.spike_room_report_message(uuid,text,text) to authenticated;

-- Backfill every legacy reporting source into the canonical queue.
insert into public.spike_abuse_cases(reporter_id,source,source_id,category,details,status,severity)
select fr.reporter_id,'post',fr.post_id,'other','Legacy Feed report ID: '||fr.id::text,'open',1
from public.feed_reports fr where not exists(select 1 from public.spike_abuse_cases a where a.details like '%Legacy Feed report ID: '||fr.id::text||'%');
insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
select pr.reporter_id,pr.reported_user_id,'profile',pr.reported_user_id::text,'other',
  left('Legacy Profile report ID: '||pr.id::text||E'\nReason: '||coalesce(pr.reason,''),3000),'open',1
from public.profile_reports pr where not exists(select 1 from public.spike_abuse_cases a where a.details like '%Legacy Profile report ID: '||pr.id::text||'%');
insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
select rr.reporter_id,r.host_id,'room',rr.room_id::text,rr.reason,
  left('Legacy Room report ID: '||rr.id::text||E'\nRoom ID: '||rr.room_id::text||case when coalesce(rr.details,'')='' then '' else E'\nReporter notes: '||rr.details end,3000),'open',1
from public.spike_room_reports rr join public.spike_rooms r on r.id=rr.room_id
where not exists(select 1 from public.spike_abuse_cases a where a.details like '%Legacy Room report ID: '||rr.id::text||'%');
insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
select mr.reporter_id,msg.sender_id,'room',mr.room_id::text,mr.reason,
  left('Legacy room message report ID: '||mr.id::text||E'\nRoom message ID: '||mr.message_id::text||E'\nReported message: '||left(coalesce(msg.body,''),1200)||case when coalesce(mr.details,'')='' then '' else E'\nReporter notes: '||mr.details end,3000),'open',1
from public.spike_room_message_reports mr join public.spike_room_messages msg on msg.id=mr.message_id
where not exists(select 1 from public.spike_abuse_cases a where a.details like '%Legacy room message report ID: '||mr.id::text||'%');

-- Owner-only queue, aggregate metrics and case updates.
create or replace function public.admin_report_queue(p_status text default null,p_source text default null,p_search text default null,p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,reporter_id uuid,reporter_name text,reporter_username text,subject_user_id uuid,subject_name text,subject_username text,
 source text,source_id text,category text,details text,status text,severity integer,assigned_to uuid,resolution text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$ begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  return query select a.id,a.reporter_id,coalesce(rp.display_name,rp.full_name,'Unknown reporter'),rp.username,
    a.subject_user_id,coalesce(sp.display_name,sp.full_name,'Unknown / unavailable'),sp.username,
    a.source,a.source_id,a.category,a.details,a.status,a.severity::integer,a.assigned_to,a.resolution,a.created_at,a.updated_at
  from public.spike_abuse_cases a left join public.profiles rp on rp.id=a.reporter_id left join public.profiles sp on sp.id=a.subject_user_id
  where (p_status is null or a.status=p_status) and (p_source is null or a.source=p_source)
    and (nullif(btrim(coalesce(p_search,'')),'') is null or a.id::text ilike '%'||btrim(p_search)||'%'
      or coalesce(a.details,'') ilike '%'||btrim(p_search)||'%' or coalesce(a.source_id,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(rp.username,'') ilike '%'||btrim(p_search)||'%' or coalesce(sp.username,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(rp.display_name,'') ilike '%'||btrim(p_search)||'%' or coalesce(sp.display_name,'') ilike '%'||btrim(p_search)||'%')
  order by case when a.severity>=5 then 0 when a.severity>=4 then 1 else 2 end,a.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),500) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.admin_report_queue(text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_report_queue(text,text,text,integer,integer) to authenticated;

create or replace function public.admin_report_stats()
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v jsonb; begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  select jsonb_build_object(
    'total',count(*),'open',count(*) filter(where status='open'),'reviewing',count(*) filter(where status='reviewing'),
    'actioned',count(*) filter(where status='actioned'),'dismissed',count(*) filter(where status='dismissed'),
    'closed',count(*) filter(where status='closed'),'critical',count(*) filter(where severity>=5 and status in ('open','reviewing')),
    'high',count(*) filter(where severity=4 and status in ('open','reviewing')),
    'today',count(*) filter(where created_at>=date_trunc('day',now())),
    'overdue_24h',count(*) filter(where status in ('open','reviewing') and created_at<now()-interval '24 hours'),
    'avg_resolution_minutes',round(avg(extract(epoch from (resolved_at-created_at))/60) filter(where resolved_at is not null),1),
    'repeat_offenders',(select count(*) from (select subject_user_id from public.spike_abuse_cases where status='actioned' and subject_user_id is not null group by subject_user_id having count(*)>=2) x),
    'potential_false_reporters',(select count(*) from (select reporter_id from public.spike_abuse_cases where status='dismissed' and created_at>=now()-interval '30 days' and reporter_id is not null group by reporter_id having count(*)>=5) x),
    'pending_appeals',(select count(*) from public.spike_abuse_case_appeals where status='pending')) into v
  from public.spike_abuse_cases;
  return v;
end $$;
revoke all on function public.admin_report_stats() from public,anon;
grant execute on function public.admin_report_stats() to authenticated;

create or replace function public.admin_report_case_update(p_case_id uuid,p_status text,p_severity integer,p_assigned_to uuid,p_resolution text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_case public.spike_abuse_cases; v_old_status text; v_event text;
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  if p_status not in ('open','reviewing','actioned','dismissed','closed') then raise exception 'Invalid report status'; end if;
  if p_severity<1 or p_severity>5 then raise exception 'Severity must be between 1 and 5'; end if;
  if p_assigned_to is not null and p_assigned_to<>auth.uid() then raise exception 'Only the designated owner can be assigned cases'; end if;
  if p_status in ('actioned','dismissed','closed') and nullif(btrim(coalesce(p_resolution,'')),'') is null then raise exception 'A resolution note is required to complete a case'; end if;
  select status into v_old_status from public.spike_abuse_cases where id=p_case_id for update;
  if not found then raise exception 'Report case not found'; end if;
  update public.spike_abuse_cases set status=p_status,severity=p_severity,assigned_to=p_assigned_to,
    resolution=case when p_resolution is null then resolution else left(btrim(p_resolution),3000) end,updated_at=now()
  where id=p_case_id returning * into v_case;
  if v_case.reporter_id is not null and v_old_status is distinct from p_status then
    v_event:='spike_report_status:'||v_case.id::text||':'||gen_random_uuid()::text;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(v_case.reporter_id,'spike_report_status_update',jsonb_build_object('title','Your SPIKE report was updated',
      'message',case p_status when 'reviewing' then 'Your report is being investigated.' when 'actioned' then 'Your report has been reviewed and appropriate action was recorded.'
       when 'dismissed' then 'Your report was reviewed and no violation was confirmed.' when 'closed' then 'Your report case has been closed.'
       else 'Your report has returned to the pending queue.' end,'case_id',v_case.id,'status',p_status),
      'normal',v_event,'spike_report_status_updates');
  end if;
  return jsonb_build_object('ok',true,'case_id',v_case.id,'status',v_case.status);
end $$;
revoke all on function public.admin_report_case_update(uuid,text,integer,uuid,text) from public,anon;
grant execute on function public.admin_report_case_update(uuid,text,integer,uuid,text) to authenticated;

create or replace function public.admin_report_case_notes(p_case_id uuid)
returns table(id uuid,author_id uuid,note text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$ begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  return query select n.id,n.author_id,n.note,n.created_at from public.spike_abuse_case_notes n where n.case_id=p_case_id order by n.created_at desc;
end $$;
revoke all on function public.admin_report_case_notes(uuid) from public,anon;
grant execute on function public.admin_report_case_notes(uuid) to authenticated;

create or replace function public.admin_add_report_case_note(p_case_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_id uuid; begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null or char_length(p_note)>3000 then raise exception 'Enter a note of 1 to 3000 characters'; end if;
  if not exists(select 1 from public.spike_abuse_cases where id=p_case_id) then raise exception 'Report case not found'; end if;
  insert into public.spike_abuse_case_notes(case_id,author_id,note) values(p_case_id,auth.uid(),btrim(p_note)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_add_report_case_note(uuid,text) from public,anon;
grant execute on function public.admin_add_report_case_note(uuid,text) to authenticated;

-- User-safe appeal history and appeal submission.
create or replace function public.my_spike_moderation_cases()
returns table(id uuid,source text,category text,status text,resolution text,created_at timestamptz,updated_at timestamptz,appeal_status text)
language plpgsql security definer set search_path=''
as $$ begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query select a.id,a.source,a.category,a.status,a.resolution,a.created_at,a.updated_at,ap.status
  from public.spike_abuse_cases a left join public.spike_abuse_case_appeals ap on ap.case_id=a.id and ap.appellant_id=auth.uid()
  where a.subject_user_id=auth.uid() and (a.status in ('actioned','closed') or ap.status in ('pending','accepted','rejected'))
  order by a.updated_at desc limit 100;
end $$;
revoke all on function public.my_spike_moderation_cases() from public,anon;
grant execute on function public.my_spike_moderation_cases() to authenticated;

create or replace function public.spike_submit_moderation_appeal(p_case_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_case public.spike_abuse_cases; v_id uuid; v_owner uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null or char_length(p_reason)>2000 then raise exception 'Provide an appeal reason of 1 to 2000 characters'; end if;
  select * into v_case from public.spike_abuse_cases where id=p_case_id and subject_user_id=v_uid for update;
  if not found then raise exception 'Moderation decision not found'; end if;
  if v_case.status not in ('actioned','closed') then raise exception 'This case is not currently eligible for appeal'; end if;
  insert into public.spike_abuse_case_appeals(case_id,appellant_id,reason) values(p_case_id,v_uid,btrim(p_reason))
  on conflict(case_id,appellant_id) do update set reason=excluded.reason,status='pending',decision_note=null,reviewed_by=null,reviewed_at=null,updated_at=now()
  where public.spike_abuse_case_appeals.status='rejected' returning id into v_id;
  if v_id is null then raise exception 'An appeal is already pending or has already been accepted'; end if;
  select owner_user_id into v_owner from private.spike_owner_authority where singleton=true and active=true;
  if v_owner is not null then
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(v_owner,'spike_moderation_appeal',jsonb_build_object('title','New moderation appeal','message','A user appealed a moderation decision.','case_id',p_case_id,'appeal_id',v_id),
      'high','spike_moderation_appeal:'||v_id::text,'spike_moderation_appeals')
    on conflict(user_id,event_key) where event_key is not null do nothing;
  end if;
  return v_id;
end $$;
revoke all on function public.spike_submit_moderation_appeal(uuid,text) from public,anon;
grant execute on function public.spike_submit_moderation_appeal(uuid,text) to authenticated;

create or replace function public.admin_report_appeals(p_case_id uuid default null,p_status text default null,p_limit integer default 100)
returns table(id uuid,case_id uuid,appellant_id uuid,appellant_name text,appellant_username text,reason text,status text,decision_note text,created_at timestamptz,reviewed_at timestamptz,case_source text,case_category text,case_status text)
language plpgsql security definer set search_path=''
as $$ begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  return query select ap.id,ap.case_id,ap.appellant_id,coalesce(p.display_name,p.full_name,'SPIKE user'),p.username,
    ap.reason,ap.status,ap.decision_note,ap.created_at,ap.reviewed_at,a.source,a.category,a.status
  from public.spike_abuse_case_appeals ap join public.spike_abuse_cases a on a.id=ap.case_id
  left join public.profiles p on p.id=ap.appellant_id
  where (p_case_id is null or ap.case_id=p_case_id) and (p_status is null or ap.status=p_status)
  order by case when ap.status='pending' then 0 else 1 end,ap.created_at desc limit least(greatest(coalesce(p_limit,100),1),500);
end $$;
revoke all on function public.admin_report_appeals(uuid,text,integer) from public,anon;
grant execute on function public.admin_report_appeals(uuid,text,integer) to authenticated;

create or replace function public.admin_decide_report_appeal(p_appeal_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_appeal public.spike_abuse_case_appeals; v_case public.spike_abuse_cases; v_message text;
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Choose accepted or rejected'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'A decision explanation is required'; end if;
  select * into v_appeal from public.spike_abuse_case_appeals where id=p_appeal_id for update;
  if not found then raise exception 'Appeal not found'; end if;
  if v_appeal.status<>'pending' then raise exception 'This appeal has already been reviewed'; end if;
  update public.spike_abuse_case_appeals set status=p_decision,decision_note=left(btrim(p_note),2000),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_appeal_id returning * into v_appeal;
  select * into v_case from public.spike_abuse_cases where id=v_appeal.case_id for update;
  if p_decision='accepted' then
    update public.spike_abuse_cases set status='reviewing',resolution=left(coalesce(resolution,'')||E'\nAppeal accepted for reconsideration: '||btrim(p_note),3000),updated_at=now()
    where id=v_case.id;
    v_message:='Your appeal was accepted for further review. The moderation decision is being reconsidered; this does not automatically reverse an existing restriction.';
  else v_message:='Your appeal was reviewed and the original moderation decision remains in place.'; end if;
  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values(v_appeal.appellant_id,'spike_moderation_appeal_update',jsonb_build_object('title','Moderation appeal reviewed','message',v_message,
    'appeal_id',v_appeal.id,'case_id',v_case.id,'decision',p_decision,'decision_note',left(p_note,1000)),
    'normal','spike_moderation_appeal_update:'||v_appeal.id::text,'spike_moderation_appeal_updates')
  on conflict(user_id,event_key) where event_key is not null do update set data=excluded.data,created_at=now();
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(auth.uid(),'moderation_appeal_'||p_decision,v_appeal.appellant_id,'super_admin',jsonb_build_object('appeal_id',v_appeal.id,'case_id',v_case.id,'note',left(p_note,2000)));
  return jsonb_build_object('ok',true,'appeal_id',v_appeal.id,'decision',p_decision,'case_status',case when p_decision='accepted' then 'reviewing' else v_case.status end);
end $$;
revoke all on function public.admin_decide_report_appeal(uuid,text,text) from public,anon;
grant execute on function public.admin_decide_report_appeal(uuid,text,text) to authenticated;

-- Owner-only enforcement for room reports, room messages and comments.
create or replace function public.admin_remove_reported_room_message(p_case_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_case public.spike_abuse_cases; v_match text[]; v_message uuid; v_changed integer;
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  select * into v_case from public.spike_abuse_cases where id=p_case_id and source='room' for update;
  if not found then raise exception 'Room moderation case not found'; end if;
  v_match:=regexp_match(coalesce(v_case.details,''),'Room message ID: ([0-9a-fA-F-]{36})');
  if v_match is null then raise exception 'This report does not identify a specific room message'; end if;
  v_message:=v_match[1]::uuid;
  update public.spike_room_messages set deleted_at=coalesce(deleted_at,now()),edited_at=now(),pinned_at=null,pinned_by=null
  where id=v_message and room_id=v_case.source_id::uuid and deleted_at is null;
  get diagnostics v_changed=row_count;
  if v_changed=0 and not exists(select 1 from public.spike_room_messages where id=v_message and room_id=v_case.source_id::uuid and deleted_at is not null) then raise exception 'Reported room message was not found'; end if;
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(auth.uid(),'room_reported_message_removed',v_case.subject_user_id,'super_admin',jsonb_build_object('case_id',p_case_id,'room_id',v_case.source_id,'message_id',v_message,'reason',left(coalesce(p_reason,''),1000)));
  return jsonb_build_object('ok',true,'message_id',v_message,'removed',v_changed>0);
end $$;
revoke all on function public.admin_remove_reported_room_message(uuid,text) from public,anon;
grant execute on function public.admin_remove_reported_room_message(uuid,text) to authenticated;

create or replace function public.admin_restore_reported_room_message(p_case_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_case public.spike_abuse_cases; v_match text[]; v_message uuid; v_changed integer;
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  select * into v_case from public.spike_abuse_cases where id=p_case_id and source='room' for update;
  if not found then raise exception 'Room moderation case not found'; end if;
  v_match:=regexp_match(coalesce(v_case.details,''),'Room message ID: ([0-9a-fA-F-]{36})');
  if v_match is null then raise exception 'This report does not identify a specific room message'; end if;
  v_message:=v_match[1]::uuid;
  update public.spike_room_messages set deleted_at=null,edited_at=now()
  where id=v_message and room_id=v_case.source_id::uuid and deleted_at is not null;
  get diagnostics v_changed=row_count;
  if v_changed=0 and not exists(select 1 from public.spike_room_messages where id=v_message and room_id=v_case.source_id::uuid and deleted_at is null) then raise exception 'Reported room message was not found'; end if;
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(auth.uid(),'reported_room_message_restored',v_case.subject_user_id,'super_admin',jsonb_build_object('case_id',v_case.id,'room_id',v_case.source_id,'message_id',v_message,'reason',left(p_reason,1000)));
  return jsonb_build_object('ok',true,'message_id',v_message,'restored',v_changed>0);
end $$;
revoke all on function public.admin_restore_reported_room_message(uuid,text) from public,anon;
grant execute on function public.admin_restore_reported_room_message(uuid,text) to authenticated;

create or replace function public.admin_end_reported_room(p_case_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_case public.spike_abuse_cases; v_room uuid; v_changed integer;
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  select * into v_case from public.spike_abuse_cases where id=p_case_id and source='room' for update;
  if not found then raise exception 'Room report case not found'; end if;
  if position('Room message ID:' in coalesce(v_case.details,''))>0 then raise exception 'This case concerns a room message, not the room itself'; end if;
  v_room:=v_case.source_id::uuid;
  update public.spike_rooms set status='ended',ended_at=coalesce(ended_at,now()),active_host_id=null,empty_since=null,updated_at=now()
  where id=v_room and status in ('live','scheduled');
  get diagnostics v_changed=row_count;
  if v_changed=0 and not exists(select 1 from public.spike_rooms where id=v_room and status='ended') then raise exception 'Reported room was not found'; end if;
  update public.spike_room_members set member_state='left',left_at=coalesce(left_at,now()),speaker_requested=false,updated_at=now()
  where room_id=v_room and member_state='active';
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(auth.uid(),'reported_room_ended',v_case.subject_user_id,'super_admin',jsonb_build_object('case_id',v_case.id,'room_id',v_room,'reason',left(p_reason,1000)));
  return jsonb_build_object('ok',true,'room_id',v_room,'already_ended',v_changed=0);
end $$;
revoke all on function public.admin_end_reported_room(uuid,text) from public,anon;
grant execute on function public.admin_end_reported_room(uuid,text) to authenticated;

create or replace function public.admin_comment_action(p_case_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_case public.spike_abuse_cases; v_comment public.comments; v_doc public.app_documents; v_comments jsonb; v_new jsonb; v_snapshot jsonb; v_index integer; v_actor uuid:=auth.uid();
begin
  if not private.spike_is_owner() then raise exception 'Dedicated Owner access required'; end if;
  if p_action not in ('hide','restore') then raise exception 'Unsupported comment action'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A moderation reason is required'; end if;
  select * into v_case from public.spike_abuse_cases where id=p_case_id and source='comment' for update;
  if not found then raise exception 'Comment report case not found'; end if;
  select * into v_comment from public.comments where id=v_case.source_id for update;
  if not found then raise exception 'Reported comment was not found'; end if;
  select * into v_doc from public.app_documents where collection_name='posts' and document_id=v_comment.post_id for update;
  if not found then raise exception 'The original Feed post was not found'; end if;
  v_comments:=case when jsonb_typeof(v_doc.data->'comments')='array' then v_doc.data->'comments' else '[]'::jsonb end;
  select item,ord::integer-1 into v_snapshot,v_index from jsonb_array_elements(v_comments) with ordinality as x(item,ord) where item->>'id'=v_case.source_id limit 1;
  if p_action='hide' then
    if v_snapshot is null then
      if v_comment.moderation_status='hidden' then return jsonb_build_object('ok',true,'comment_id',v_case.source_id,'already_hidden',true); end if;
      raise exception 'Comment is not present in the original post snapshot';
    end if;
    update public.spike_abuse_cases set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('comment_snapshot',v_snapshot,'comment_index',v_index) where id=v_case.id;
    select coalesce(jsonb_agg(item order by ord),'[]'::jsonb) into v_new from jsonb_array_elements(v_comments) with ordinality as x(item,ord) where item->>'id'<>v_case.source_id;
    update public.app_documents set data=jsonb_set(v_doc.data,'{comments}',v_new,true),updated_at=now() where path=v_doc.path;
    update public.comments set moderation_status='hidden' where id=v_case.source_id;
  else
    v_snapshot:=coalesce(v_case.evidence->'comment_snapshot',v_snapshot);
    if v_snapshot is null then v_snapshot:=jsonb_build_object('id',v_comment.id,'postId',v_comment.post_id,'authorUid',v_comment.user_id,'text',v_comment.content,'createdAt',v_comment.created_at); end if;
    if not exists(select 1 from jsonb_array_elements(v_comments) item where item->>'id'=v_case.source_id) then
      v_index:=coalesce((v_case.evidence->>'comment_index')::integer,jsonb_array_length(v_comments));
      select coalesce(jsonb_agg(item order by sort_key),'[]'::jsonb) into v_new from (
        select item,ord::numeric*2 as sort_key from jsonb_array_elements(v_comments) with ordinality as x(item,ord)
        union all select v_snapshot,(least(greatest(v_index,0),jsonb_array_length(v_comments))+1)::numeric*2-1
      ) q;
      update public.app_documents set data=jsonb_set(v_doc.data,'{comments}',v_new,true),updated_at=now() where path=v_doc.path;
    end if;
    update public.comments set moderation_status='visible' where id=v_case.source_id;
  end if;
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(v_actor,'comment_'||p_action,v_comment.user_id,'super_admin',jsonb_build_object('case_id',v_case.id,'comment_id',v_case.source_id,'post_id',v_comment.post_id,'reason',left(p_reason,1000)));
  return jsonb_build_object('ok',true,'comment_id',v_case.source_id,'action',p_action);
end $$;
revoke all on function public.admin_comment_action(uuid,text,text) from public,anon;
grant execute on function public.admin_comment_action(uuid,text,text) to authenticated;

-- Owner-only appeals queue and decision workflow.
-- Accepted means reconsideration; it does not silently reverse existing enforcement.

-- Direct-message reporting captures a safe text/attachment snapshot and deduplicates active reports.
create or replace function public.dm_report_message(p_message_id uuid,p_reason text default '')
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_user uuid:=auth.uid(); v_subject uuid; v_report uuid; v_message public.private_messages; v_details text; v_reason text:=left(btrim(coalesce(p_reason,'')),3000);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_message_id is null then raise exception 'Message is required'; end if;
  if char_length(v_reason)=0 then raise exception 'A report reason is required'; end if;
  select * into v_message from public.private_messages where id=p_message_id and (sender_id=v_user or recipient_id=v_user) limit 1;
  if not found then raise exception 'Message not found or not accessible'; end if;
  v_subject:=case when v_message.sender_id=v_user then v_message.recipient_id else v_message.sender_id end;
  v_details:=left('Message ID: '||v_message.id::text||E'\nMessage type: '||coalesce(v_message.message_type,'text')||
    case when coalesce(v_message.message_type,'text')='text' then E'\nReported message: '||left(coalesce(v_message.body,''),1200)
      when v_message.attachment is not null then E'\nReported attachment: '||coalesce(v_message.attachment->>'name','Attachment')
      else E'\nReported content: '||coalesce(v_message.message_type,'message') end||E'\nReporter notes: '||v_reason,3000);
  insert into public.spike_abuse_cases(reporter_id,subject_user_id,source,source_id,category,details,status,severity)
  values(v_user,v_subject,'message',p_message_id::text,'other',v_details,'open',1)
  on conflict(reporter_id,source,source_id) where source<>'room' and source_id is not null and status in ('open','reviewing') do nothing
  returning id into v_report;
  if v_report is null then select id into v_report from public.spike_abuse_cases where reporter_id=v_user and source='message'
    and source_id=p_message_id::text and status in ('open','reviewing') order by created_at desc limit 1; end if;
  if v_report is null then raise exception 'Message report could not be saved'; end if;
  return v_report;
end $$;
revoke all on function public.dm_report_message(uuid,text) from public,anon;
grant execute on function public.dm_report_message(uuid,text) to authenticated;
