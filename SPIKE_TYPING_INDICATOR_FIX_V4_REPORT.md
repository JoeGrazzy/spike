# Spike Typing Indicator Fix V4

## Changes
- Fixed a misleading DM diagnostic: `stopTyping()` can run during normal channel setup. A stop request when no typing session is active now returns without reporting a blocked broadcast.
- Actual typing-start failures still emit a developer-console diagnostic (`Typing send unavailable`) rather than a user-facing popup.
- Added animated trailing dots to the existing DM and room typing labels, respecting reduced-motion preferences.
- Bumped the shared calls/Realtime script URL version to `v18` on the affected pages to help bypass stale browser cache.
- Did not change Supabase authorization policies or production data.

## Important verification note
The screenshot's `Channel subscribed` followed by `Broadcast blocked — no channel` is consistent with a stop/cleanup call made while no typing session is active; that message alone does not prove an actual typing-start broadcast failed. This patch corrects that false diagnostic. A real two-account live test is still required to confirm event delivery and authorization on the deployed Supabase project.
