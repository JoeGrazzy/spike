# SPIKE media storage — Cloudinary

SPIKE's public-media upload service uses the Cloudinary cloud `vhmoz6a0` and upload preset `spike_present`. The storage split is documented in `STORAGE_ROUTING.md`.

## Browser integration

`js/spike-cloudinary-storage.js` exposes `window.SPIKE_CLOUDINARY`. `js/spike-media-routing.js` routes public profile media to Cloudinary and private message attachments to Supabase Storage. It supports:

- `uploadImage(file, { userId })` for JPEG, PNG, WebP, GIF, AVIF and HEIC images (10 MB maximum).
- `uploadVideo(file, { userId })` for MP4, WebM, MOV and OGG video (100 MB maximum).
- `upload(file, { userId, folder })` for supported images, video/audio, and common document/archive formats (10 MB maximum for raw files).

Each successful call returns Cloudinary's `secure_url`, `public_id`, resource type and media metadata. Store the returned secure URL/public ID in the appropriate Supabase application record; Supabase remains the database/auth/realtime service.

## Required Cloudinary dashboard settings

1. Confirm the `spike_present` upload preset exists under Settings → Upload.
2. Set it to **Unsigned** for direct browser uploads.
3. Restrict allowed formats and maximum file sizes in the preset to match the app's requirements.
4. Configure an upload folder policy if desired. The client requests folders under `spike/`.
5. Do not expose the Cloudinary API secret or use signed-upload credentials in frontend code.

## Important implementation boundary

The profile-photo and cover-photo pickers now upload to Cloudinary and save the returned secure URL to the authenticated user’s `profiles` row. The message attachment picker uploads to the private Supabase `chat-attachments` bucket and inserts a `messages` row. The current inbox and conversation controllers also hydrate membership-scoped message history and realtime updates. Attachments still require a valid conversation context, and a real signed-in browser test is required before declaring the upload paths production-verified.

The private `chat-attachments` bucket remains active for message files; its accepted MIME types are documented in `STORAGE_ROUTING.md`. The existing `post-media` and `room-media` buckets remain intact. Do not delete buckets until all remaining controllers and references have been migrated and verified.


## Verified account limits and preset

The configured account is `vhmoz6a0` and preset is `spike_present`. The user confirmed the preset is Unsigned. The connected account reports 10 MB maximum image and raw-file uploads and 100 MB maximum video uploads; the browser helper enforces those limits. A temporary provider-side upload test succeeded and the test asset was deleted. A deployed browser-side unsigned upload is still required for end-to-end verification.
