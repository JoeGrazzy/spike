# SPIKE Admin Incremental Repair

Date: 2026-11-11

## Source changes
- Added offset-based user directory paging (50 visible rows; 51st row determines whether a next page exists), with page reset on search/filter changes and explicit request-failure messaging.
- Added saved maintenance-setting load before edit, reload control, save-state handling, and fail-closed editing when saved settings cannot be read.
- Added editing of existing prohibited terms using the existing `admin_spike_policy_term_upsert(p_id, ...)` contract, including enabled state, locale and notes.
- Improved shared modal keyboard behavior with Escape handling, focus trapping, initial focus and focus restoration.
- Changed shared table rendering to distinguish failed/malformed responses from genuine empty results; corrected key loaders to preserve null failure state.
- Preserved existing admin authorization guard and server-side privileged RPC/Edge Function paths.

## Verification
- Inline JavaScript syntax checks: passed.
- Full repository automated suite: 632 discovered; 631 passed, 0 failed, 1 skipped (optional browser accessibility audit unavailable without Playwright/browser dependencies).
- Live authenticated browser workflows and production write operations were not run from this offline archive-editing session. Maintenance table read access must be confirmed in the authenticated super-admin session.
