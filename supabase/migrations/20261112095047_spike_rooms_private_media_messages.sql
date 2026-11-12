-- Private Room media storage and message attachment metadata.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('spike-room-media','spike-room-media',false,26214400,
 array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.room_message_attachments(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 message_id uuid not null references public.room_messages(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 mime_type text not null,
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=26214400),
 created_at timestamptz not null default now()
);
create index if not exists room_message_attachments_room_message_idx on public.room_message_attachments(room_id,message_id,created_at);
alter table public.room_message_attachments enable row level security;
drop policy if exists room_message_attachments_member_read on public.room_message_attachments;
create policy room_message_attachments_member_read on public.room_message_attachments for select to authenticated using(public.is_room_member(room_id));
revoke all on public.room_message_attachments from anon,authenticated;
grant select on public.room_message_attachments to authenticated;

drop policy if exists spike_room_media_member_read on storage.objects;
create policy spike_room_media_member_read on storage.objects for select to authenticated using(
 bucket_id='spike-room-media' and exists(select 1 from public.room_members m
 where m.room_id=case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end
 and m.user_id=auth.uid() and m.active=true));
drop policy if exists spike_room_media_member_upload on storage.objects;
create policy spike_room_media_member_upload on storage.objects for insert to authenticated with check(
 bucket_id='spike-room-media' and owner_id=auth.uid()::text and split_part(name,'/',2)=auth.uid()::text
 and exists(select 1 from public.room_members m where m.room_id=case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end
 and m.user_id=auth.uid() and m.active=true));
drop policy if exists spike_room_media_owner_delete on storage.objects;
create policy spike_room_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='spike-room-media' and owner_id=auth.uid()::text);

create or replace function public.room_public_send_media_message(
 p_room_id uuid,p_channel_id uuid,p_caption text,p_reply_to_id uuid,p_storage_path text,p_mime_type text,p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path=public,storage as $function$
declare v_uid uuid:=auth.uid(); v_message public.room_messages; v_caption text:=btrim(coalesce(p_caption,''));
 v_allowed constant text[]:=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4'];
begin
 if v_uid is null then raise exception 'Sign in to share media'; end if;
 if not public.is_room_member(p_room_id) then raise exception 'Active Room membership required'; end if;
 if not exists(select 1 from public.room_channels c where c.id=p_channel_id and c.room_id=p_room_id) then raise exception 'Invalid Room channel'; end if;
 if p_mime_type is null or not(p_mime_type=any(v_allowed)) then raise exception 'This media format is not supported'; end if;
 if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>26214400 then raise exception 'Media must be 25 MB or smaller'; end if;
 if p_storage_path is null or p_storage_path not like p_room_id::text||'/'||v_uid::text||'/%' then raise exception 'Invalid media location'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='spike-room-media' and o.name=p_storage_path and o.owner_id=v_uid::text) then raise exception 'Uploaded media could not be verified'; end if;
 if length(v_caption)>500 then raise exception 'Caption is too long'; end if;
 if p_reply_to_id is not null and not exists(select 1 from public.room_messages m where m.id=p_reply_to_id and m.room_id=p_room_id) then raise exception 'Reply target is invalid'; end if;
 if not public.room_rate_limit_check('media:'||p_room_id::text,8,60) then raise exception 'Media sharing rate limit exceeded'; end if;
 insert into public.room_messages(room_id,channel_id,user_id,body,reply_to_id)
 values(p_room_id,p_channel_id,v_uid,coalesce(nullif(v_caption,''),'Shared a media attachment'),p_reply_to_id) returning * into v_message;
 insert into public.room_message_attachments(room_id,message_id,uploaded_by,storage_path,mime_type,size_bytes)
 values(p_room_id,v_message.id,v_uid,p_storage_path,p_mime_type,p_size_bytes);
 return v_message.id;
end; $function$;
revoke all on function public.room_public_send_media_message(uuid,uuid,text,uuid,text,text,bigint) from public;
grant execute on function public.room_public_send_media_message(uuid,uuid,text,uuid,text,text,bigint) to authenticated;
