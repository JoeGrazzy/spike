-- SPIKE private-message attachments: private Storage bucket and participant-only access.
-- Apply this migration to the Supabase project used by SPIKE before using media sharing.
-- Keep the legacy 'audio' message_type accepted for existing production rows.

alter table public.private_messages
  add column if not exists attachment jsonb;

-- Preserve any existing message_type values while explicitly allowing attachment messages.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.private_messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%message_type%'
  loop
    execute format('alter table public.private_messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.private_messages
  add constraint private_messages_message_type_media_check
  check (message_type is null or message_type in ('text', 'voice', 'audio', 'attachment'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-message-media',
  'private-message-media',
  false,
  52428800,
  null
)
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = null;

-- Object names are sender UUID / recipient UUID / random-name. Uploads must be
-- placed under the authenticated sender's first path segment.
drop policy if exists "SPIKE message media sender upload" on storage.objects;
create policy "SPIKE message media sender upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'private-message-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
);

drop policy if exists "SPIKE message media participant read" on storage.objects;
create policy "SPIKE message media participant read"
on storage.objects for select to authenticated
using (
  bucket_id = 'private-message-media'
  and exists (
    select 1
    from public.private_messages pm
    where pm.attachment ->> 'path' = storage.objects.name
      and (pm.sender_id = auth.uid() or pm.recipient_id = auth.uid())
      and pm.deleted_at is null
  )
);

drop policy if exists "SPIKE message media sender delete" on storage.objects;
create policy "SPIKE message media sender delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'private-message-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Attachment metadata is visible only to the two participants under the existing
-- private_messages table RLS policies. No public bucket or permanent public URLs.
