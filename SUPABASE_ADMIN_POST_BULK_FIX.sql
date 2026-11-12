-- SPIKE Admin Post Command Center
-- Fix for: column d.id does not exist
-- app_documents identifies posts with document_id; deleted state is stored in data.deleted.

create or replace function public.admin_post_bulk_action(p_post_ids text[], p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
  v_id text;
begin
  perform public.admin_guard();

  if p_post_ids is null or coalesce(array_length(p_post_ids,1),0) = 0 then
    raise exception 'No posts selected';
  end if;
  if array_length(p_post_ids,1) > 100 then
    raise exception 'Maximum 100 posts per bulk action';
  end if;

  if p_action = 'delete' then
    foreach v_id in array p_post_ids loop
      update public.app_documents d
         set updated_at = now(),
             data = coalesce(d.data,'{}'::jsonb)
                    || jsonb_build_object(
                         'deleted', true,
                         'moderation', coalesce(d.data->'moderation','{}'::jsonb)
                           || jsonb_build_object(
                                'action','delete',
                                'reason',coalesce(p_reason,''),
                                'at',now(),
                                'by',auth.uid()
                              )
                       )
       where d.collection_name = 'posts'
         and d.document_id = v_id
         and not coalesce((d.data->>'deleted')::boolean,false);
      v_count := v_count + case when found then 1 else 0 end;
    end loop;
  elsif p_action = 'restore' then
    foreach v_id in array p_post_ids loop
      update public.app_documents d
         set updated_at = now(),
             data = coalesce(d.data,'{}'::jsonb)
                    || jsonb_build_object('deleted', false)
       where d.collection_name = 'posts'
         and d.document_id = v_id
         and coalesce((d.data->>'deleted')::boolean,false);
      v_count := v_count + case when found then 1 else 0 end;
    end loop;
  else
    foreach v_id in array p_post_ids loop
      perform public.admin_post_action(v_id, p_action, p_reason);
      v_count := v_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'requested', array_length(p_post_ids,1),
    'affected', v_count
  );
end;
$function$;

revoke all on function public.admin_post_bulk_action(text[],text,text) from public, anon;
grant execute on function public.admin_post_bulk_action(text[],text,text) to authenticated;
