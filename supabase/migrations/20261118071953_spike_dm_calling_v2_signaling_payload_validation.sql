-- Validate the WebRTC SDP and ICE JSON shapes at the database boundary.
alter table public.spike_dm_calls_v2
  add constraint spike_dm_calls_v2_offer_shape
  check (jsonb_typeof(offer) = 'object' and offer->>'type' = 'offer' and nullif(offer->>'sdp','') is not null);
alter table public.spike_dm_calls_v2
  add constraint spike_dm_calls_v2_answer_shape
  check (answer is null or (jsonb_typeof(answer) = 'object' and answer->>'type' = 'answer' and nullif(answer->>'sdp','') is not null));
alter table public.spike_dm_call_ice_v2
  add constraint spike_dm_call_ice_v2_candidate_shape
  check (jsonb_typeof(candidate) = 'object' and nullif(candidate->>'candidate','') is not null);
