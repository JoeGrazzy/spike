# SPIKE Phase 4 — Messaging and voice-note audit

## Safe frontend correction

- Removed the non-functional microphone and recording-tray controls from `message.html`.
- Kept supported audio-file attachments through the existing private `chat-attachments` upload path and `messages.attachment_path` / `attachment_type` fields.
- Updated Help Centre copy so it describes audio-file attachments and clearly says live voice-note recording is not currently available.
- No database schema, RLS policy, storage bucket, or production data was changed.

## Messaging architecture observed in source

SPIKE currently has two separate direct-message implementations:

1. Main inbox and `message.html`: `conversations`, `conversation_members`, and `messages`, with membership checks, `last_read_at`, realtime inserts, and signed private attachment URLs.
2. Embedded room overlay in `js/spike-room-features.js`: `private_messages`, polled every 12 seconds, with sender/recipient columns and its own send/read semantics.

These are not interchangeable by assumption. Before consolidation, recover the complete migration history and inspect exact live column definitions, constraints, triggers, RLS policies, indexes, and any production rows. Then map every caller and decide how old messages, deletion, blocks, read receipts, realtime, and attachments migrate. Do not drop or rename either table until that plan is tested against a staging copy.

## Remaining technical work

- Implement a real voice-note recorder only after agreeing on audio format, maximum duration/size, upload path, message metadata, cancellation, permission-denial handling, and browser/device fallback.
- Verify the two messaging paths in a browser with two authenticated staging users; static tests cannot prove realtime delivery or RLS behavior.
- Recover all 18 remote migration definitions before preparing any schema change.

## Validation

`npm run check` is the required local regression gate for this phase. This phase changes frontend copy and controls only; it does not claim production deployment or live end-to-end verification.
