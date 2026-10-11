# SPIKE Recording Modes v55 — Change and Verification Report

## Implemented in this package

- Consolidated recording controls into the existing canonical call UI: **Record Voice**, **Record Video**, and **Business Meeting Recording**.
- Record Voice mixes the initiating participant's live microphone audio with the remote participant's incoming audio.
- Record Video is available on video calls and composes both video feeds side-by-side with mixed audio from both participants.
- Local voice/video recording sends a visible in-call notice before capture and waits for the other call client to acknowledge that notice. It does not show an approval popup. The recording indicator/timer is displayed on the initiating device; the other participant receives a disclosure notice, not a recording indicator.
- Business Meeting Recording uses a separate consent state: the requester and other participant must both explicitly approve. The initiating participant's device records after both approvals. Decline or withdrawal prevents or stops capture, including the case where consent is withdrawn while media setup is in progress.
- Added unique recording session IDs and session-specific filenames, a single-recorder guard, disabled controls during startup/recording, and cleanup for recorder, canvas, audio context, and media streams.
- Removed the unused no-op v1 script from `message.html`; retained its file as a compatibility artifact. All pages use the same v13 cache-busting reference for the canonical v2 runtime.
- Updated stale call UI and call-channel tests to check the actual runtime-injected UI and current subscription architecture; added recording regression tests.

## Verification

- Focused call/recording tests: **13 passed, 0 failed**.
- JavaScript syntax check across `js/**/*.js`: **passed**.
- Full project audit: **442 passed, 12 failed, 1 skipped** (455 tests total; this is the final full run after the recording-session filename suffix change).
- Remaining full-audit failures are in pre-existing Story/Impact test expectations and the protected-baseline manifest. A comparison against the pre-change working tree showed the same 19 protected-baseline mismatches already existed before this change; this work did not add a new mismatch.
- No browser automation runner (Playwright/Puppeteer) is installed in this environment, so two-device call/recording behavior has **not** been certified on real Android/iOS devices.
- No Supabase migration or deployment was performed.

## Important limitations

Recording depends on the browser exposing live local and remote tracks, `AudioContext` mixing, `MediaRecorder`, and (for video) canvas capture. Real-device testing is still required for Android browser download behavior, audio levels/echo, camera layout, reconnects, and consent signaling under network interruptions.
