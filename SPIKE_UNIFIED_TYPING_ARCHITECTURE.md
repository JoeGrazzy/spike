# SPIKE Unified Typing Architecture v1

## Single source of truth

`js/spike-typing.js` is the only browser runtime allowed to publish or receive typing events. Chat pages call its public API; they must not create their own typing channels, listeners, timers, or database writes.

- Direct message: `SpikeTyping.startDM({ db, meId, peerId, input, anchor, displayName })`
- Room chat: `SpikeTyping.startRoom({ db, meId, roomId, channelId, input, anchor, displayName })`
- Inbox preview: `SpikeTyping.syncInbox({ db, meId, peerIds })`
- Input state: `SpikeTyping.setTyping(boolean)`
- Stop current composer: `SpikeTyping.stop()`

## Surfaces wired to the shared runtime

- `message.html`: one-to-one chat composer and recipient header indicator.
- `messages.html`: inbox preview for up to 24 currently displayed conversations.
- `room_chat.html`: public room composer, scoped to the selected room channel.
- `room.html`: owner-side room chat surface; normal members are redirected to `room_chat.html`.

## Transport and security

Typing state uses private Supabase Realtime Broadcast topics:

- `spike:typing:dm:<sorted-user-uuid>:<sorted-user-uuid>`
- `spike:typing:room:<room-uuid>:<channel-uuid>`

The database migration adds two narrowly scoped policies on `realtime.messages`: authenticated participants can receive and send Broadcast events only when DM permission checks pass or they are active members/owners of the exact room and channel. Existing call, global-presence, notification and social policies are preserved.

No typing rows are stored in `private_messages`, `room_messages`, or a new table. Events expire after roughly 4.2 seconds, send heartbeats while the user continues typing, and stop on idle, blur, channel change, or page exit.

## Anti-duplication contract

- One shared runtime file and one CSS file.
- One Broadcast receive handler and one Broadcast send implementation.
- Channel instances are keyed by the canonical topic and reused on repeated activation.
- Re-activating the same conversation with the same input does not attach another listener.
- Inbox subscriptions are reconciled to the visible peer list and capped at 24.
- Do not add page-specific typing logic or a second typing service. Extend this runtime instead.

## Deployment requirement

The client requests private channels (`config.private: true`). In Supabase Dashboard, verify **Realtime → Settings → Allow public access** is disabled; Supabase documents this as required to enforce private-channel authorization. The project settings tool available during this build did not expose that toggle, so this setting has not been independently verified here.

## Verification status

- Shared runtime passes `node --check`.
- All inline scripts in the four integrated pages pass `node --check`.
- Runtime harness confirms repeated activation reuses one channel and one listener, and start/stop emits one broadcast each.
- Live Supabase migration applied and the two new policies were queried back successfully.
- A real two-account browser test is still required to confirm the full end-to-end display in deployed clients.
