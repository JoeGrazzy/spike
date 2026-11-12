-- Authenticated-only authorization for the shared global presence channel.
-- Client uses private:true, so both presence sync and tracking must be authorized.
drop policy if exists "spike global presence authenticated receive" on realtime.messages;
create policy "spike global presence authenticated receive"
on realtime.messages for select to authenticated
using (auth.uid() is not null and topic = 'spike-global-presence');

drop policy if exists "spike global presence authenticated publish" on realtime.messages;
create policy "spike global presence authenticated publish"
on realtime.messages for insert to authenticated
with check (auth.uid() is not null and topic = 'spike-global-presence');

notify pgrst, 'reload schema';
