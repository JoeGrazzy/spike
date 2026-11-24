-- Re-label newly inserted pending relationship notifications as friend requests.
-- Keep the trigger's other social/message notification branches unchanged.
do $migration$
declare
  v_definition text;
  v_old text := 'v_type := ''follow_request''; v_title := ''Follow request''; v_body := ''requested to follow you.'';';
  v_new text := 'v_type := ''friend_request''; v_title := ''Friend request''; v_body := ''sent you a friend request.'';';
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='emit_social_notification'
  order by p.oid desc limit 1;
  if v_definition is null then
    raise exception 'private.emit_social_notification() was not found';
  end if;
  if position(v_old in v_definition)=0 then
    if position(v_new in v_definition)>0 then
      return;
    end if;
    raise exception 'Expected follow-request notification branch was not found; refusing to replace function';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;
