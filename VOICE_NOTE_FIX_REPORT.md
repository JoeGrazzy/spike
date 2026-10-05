# SPIKE Voice Note Fix — v1.2

## Current issue traced
After a voice note was successfully inserted into Supabase and rendered in the conversation, the composer still showed the recorded preview and its Send button. This allowed the same voice blob to be sent again.

## Exact root cause
The voice send path called `updateThread(data)` after the `private_messages` insert, but neither `message.html` nor `messages.html` defined an `updateThread()` function anywhere in the package.

Therefore the actual runtime chain was:

UI Send → MediaRecorder stop → final Blob → storage upload → `private_messages` INSERT succeeds → `upsertMessage()` succeeds → **`updateThread(data)` throws `ReferenceError: updateThread is not defined`** → execution jumps to `catch` → `cleanupRecording(true)` is never reached.

The database row could therefore exist and appear in the conversation while the composer preview remained alive. A subsequent tap of the still-visible Send button could submit the same `voiceBlob` again.

This matches the supplied screenshot: sent voice messages are visible while the voice preview/Send control remains in the composer.

## Fix
Added the missing authoritative `updateThread(message)` state updater to both message surfaces.

It:
- resolves the other participant from sender/recipient IDs;
- updates the existing conversation's latest message;
- creates a missing thread state when necessary;
- updates unread state for incoming messages outside the active conversation;
- re-renders the thread list.

The voice-send success ordering was also corrected:

`private_messages` INSERT → attachment INSERT → **clear voice preview/state** → non-critical local renderer/thread updates → success toast.

The preview is therefore cleared immediately after successful persistence and cannot remain as a reusable send payload because of a secondary UI-rendering failure.

## Files changed
- `message.html`
- `messages.html`
- `js/audit/tests/voice-note-send-cleanup-v4.test.mjs`
- `VOICE_NOTE_FIX_REPORT.md`

No Supabase migrations, RLS policies, RPCs, storage policies, triggers, or database functions were changed.

## Full traced path
UI voice controls
→ `voiceSend` / `voicePreviewSend`
→ `sendVoiceNote()`
→ `stopVoiceRecording(false,true)` when still recording
→ `MediaRecorder.stop()`
→ final `dataavailable` chunk
→ `finishVoiceRecording()`
→ Blob creation
→ MIME normalization
→ `uploadToSupabaseDmStorage()`
→ `dm-media` upload
→ `private_messages` INSERT
→ `private_message_attachments` INSERT
→ clear `voicePreview` / `voiceBlob`
→ `upsertMessage()`
→ `updateThread()`
→ `renderMessages()`
→ visible sent voice message

Realtime sender/recipient subscriptions remain deduplicated through `upsertMessage(message.id)`.

## Verification
Targeted voice-note suite: **12/12 passed**.

Covered:
- active recording Send action;
- stop → auto-send;
- final audio chunk;
- Blob creation;
- storage upload;
- normalized MIME;
- recipient identity;
- `private_messages` INSERT;
- attachment INSERT;
- renderer state;
- real thread updater presence;
- preview cleanup ordering.

Full project audit: **340 passed, 10 failed, 1 skipped**. The 10 failures are unrelated existing project audit failures. They were not hidden or changed to make this voice-note fix pass.

Live microphone capture against the user's production Supabase project cannot be performed in this offline verification environment, so actual device/network delivery remains the one layer requiring a live browser test.
