# SPIKE private message media sharing

## Included
- One `+` button in `message.html` opens the media picker menu.
- Photo, video, audio/MP3, PDF/document, ZIP/RAR, and any-file picker categories.
- Selected-file name/type/size preview, remove selection, send, and retry after an error.
- Private Supabase Storage bucket, attachment metadata in `private_messages`, and participant-only storage reads.
- Existing text messages, voice notes, reactions, reply gestures, and call integration remain in place.

## Required before use
1. The missing `attachment` column and private media bucket/policies have now been applied to the connected Supabase project. The migration file is kept in sync for reproducible setup and preserves existing `audio` message types.
2. Deploy the updated `message.html` together with the rest of the existing site assets.
3. Test using two authenticated accounts: sender uploads each file type, recipient sees the attachment, and an unrelated third account cannot create a signed URL for it.

The page caps uploads at 50 MiB. The Storage bucket is private; the UI creates a five-minute signed URL only when a participant opens an attachment. The schema migration was applied to the connected Supabase project during this repair. The updated website assets still need to be deployed, and end-to-end attachment sharing still needs a two-account test.

## Limitations
- Upload status reports upload and message-delivery phases, but the standard Storage upload call does not expose a reliable byte-by-byte progress callback here.
- A failed upload can be retried by tapping Send again. There is no separate abort-in-progress control yet.
- The archive has not been deployed, and real end-to-end uploads require applying the migration and testing with authenticated project accounts.
