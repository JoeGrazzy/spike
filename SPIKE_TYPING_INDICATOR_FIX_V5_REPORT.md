# SPIKE Typing Indicator Lifecycle Fix V5

## Scope

This patch addresses the known direct-message channel lifecycle warning and the room typing broadcast path. It does not claim production verification because the live Cloudflare deployment and two authenticated sessions are not accessible from this build environment.

## Changes

- Direct messages: added a monotonically increasing channel generation token; stale subscription callbacks and incoming events from replaced channels are ignored.
- Direct messages: invalidate the old channel and readiness state before awaiting channel removal, including session activation/deactivation paths.
- Direct messages: keep sends gated on the current subscribed channel, inspect Supabase broadcast status objects as well as string statuses, and keep failures in the developer console rather than the customer UI.
- Direct messages: render an accessible animated three-dot typing indicator with safe DOM nodes instead of a plain text-only label.
- Room chat: use `channel.send({type:'broadcast', event:'typing', payload})` for typing; remove the `httpSend` typing branch.
- Room chat: track `presenceReady` and a generation token so typing sends only after subscription and stale channel callbacks cannot mutate the current room's typing state.
- Room chat: render the same animated three-dot indicator and clear it through existing timeout/typing-stop behavior.
- Bumped the direct-message script URL to `v16` to avoid stale browser cache reuse.
- Added/updated focused regression tests and refreshed hashes for the three intentionally modified files in the protected-baseline manifest.

## Verification

- `npm run check`: 483 passed, 0 failed, 1 skipped (484 total).
- `node --check` on the DM typing/call JavaScript: passed.
- Inline JavaScript syntax in `message.html` and `room_chat.html`: passed (all inline script blocks checked).
- ZIP integrity: checked after packaging.

## Deployment and live verification still required

This archive has not been deployed to Cloudflare, and the Supabase migration has not been applied to the live database by this task. After deployment, test both directions in DMs and room chat. Confirm a typing event is sent, received by the other account, and rendered, then confirm it clears after typing stops or a message is sent. If delivery still fails, use console-only logs to identify subscription authorization versus broadcast delivery. No diagnostic popup should be shown to ordinary users.
