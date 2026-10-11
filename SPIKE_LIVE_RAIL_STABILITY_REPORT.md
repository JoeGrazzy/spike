# SPIKE Live Rail Stability Fix

Date: 2026-10-11

## Reported issue
The Live on SPIKE rail appeared in one Feed screenshot but was absent in another, shifting the content beneath the header.

## Root cause found
`js/spike-feed-live.js` hid the entire `#spikeFeedLive` section whenever the live-stream query returned zero rows or a request failed. This made the live rail's presence depend on the result of a network request, causing layout movement and a visible flash on transient failures.

## Changes made
- The Live rail remains mounted and visible as a stable Feed section, including when there are currently no live broadcasts.
- Empty live-stream results clear only the list of stream cards, not the rail/header/actions.
- Transient request errors no longer hide the rail or erase the last successful list.
- A monotonically increasing request sequence prevents older overlapping responses from replacing newer results.
- Added regression tests for persistent rail visibility, error-state preservation, DOM placement, and out-of-order request protection.
- Updated the protected baseline for the intentional source/test changes.

## Verification
`npm run check`: PASS
- 463 passed
- 0 failed
- 1 optional browser accessibility test skipped because Playwright/browser dependencies are unavailable.

## Limitations
This fixes the identified client-side hide/show cause. A literal guarantee of never flashing under all circumstances is not possible without testing the live deployment and its network/authentication environment. No production hosting or live Supabase configuration was changed. The fix must be deployed and checked on the target device.
