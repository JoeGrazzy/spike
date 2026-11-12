-- Retire only the Realtime authorization policies created for experimental Room group calls.
-- Existing one-to-one DM call policies and all other Realtime policies are untouched.
drop policy if exists "spike room members can receive live call signaling" on realtime.messages;
drop policy if exists "spike room members can send live call signaling" on realtime.messages;
