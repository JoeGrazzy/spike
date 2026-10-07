# SPIKE Rooms Simplification — 2026-10-06

## Root cause
Rooms had accumulated multiple competing user-facing surfaces and feature centers: a four-tab directory, a separate trending strip, creator as a primary destination, Room Moments, two wallet/commerce entry points, a premium font composer control, and a large secondary menu containing 18 actions. This was frontend complexity; the Room backend contracts were retained.

## Changes
- Rooms directory is now one primary list with search.
- Discover / Joined / My Rooms / Creator tabs were removed from the primary navigation.
- Trending strip was removed from the primary Rooms surface.
- Room creation remains one clear action; creator qualification is shown contextually only when creation is attempted and access is restricted.
- Canonical member path remains `rooms.html -> room_chat.html`.
- Owner management remains in `room.html`; ordinary members continue directly to `room_chat.html`.
- Removed Room Moments from the Room surface.
- Removed Shop and SPIKE Wallet/Gems buttons from Room chat.
- Removed the premium Font Pack button/bootstrap from the Room composer. Existing persisted message styles remain renderable for compatibility.
- Reduced the Room menu to Search, People, Channels, Rules, Share, Moderation, and Rooms.
- Removed unused Room-only UI handlers for the retired menu features and their poll/event drawer realtime refresh paths.
- Added `rooms-simplification.test.mjs` to prevent regression of the simplified Room contract.
- Updated the protected baseline hashes only for the intentionally modified Rooms pages. Supabase migration files remain unchanged.

## Preserved
- `rooms_list`
- Room Account RPCs
- `room_create`
- `room_members`
- `room_channels`
- `room_messages`
- realtime chat/presence
- reactions, replies, saves, pins, reports, profiles
- server-side moderation RPCs
- RLS/security and all existing migrations
- owner management path

## Verification
- 388 audit tests discovered
- 387 passed
- 0 failed
- 1 skipped (optional live browser/WCAG audit; browser dependencies unavailable)
- Inline JavaScript syntax checks: passed for `rooms.html`, `room_chat.html`, and `room.html`
- `npm run check`: passed
- Production HTML count: 22
- CSS count: 43
- JS count: 38
- Supabase migrations: 74

## Known next cleanup
The Rooms UI no longer uses the old tab/trending/font selectors, but some historical CSS declarations still exist as dead compatibility styling. They should be removed only after a computed-style/authority trace of the Room stylesheet stack.
