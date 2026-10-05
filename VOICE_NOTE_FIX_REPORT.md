# SPIKE Voice Note Fix — v1.0

## Root cause
The active-recording stop branch in `message.html` and `messages.html` called:

`stopVoiceRecording(false)`

That explicitly left `autoSend` disabled. The existing recorder finalization and Supabase send pipeline already supported automatic sending, but the normal stop interaction never entered it.

## Fix
The active-recording branch now calls:

`stopVoiceRecording(false, true)`

This preserves the existing pipeline:

Record → MediaRecorder.stop() → final audio chunk → Blob → normalized MIME → `dm-media` upload → `private_messages` insert → attachment insert → renderer/update.

## Files changed
- `message.html`
- `messages.html`
- `js/audit/tests/voice-note-stop-autosend.test.mjs` (new regression test)
- `js/audit/protected-baseline.json` (intentional hashes for the two protected HTML changes)

No Supabase migrations, RLS policies, RPCs, storage policies, or backend functions were changed.

## Verification
Targeted voice-note tests: PASS.

Full `npm run check`: 336 passed, 10 failed, 1 skipped. The 10 failures are pre-existing project failures unrelated to this voice-note change; the protected-baseline audit already reports numerous unrelated baseline/hash mismatches in the supplied project.

Browser/device rendering and live Supabase delivery cannot be verified from this offline package test environment.

## Retrace verification — 2026-10-05

The voice-note path was traced again from both message surfaces. The authoritative path is:

UI Voice Send / Voice toggle stop → `stopVoiceRecording(false,true)` → `MediaRecorder.stop()` → final `dataavailable` chunk → `onstop` → `finishVoiceRecording()` → Blob → normalized MIME → `uploadToSupabaseDmStorage()` → `dm-media` → `private_messages` audio row → `private_message_attachments` row → `upsertMessage()` / `updateThread()` → `renderMessages()`.

A new regression test, `js/audit/tests/voice-note-ui-path.test.mjs`, now exercises the exact visible Send-button handler for both `message.html` and `messages.html`, including final audio data, upload, recipient, database rows, renderer state, and render invocation.

Targeted voice suite: 10/10 passed.

Full project audit after retrace: 338 passed, 10 failed, 1 skipped. The 10 failures are unrelated pre-existing project audit failures; the protected-baseline audit also reports pre-existing drift in the supplied package and was not caused by the voice-note retrace. No Supabase backend files were changed.

No live Supabase/browser microphone delivery was performed in this offline verification environment, so live device/network delivery remains the only unverified layer.
