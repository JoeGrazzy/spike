# SPIKE Rooms — Existing Calling System Only Build

This source build removes the experimental multi-person Room voice/video calling implementation and its Metered TURN integration. It preserves SPIKE's existing direct-message calling system and the rest of the Rooms feature set.

## Validation
- `npm run check` — passed (638 passed, 0 failed, 1 skipped).
- The original direct-message call controller and shared Supabase singleton match the protected baseline hashes.
- Room group-call UI, runtime, ICE loader, source mirror, and Room-call authorization migration files are absent.

## Important
This ZIP is a source/test build, not a website deployment. The Supabase Room-call authorization policies have been rolled back. The Metered Edge Function now returns HTTP 410; Metered secrets still require manual removal in the Supabase Dashboard because secret deletion is not exposed by the available management interface.
