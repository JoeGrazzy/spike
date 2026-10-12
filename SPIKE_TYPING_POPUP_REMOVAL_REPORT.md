# Spike typing diagnostic popup removal

## User-facing change
- Removed the dynamically-created `SPIKE typing diagnostics` overlay from the direct-message shared script.
- Removed the same overlay behavior from room chat.
- Typing diagnostics are silent by default; developers can temporarily enable console debug output with `window.__SPIKE_TYPING_DEBUG__ = true`.
- Updated the shared script cache-busting version to `sitewide-calls-v17` on pages that load it.

## Important distinction
This removes the diagnostic popup from the interface. It does not itself resolve the underlying missing-channel condition. Typing broadcast failures are no longer shown to ordinary users; the channel lifecycle still needs live verification.

## Validation
Syntax checks and archive integrity should be run before deployment. The changes do not modify database policies or deploy to Cloudflare.
