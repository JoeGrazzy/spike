# SPIKE voice and video call recording

## Behavior

- Recording is optional and does not start merely because a call connects.
- Each participant must tap **Agree & record**. Recording starts automatically only after both participants consent.
- Either participant can decline before recording begins or stop recording once it has started.
- Voice recordings mix the local microphone with the remote participant's audio.
- Video recordings capture a composite of the remote video and a local picture-in-picture view, plus mixed audio.
- When recording stops or the call ends, SPIKE requests a download to the participant's device. A **Save to device** fallback remains available if the browser blocks the automatic download.
- Files use a browser-supported format, normally `.webm`, with a descriptive SPIKE filename.

## Browser/device notes

Recording requires a secure HTTPS context, microphone/camera permission as appropriate, WebRTC media tracks, `MediaRecorder`, `AudioContext`, and (for video) canvas capture support. Browser and operating-system behavior determines the exact download location and whether an automatic download is permitted. The in-app save action provides a user-gesture fallback.

Each participant records independently in their own browser. Recordings are not uploaded to SPIKE's server by this feature. The application must clearly show recording status and users should follow applicable recording-consent laws.

## Verification boundary

Static syntax and audit checks can verify that the code paths exist, but a real two-device test is still required to certify microphone/camera permissions, both-party consent signaling, recording playback, and Android/iOS download behavior.
