-- Validate member-facing Room collaboration actions at the server boundary.
create or replace function public.room_announcement_create(p_room_id uuid,p_body text)
returns public.room_announcements language plpgsql security definer set search_path=public as $function$
declare r public.room_announcements; v_body text:=btrim(coalesce(p_body,''));
begin
 if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
 if v_body='' then raise exception 'Announcement cannot be empty'; end if;
 if length(v_body)>2000 then raise exception 'Announcement is too long'; end if;
 insert into public.room_announcements(room_id,created_by,body) values(p_room_id,auth.uid(),v_body) returning * into r;
 return r;
end; $function$;

create or replace function public.room_poll_create(p_room_id uuid,p_question text,p_options text[],p_ends_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public as $function$
declare v_poll uuid; v_opt text; v_i integer:=0; v_question text:=btrim(coalesce(p_question,''));
begin
 if not public.is_room_staff(p_room_id) then raise exception 'Only room staff can create polls'; end if;
 if v_question='' or length(v_question)>240 then raise exception 'Poll question must be between 1 and 240 characters'; end if;
 if coalesce(array_length(p_options,1),0)<2 or coalesce(array_length(p_options,1),0)>8 then raise exception 'A poll needs between two and eight options'; end if;
 if p_ends_at is not null and p_ends_at<=now() then raise exception 'Poll end time must be in the future'; end if;
 if exists(select 1 from unnest(p_options) o where btrim(coalesce(o,''))='' or length(btrim(o))>80) then raise exception 'Poll options must be between 1 and 80 characters'; end if;
 if (select count(distinct lower(btrim(o))) from unnest(p_options) o)<>array_length(p_options,1) then raise exception 'Poll options must be unique'; end if;
 insert into public.room_polls(room_id,created_by,question,ends_at) values(p_room_id,auth.uid(),v_question,p_ends_at) returning id into v_poll;
 foreach v_opt in array p_options loop v_i:=v_i+1; insert into public.room_poll_options(poll_id,label,sort_order) values(v_poll,btrim(v_opt),v_i); end loop;
 return v_poll;
end; $function$;

create or replace function public.room_event_create(p_room_id uuid,p_title text,p_description text,p_starts_at timestamptz,p_ends_at timestamptz default null)
returns public.room_events language plpgsql security definer set search_path=public as $function$
declare v public.room_events; v_title text:=btrim(coalesce(p_title,''));
begin
 if not public.is_room_staff(p_room_id) then raise exception 'Only room staff can create events'; end if;
 if v_title='' or length(v_title)>120 then raise exception 'Event title must be between 1 and 120 characters'; end if;
 if p_starts_at is null or p_starts_at<=now() then raise exception 'Event start time must be in the future'; end if;
 if p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'Event end time must be after its start'; end if;
 if length(coalesce(p_description,''))>1000 then raise exception 'Event description is too long'; end if;
 insert into public.room_events(room_id,created_by,title,description,starts_at,ends_at,ticket_price_minor)
 values(p_room_id,auth.uid(),v_title,coalesce(p_description,''),p_starts_at,p_ends_at,0) returning * into v;
 return v;
end; $function$;
