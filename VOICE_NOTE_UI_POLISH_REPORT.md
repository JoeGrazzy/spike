# SPIKE Voice Note UI Polish v1-3

## Root cause traced

The receiver-side voice message renderer used the browser's native `<audio controls>` UI directly inside the chat bubble. That made the control appearance browser/device dependent and produced the oversized, inconsistent mobile player shown in testing. The existing send/storage path was not replaced.

## Fix

Both `message.html` and `messages.html` now use one authoritative compact voice-message player:

- explicit, visible Play/Pause button
- compact duration display
- progress indicator
- native `<audio>` remains the actual playback engine, but its browser controls are hidden
- automatic pause/reset when another voice note starts
- ended playback resets to Play
- unavailable signed media is shown as unavailable rather than as a misleading playable control
- responsive sizing for mobile
- player binding is applied to initial render, appended realtime messages, and patched messages

## Files changed

- `message.html`
- `messages.html`
- `js/audit/tests/voice-note-player-ui-v1.test.mjs`

## Backend

No Supabase migrations, RPCs, RLS policies, storage policies, triggers, or table contracts were changed.

## Verification

Voice runtime tests: PASS.
Voice UI send tests: PASS.
Voice cleanup tests: PASS.
Voice stop/autosend tests: PASS.
Voice player UI tests: PASS.
Both message surfaces pass syntax checks.

Full audit: 342 passed, 10 failed, 1 skipped. The 10 failures are unrelated pre-existing project/audit failures; the protected-baseline test is expected to detect that this is a new derivative package rather than the protected baseline.

Live microphone/Supabase device delivery was not claimed because it cannot be executed from this offline test environment.
