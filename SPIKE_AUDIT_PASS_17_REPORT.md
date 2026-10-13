# SPIKE Audit — Pass 17: Inbox Typing Indicator Protocol Repair

## Finding
The Messages inbox subscribed to `spike:dm-typing:v1:<pair>` and expected `payload.user_id`, while the conversation page publishes typing events on `spike:dm:<pair>` using `{from,to,typing}`. Those protocols did not match, so the inbox typing preview could not receive the conversation page's typing broadcasts.

## Changes
- Aligned the inbox topic with the pair-scoped direct-message topic used by `message.html`.
- Aligned inbox validation with the existing `from` / `to` payload contract and private channel configuration.
- Added regression tests for topic and payload compatibility.
- Left protected `js/spike-dm-realtime-calls-v2.js` unchanged.

## Verification
Automated regression tests pass. Live multi-account Realtime behavior still requires an authenticated browser test.
