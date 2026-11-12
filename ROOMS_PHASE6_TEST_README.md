# Testing SPIKE Rooms Phase 6

This archive contains the full SPIKE source tree with the Phase 6 Rooms replacement integrated.

- Entry page: `rooms.html`
- Room chat: `room.html?id=<room-uuid>`
- Frontend: `js/spike-rooms-v2.js`, `js/spike-room-v2.js`
- Styles: `css/spike-rooms-v2.css`
- Database migrations: `supabase/migrations/20261112094235_*.sql` through `20261112095047_*.sql`

The six migrations have already been applied to the connected SPIKE Supabase project used for this build. Do not reapply them manually to that same project. For another environment, apply the six files in timestamp order after confirming its existing SPIKE Room schema matches the protected baseline.

Run local automated checks from the project root:

```bash
npm test
node --check js/spike-rooms-v2.js
node --check js/spike-room-v2.js
```

No deployment is included. See `SPIKE_ROOMS_PHASE6_BUILD_REPORT.md` for scope, database verification, limitations, and the two-account test checklist.

## Current calling decision

The experimental multi-person Room voice/video calling feature has been removed. SPIKE retains its existing one-to-one direct-message voice/video calling system. The Rooms rebuild continues to provide free Room chat, membership, media messages, moderation, announcements, polls, and events.
