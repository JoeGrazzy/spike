# SPIKE Source Audit — Pass 5

## Scope

This pass continues from the three-theme platform archive and the Pass 4 source package. It targets one concrete Feed media reliability issue while respecting the protected-file baseline.

## Finding

`cloudinaryFeedImageUrl()` in `js/feed-runtime-04-2.js` constructs a Cloudinary transformation URL. The Feed thumbnail markup does not retain a separately addressable original asset URL, and failed transformed images have no one-time retry using the untransformed asset. This can make a transformation/delivery problem appear identical to a missing or invalid uploaded asset.

## Change made

- Added `js/spike-feed-image-fallback-v1.js` as an isolated compatibility layer.
- Added a script reference in `feed.html`.
- On a failed image within `#posts .post-media`, the sidecar recognizes only HTTPS Cloudinary image URLs with a known transformation segment, removes that segment, and retries the resulting original delivery URL once.
- It does not alter stored URLs, upload behavior, video URLs, database policies, or backend configuration.
- The protected `js/feed-runtime-04-2.js` and `js/feed-runtime-04-3.js` files were restored from the original platform archive and left unchanged.
- Added `js/audit/tests/feed-image-original-fallback.test.mjs`, covering URL reconstruction, unsafe/unrecognized URL rejection, Feed-only scope, and one-time fallback behavior.

## Verification

- `node --check js/spike-feed-image-fallback-v1.js`: passed.
- Focused fallback tests: 4 passed, 0 failed.
- Full automated suite: 487 discovered, 486 passed, 0 failed, 1 skipped.
- The protected baseline test passed as part of the full suite; no protected baseline file was modified.

## Still unverified

- No live Cloudinary asset URL was supplied, so the fallback has not been verified against a real failed asset or network response.
- No production site was accessed or deployed.
- Browser visual checks, mobile checks, and two-account realtime messaging checks remain outstanding.
- The fallback is intentionally limited to Feed image thumbnails. The image viewer's transformed URL, video delivery, upload flows, and stored asset validity require separate targeted tests.

## Next audit targets

1. Messaging inbox unread aggregation is currently based on the latest 500 messages returned by the inbox query. This can undercount older unread messages or omit older conversations when message volume is high. Evaluate a server-side per-conversation summary/RPC before changing the schema.
2. Verify typing indicator cleanup on recipient changes, blur, disconnect, and reconnect using two signed-in accounts.
3. Run browser-based checks across all three themes, especially nested menu surfaces, contrast, focus, and mobile safe areas.
4. Inspect auth/RLS/Edge Function behavior against a staging schema; do not apply migrations without approval.
5. Verify store/Paystack, notification, upload, and delivery flows in staging.

## Status

This pass adds a narrow client-side fallback and tests. It is not a full semantic audit of every JS/CSS/HTML file and is not a production deployment.
