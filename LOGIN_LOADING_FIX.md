# SPIKE login loading fix

## Root cause found
The Feed page registered `window.SPIKE_HIDE_FEED_LOADER`, but the feed startup controller never called it. After a successful password login and redirect to `feed.html`, the full-screen feed loader could therefore remain visible indefinitely.

A second issue was that password sign-in, the initial session check, and the post-login MFA assurance check had no bounded wait at the login screen. A stalled network request could leave the sign-in button in its busy state without a useful recovery message.

## Changes
- Feed startup now releases the full-screen loader in a `finally` block on both success and failure.
- Missing platform services, session lookup failures, and feed startup failures now show a visible error state instead of leaving a permanent spinner.
- The initial auth lookup and feed load have bounded waits (12 and 18 seconds respectively).
- Password sign-in and login-page session/MFA checks have bounded waits and visible error feedback.
- Removed the old fallback that redirected directly to the Feed if the MFA assurance check failed. The app does not bypass MFA when its security check fails.

## Verification
- JavaScript syntax checks pass.
- Regression tests cover loader release, timeout behaviour, and no MFA bypass.
- Full automated test suite: 68 passed, 0 failed.

## Deployment note
This is a frontend source fix. It must be deployed to the website hosting SPIKE before users receive it. No Supabase database migration is required for this fix. After deployment, test sign-in on Android with both a normal account and an account with MFA enabled.
