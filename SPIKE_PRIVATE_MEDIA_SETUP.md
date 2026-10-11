# SPIKE private message media sharing

## Included
- One `+` button in `message.html` opens the media picker menu.
- Photo, video, audio/MP3, PDF/document, ZIP/RAR, and any-file picker categories.
- Selected-file name/type/size preview, remove selection, send, and retry after an error.
- Private Supabase Storage bucket, attachment metadata in `private_messages`, and participant-only storage reads.
- Existing text messages, voice notes, reactions, reply gestures, and call integration remain in place.

## Required before use
1. Apply `supabase/migrations/20261012100000_spike_private_message_media_v1.sql` to the same Supabase project used by SPIKE.
2. Deploy the updated `message.html` together with the rest of the existing site assets.
3. Test using two authenticated accounts: sender uploads each file type, recipient sees the attachment, and an unrelated third account cannot create a signed URL for it.

The page caps uploads at 50 MiB. The Storage bucket is private; the UI creates a five-minute signed URL only when a participant opens an attachment. The database migration is included but was not applied to the live Supabase project from this build process.

## Limitations
- Upload status reports upload and message-delivery phases, but the standard Storage upload call does not expose a reliable byte-by-byte progress callback here.
- A failed upload can be retried by tapping Send again. There is no separate abort-in-progress control yet.
- The archive has not been deployed, and real end-to-end uploads require applying the migration and testing with authenticated project accounts.
