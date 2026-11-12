# SPIKE Audit — Pass 18: Cloudinary Original-URL Fallback

## Finding
The one-shot image fallback removed only the first recognized Cloudinary transformation segment. URLs that chained transformation segments with slashes could retain later transformation segments and still fail to load.

## Changes
- Updated the parser to remove consecutive path segments made entirely of recognized transformation tokens.
- It stops at the first non-transformation segment, preserving version, folder and asset segments.
- The fallback remains HTTPS-Cloudinary-only, restricted to Feed post media, and limited to one attempt per image.
- Extended the parser regression test with chained transformations.
- Left protected `js/feed-runtime-04-2.js` unchanged.

## Verification
Feed fallback regression tests pass. No live Cloudinary URLs were fetched during this audit.
