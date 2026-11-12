-- Fix Room joins failing because the shared gamification trigger evaluated
-- NEW.collection_name while NEW belonged to room_members.
-- Keep the app_documents-only field access inside its table-specific branch.
create or replace function public.trg_spike_gamification_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if TG_TABLE_NAME='private_messages' then
    perform public.spike_gamification_evaluate(new.sender_id);
  elsif TG_TABLE_NAME='room_messages' then
    perform public.spike_gamification_evaluate(new.user_id);
  elsif TG_TABLE_NAME='comments' then
    perform public.spike_gamification_evaluate(new.user_id);
  elsif TG_TABLE_NAME='app_documents' then
    if new.collection_name='posts' then
      perform public.spike_gamification_evaluate(new.owner_id);
    end if;
  elsif TG_TABLE_NAME='room_members' then
    perform public.spike_gamification_evaluate(new.user_id);
  end if;
  return new;
end
$function$;
