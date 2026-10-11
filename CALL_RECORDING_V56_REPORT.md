# SPIKE Recording UI v56 — Change and Verification Report

## Changes in this package

- Replaced the verbose remote recording notice with a compact, persistent in-call indicator identifying the other participant and whether audio or video-and-audio recording is active.
- Styled the indicator as a discreet pill with a recording dot; it remains visible while the remote recording session is active and updates when that session stops or fails.
- Updated the local call hint to describe the discreet indicator rather than a prominent notification.
- Kept the recording-status signaling and acknowledgement handshake so recording does not begin until the other call client has received the disclosure.
- Preserved the separate business-meeting flow requiring explicit approval from both participants.
- Bumped the canonical call-runtime cache key to v14 on pages that load it.
- Updated the focused recording regression test to assert the discreet indicator behavior.

## Verification

- Focused recording tests: 4 passed, 0 failed.
- JavaScript syntax checks across `js/**/*.js`: passed.
- Full `npm run check`: 442 passed, 12 failed, 1 skipped (455 total). The failures are the existing Story/Impact expectation and protected-baseline failures documented by the previous package report; no new failure was observed in the focused recording tests.
- Browser automation and real two-device voice/video call testing were not available in this environment.
- No Supabase migration or deployment was performed.

## Behavior

This change reduces the prominence of the remote recording notice; it does not suppress disclosure or make recording invisible to the other participant. The persistent indicator is intentionally retained.
