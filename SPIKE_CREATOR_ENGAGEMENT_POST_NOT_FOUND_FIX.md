# SPIKE Fix — Creator engagement "Post not found" (P0001)

**Date:** 2026-11-08

## Symptom
Console warning:
```
[SPIKE creator engagement] view
{code: "P0001", message: "Post not found"}
```

## Cause
Feed visibility tracking calls `mutate_post_interaction(..., 'view')` via IntersectionObserver.
The RPC looks up `app_documents` where `collection_name='posts'` and `document_id=p_post_id`.
If the post was deleted, never existed under that id, or the client still holds a stale card, Postgres raises `P0001 Post not found`.

This is usually a **race / stale card**, not a broken like/comment pipeline.

## Fix
1. **Client** (`js/feed-runtime-04-2.js`): `recordCreatorEngagement` now
   - skips temp/local ids
   - skips posts already marked deleted in memory
   - treats "Post not found" as a quiet soft-fail for `view` and `share` (no console noise)
2. **Server** migration `20261108100000_mutate_post_interaction_soft_missing_post_v1.sql`:
   - for missing/deleted posts, `view` and `share` return `{"ok":false,"reason":"post_not_found"}` instead of raising
   - `like` / `reaction` / `comment` / `save` still raise `Post not found` (user-visible actions should fail clearly)

## Deploy
Apply the new migration to the Supabase project, then ship the updated `feed-runtime-04-2.js`.

## Optional deeper cleanup
- On realtime delete events, remove the post from `state.posts` immediately so the observer never fires
- Audit feed rows whose `id` is not `document_id` from `app_documents`
