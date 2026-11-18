CREATE OR REPLACE FUNCTION public.spike_guard_private_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_path text;
  v_size bigint;
  v_mime text;
begin
  if current_user in ('postgres','service_role') then
    return new;
  end if;

  if v_uid is null or new.sender_id is distinct from v_uid
     or new.recipient_id is null or new.recipient_id=v_uid then
    raise exception 'Invalid private message sender or recipient' using errcode='42501';
  end if;

  if not public.can_message_spike_user(v_uid,new.recipient_id) then
    raise exception 'This user is not accepting messages' using errcode='42501';
  end if;

  if new.message_type not in ('text','attachment','voice','audio') then
    raise exception 'Unsupported private message type';
  end if;

  if char_length(coalesce(new.body,'')) > 2100000 then
    raise exception 'Private message is too large';
  end if;

  if new.message_type='text' and char_length(coalesce(new.body,'')) > 10000 then
    raise exception 'Text messages are limited to 10000 characters';
  end if;

  if new.message_type='attachment' then
    v_path := new.attachment->>'path';
    v_size := nullif(new.attachment->>'size','')::bigint;
    if jsonb_typeof(new.attachment) <> 'object'
       or v_path is null
       or v_path not like new.sender_id::text || '/' || new.recipient_id::text || '/%'
       or coalesce(v_size,0) < 1
       or v_size > 52428800
       or char_length(coalesce(new.attachment->>'name','')) > 255
       or char_length(coalesce(new.attachment->>'mime_type','')) > 255
       or coalesce(new.body,'') <> '' then
      raise exception 'Invalid private attachment metadata';
    end if;
  end if;

  if new.message_type='voice' then
    if coalesce(new.body,'') like 'data:audio/%' then
      null;
    else
      v_path := new.attachment->>'path';
      v_size := nullif(new.attachment->>'size','')::bigint;
      v_mime := lower(coalesce(new.attachment->>'mime_type',''));
      if jsonb_typeof(new.attachment) <> 'object'
         or v_path is null
         or v_path not like new.sender_id::text || '/' || new.recipient_id::text || '/%'
         or coalesce(v_size,0) < 1
         or v_size > 12582912
         or v_mime not like 'audio/%'
         or char_length(coalesce(new.attachment->>'name','')) > 255
         or coalesce(new.body,'') <> '' then
        raise exception 'Invalid voice message payload';
      end if;
    end if;
  end if;

  new.read := false;
  new.deleted_at := null;
  new.edited_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$function$;
