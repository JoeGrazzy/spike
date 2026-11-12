# SPIKE — DM Attachment Viewer v2 refinement

**Date:** 12 November 2026  
**Base:** `SPIKE_DM_ATTACHMENT_VIEWER_V1.zip`  
**Scope:** `message.html` long-press message menu and direct attachment download.

## Implemented

- Replaced the hard-coded purple/black long-press menu styling with SPIKE theme tokens (`--spike-surface`, `--spike-surface-2`, `--spike-line`, `--spike-text`, `--spike-muted`, and `--spike-accent`). The menu now follows the active theme palette and retains accessible focus states, responsive layout, safe-area spacing, blur and subtle motion.
- Rebuilt long-press detection around Pointer Events. A press opens the message menu after 520 ms only while the pointer remains within a 12 px movement tolerance. Movement cancels the timer, preserving scrolling and horizontal swipe-to-reply. Pointer cancellation clears the gesture state; desktop context-menu access remains supported.
- Separated download from preview URL creation. The viewer's top-right download control now creates a short-lived signed URL with `download: filename` directly from the authenticated message attachment metadata and immediately triggers the browser download. It does not wait for `dmViewerUrl`, image loading, video metadata, or media decoding.
- Kept participant authorization checks, deleted-message rejection, private bucket selection, legacy `dm-media` compatibility, original filename, and all existing preview behavior.

## Verification

- DM attachment viewer regression tests: **6 passed, 0 failed** (including new theme-aware long-press and preview-independent download checks).
- All inline JavaScript blocks in `message.html`: `node --check` passed.
- No database migration or Supabase policy change is required; this is a frontend-only refinement.
- Physical Android/iOS browser testing is still required to confirm browser-specific download handling and touch feel.
