# SPIKE call recording modes

## Record Voice
- Records a mixed audio track from both the local microphone and the remote participant's incoming audio.
- Before capture starts, SPIKE sends a visible in-call recording notice to the other participant. This is not an approval popup, but the other participant is not kept unaware.
- The recording is finalized and downloaded on the initiating participant's device.

## Record Video
- Available during an active video call.
- Composes the local and remote video feeds side-by-side and combines both live audio tracks.
- Sends the other participant a visible in-call recording notice before capture begins.
- Saves a single composed recording on the initiating participant's device.

## Business Meeting Recording
- The requester and the other participant each have to explicitly approve the same recording session.
- The recording cannot start if either participant declines. The initiating participant's device records the shared meeting after both approvals are received.
- If the request is declined, approval signalling fails, or recording cannot start, no business recording is treated as active.
- Either participant can stop an active business recording; the initiating device finalizes its file.

## Safety, storage, and browser support
- These controls do not secretly record the other participant. Local-mode recording sends a visible in-call notice; business recording requires two explicit approvals.
- Recordings are created in the browser and downloaded to the initiating device; this implementation does not upload them to SPIKE's server.
- Recording requires secure-context access, live local and remote media tracks, `MediaRecorder`, and `AudioContext` mixing. Video recording additionally requires both video feeds and canvas capture support. Browser/device compatibility must be verified on real devices.
- Only one recorder can be active per call at a time. A repeated tap cannot create a second recorder. Call teardown stops recorders and media-processing resources.
