# SPIKE Room Chat — Unified V1 Rebuild

## Scope

The actual live conversation screen is `room_chat.html`. This rebuild replaces its accumulated page-specific styling with one final authority: `css/spike-room-chat-next.css`.

## Legacy visual layers retired

- Removed the eight old inline room-chat style overrides from `room_chat.html`.
- Removed the `room-chat-core.css` and `room-chat-premium-v4.css` stylesheets from the project after verifying they had no other active page consumers.
- Removed all links to the old room-chat core/V4/V5 visual stack from `room_chat.html`.
- Recorded the retired core/V4 files and SHA-256 hashes in `js/audit/cleanup-manifest.json`.
- Kept `room-chat-premium-v5.css` in the project because `room.html` and `rooms.html` still use it; it is not loaded by `room_chat.html`.

## Rebuilt presentation

- Theme-token-driven page shell, header, channel bar, community banner, and conversation timeline.
- Distinct sender identity, grouped messages, readable bubbles, reactions, reply context, and read receipts.
- Unified composer with safe-area padding, mobile keyboard-aware viewport support, and narrow-screen sizing.
- Redesigned drawers, member/profile panels, menus, action sheets, and confirmation/report/delete overlays.
- Mobile bottom-sheet behavior, reduced-motion support, and forced-colors fallback.

## Preserved runtime contracts

No Supabase schema, migrations, RLS, RPC definitions, or live database records were changed. Existing room routing, authentication/session handling, `room_public_send_message`, message reads/deletes, reactions, pins, membership, moderation, realtime subscriptions, presence, shared typing runtime, dialogs, and call integration remain in `room_chat.html`.

## Verification

- All 9 inline scripts in `room_chat.html` pass `node --check`.
- New room-chat rebuild tests pass.
- CSS block delimiters are balanced.
- The old room-chat stylesheet links and eight old inline style IDs are absent from `room_chat.html`.
- Full project test suite still reports pre-existing failures in unrelated global theme, onboarding, notification, and protected-baseline files. The optional browser accessibility audit remains skipped because its browser dependencies are unavailable.
- No live authenticated browser session was available, so realtime and multi-account behavior still require deployment testing.
