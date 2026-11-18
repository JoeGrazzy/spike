# SPIKE storage routing

## Provider responsibilities

- **Cloudinary** (`vhmoz6a0`, unsigned preset `spike_present`): public-facing profile photos and cover images, plus the shared `SPIKE_MEDIA.uploadPublic()` helper for future public feed media. Cloudinary performs image/video delivery and transformations.
- **Supabase Storage**: private user files that must be authorized by Supabase Auth and Storage RLS. Direct-message attachments use the private `chat-attachments` bucket.
- **Supabase Database**: stores ownership and references; it does not store file bytes.

## Implemented browser flows

### Profile photos and covers

`profile.html` loads `js/spike-media-routing.js`. The avatar and cover file pickers upload images to the established Cloudinary folder pattern `spike/profiles/<user-id>`, matching the existing SPIKE profile assets. The resulting HTTPS `secure_url` is written to `profiles.avatar_path` or `profiles.cover_path` for the authenticated owner. The visible image updates after the database write succeeds. The user cannot update another account's profile image through this handler.

### Private direct-message attachments

`message.html` loads the same router. The attachment picker uploads to the private Supabase `chat-attachments` bucket at `<user-id>/<conversation-id>/<random-file-name>`. The file is then referenced by a `messages` row using `attachment_path` and `attachment_type`. The insert is protected by the existing `messages_insert_member` RLS policy; Storage upload/read policies also require the owner's user-id path or conversation membership. The browser creates a short-lived signed URL for the newly sent attachment. The DM page expects the conversation UUID in `?conversation_id=<uuid>` (also accepts `conversation`, `thread`, or `id`); the archive does not currently include a complete messages-list controller that guarantees this route parameter.

The bucket is private, has a 50 MB file-size limit, and now allows images, MP4, supported audio, PDF, common office documents, text/CSV/JSON, and ZIP/RAR/7z archives. APK and executable uploads are intentionally excluded.

## Shared API for future controllers

- `window.SPIKE_MEDIA.uploadPublic(file, { userId, folder })` — Cloudinary public media.
- `window.SPIKE_MEDIA.uploadPrivate(file, { userId, conversationId, bucket: 'chat-attachments' })` — private chat file upload.
- `window.SPIKE_MEDIA.createPrivateUrl(path, { bucket: 'chat-attachments', expiresIn: 300 })` — short-lived URL for an authorized private file.

## Dashboard requirements and limits

1. Confirm the Cloudinary `spike_present` preset exists and is configured as **Unsigned**. Restrict formats and upload size in Cloudinary. Never add the Cloudinary API secret to browser code.
2. Keep the Supabase `chat-attachments` bucket private and preserve its RLS policies. The storage path must keep the authenticated user ID as its first segment.
3. Existing `post-media` and `room-media` buckets are retained; they are not deleted or repurposed by this change.

## Verification boundary

The ZIP's source does not contain a complete feed-post upload controller or a complete message history loader. This change wires the existing profile pickers and the message attachment picker/send path; it does not claim feed publishing, room media, text-only DM sending, message-history hydration, or every attachment preview across old messages is complete. A browser-level upload requires a real signed-in test account and an unsigned Cloudinary preset configured in the Cloudinary dashboard.


## Cloudinary account verification (18 November 2026)

The connected Cloudinary account matches the project configuration (`vhmoz6a0` / `spike_present`). Existing assets were found in `spike/profiles`, `spike/posts`, and `spike/stories`. The user confirmed that `spike_present` is configured as an unsigned preset. A temporary 1×1 PNG upload using the preset was accepted by the connected Cloudinary account and then deleted. This confirms the account/preset upload path at the provider-tool level; it does not replace a real browser-side unsigned upload test from the deployed SPIKE origin.

## Feed post media publishing (new)

The feed now loads `js/spike-post-publisher.js`, which exposes `window.SPIKE_POSTS` for the future Signal Studio/publishing UI. It deliberately uses the existing private Supabase `post-media` bucket rather than Cloudinary: the database's `post_media.object_path` and storage RLS rules are designed around private per-post objects.

- Creates a `posts` row first using the authenticated user's ID and the existing `visibility`, `comments_enabled`, and `status` columns.
- Uploads each selected image/video/audio file to `post-media` at `<user-id>/<post-id>/<unique-name>`.
- Inserts `post_media` rows using the existing `owner_id`, `object_path`, `media_type`, `mime_type`, `byte_size`, and `position` columns.
- Provides `createMediaUrls()` to create short-lived signed URLs for rendering private media.
- On a failed upload or media-row insert, attempts to remove uploaded objects and delete the newly created post.

The current publisher deliberately caps each file at 6 MB. Supabase recommends resumable/TUS uploads for files larger than 6 MB; raising this limit before adding resumable transport would make mobile uploads less reliable. The existing Feed build also contains a feature-removal guard that removes the post composer and states that Signal Studio owns publishing. Therefore this release ships and tests the publishing service, but does not reactivate a composer or claim that a user-facing post-publish flow is complete. The service must be called by the approved Signal Studio UI when that UI is restored.
