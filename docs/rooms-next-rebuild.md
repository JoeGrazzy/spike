# SPIKE Rooms Next

The Rooms Next visual layer is shared by `rooms.html` (discovery) and `room.html` (room owner/management view). It is delivered as `css/spike-rooms-next.css` and loaded after each page's existing theme and page styles.

## Existing route contract preserved

- `rooms.html` is the Rooms discovery, create, and join hub.
- `room.html` is the room owner/management and overview route. Non-owner users are redirected to the chat route by its existing boot guard.
- `room_chat.html` is the live conversation route used by the existing join/open flows.

## Existing backend contracts preserved

- Room creation continues through `room_create`.
- Room membership continues through the existing `room_members` insert and server-side database behavior.
- Messages continue through `room_send_message`.
- Existing Supabase initialization, room-account RPCs, creator qualification, image storage, realtime subscriptions, and membership checks were not replaced.

## Verification

- `room.html` inline scripts: Node syntax check passed.
- `rooms.html` inline scripts: Node syntax check passed.
- Local stylesheet/script references on both pages: no missing local references.
- New Rooms Next integration tests: 3 passed.
- Full project suite: 648 passed, 10 failed, 1 skipped. The same 10 existing failures were present before these changes in the supplied clean project; they concern global theme/onboarding/notifications and protected-baseline checks, not the two edited pages. The optional browser audit remains skipped because its browser dependencies are not installed.

No Supabase schema, migration, RLS policy, or live database data was changed.
