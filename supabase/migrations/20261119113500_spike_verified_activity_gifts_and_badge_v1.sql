-- Phase 35 extension: safely record settled gift events and verified badge state transitions.
begin;
create or replace function private.spike_log_verified_gift()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if new.status = 'settled' then
    perform private.spike_record_verified_activity(new.sender_id,'Sent a gift','social','spike_gift_events');
    perform private.spike_record_verified_activity(new.recipient_id,'Received a gift','social','spike_gift_events');
  end if;
  return new;
exception when others then return new;
end;
$$;
drop trigger if exists spike_verified_activity_gift on private.spike_gift_events;
create trigger spike_verified_activity_gift
after insert on private.spike_gift_events
for each row execute function private.spike_log_verified_gift();

create or replace function private.spike_log_verified_badge_change()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if old.is_verified is distinct from new.is_verified and new.is_verified is true and new.account_status='active' then
    insert into private.spike_verified_activity_events(user_id,event_type,category,source_table)
    values(new.id,'SPIKE Verified badge activated','membership','profiles');
  end if;
  return new;
exception when others then return new;
end;
$$;
drop trigger if exists spike_verified_activity_badge_change on public.profiles;
create trigger spike_verified_activity_badge_change
 after update of is_verified on public.profiles
 for each row execute function private.spike_log_verified_badge_change();
commit;
