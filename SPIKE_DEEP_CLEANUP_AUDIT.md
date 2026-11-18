# SPIKE Deep Cleanup Audit

## Scope
Static inspection of the supplied `SPIKE_DEEP_CLEANED.zip` source tree. This pass is conservative and does not modify feature logic or Supabase resources.

## Safe removals
Removed four assets with no references anywhere in the packaged HTML, CSS, or JavaScript:
- `css/spike-smart-panels-v1.css` — no stylesheet import/link and no smart-panel component implementation; related JS was an empty IIFE.
- `css/spike-messages-compact-polish-v1.css` — not linked/imported; messages page loads `spike-messages-rebuild-v1.css` instead.
- `css/spike-coin-orders-v1.css` — not linked/imported and its distinctive selectors are not referenced in packaged HTML/JS.
- `js/spike-smart-panels-v1.js` — empty IIFE, not loaded or referenced.

## Preserved for further review
- `wallet-inline-check.js` is not referenced by page markup, but contains substantial wallet-related code and overlaps wallet inline implementation. It was retained because its role cannot safely be established from static references alone.
- Potential CSS overrides were not deduplicated: cascade order and runtime-created markup can make apparently repeated rules intentional.
- Dynamic template expressions in HTML/JS can look like broken local asset references to simple scanners; these were not altered.

## Validation
- JavaScript syntax: all 53 source JS files passed `node --check` before cleanup; all remaining JS files rechecked after cleanup.
- CSS parsing: all 85 CSS files parsed with zero parser errors before cleanup; all remaining CSS files rechecked after cleanup.
- Exact duplicate files: none detected before cleanup.
- Archive integrity: checked with `unzip -t` after packaging.

## Not performed
No live browser/device QA, authenticated-user testing, Supabase database changes, storage cleanup, or live API tests were performed. Those require a deployed environment and appropriate project access.

## Second-pass JavaScript dependency and lifecycle audit
- Checked all 26 HTML pages: 298 local external-script references resolved; no missing local script references found.
- Extracted and syntax-checked all 66 inline JavaScript blocks: zero syntax errors.
- Identified `wallet-inline-check.js` as an unreferenced standalone copy. Its 39 named wallet functions are all present in the active `wallet.html` inline implementation; the implementations are substantially overlapping (about 81% text similarity). Removed the unused standalone copy and retained the active wallet page implementation.
- Reviewed Supabase client creation sites and confirmed the project includes a shared `supabase-singleton.js` wrapper on key pages. Multiple page-specific calls remain, but the wrapper is intended to return the same client for the project's configured URL/key; these calls were not mechanically rewritten because options and page-specific boot order require runtime testing.
- Event/timer/realtime patterns were inventoried. The presence of more `addEventListener` calls than `removeEventListener` calls is not by itself proof of leaks: many listeners are page-lifetime listeners or use `{ once: true }`. No broad event-listener rewrite was made without browser lifecycle tests.
- No live browser, authenticated-session, network, or Supabase runtime tests were performed.

## Broken-feature repair pass — voice-note playback

Date: 2026-11-18

Updated `message.html` voice-note playback resolution:
- Signed-URL lookup now tries the message's recorded bucket first, then the current `private-message-media` bucket and legacy `dm-media` bucket (without duplicate attempts).
- Failed or expired signed URLs can be requested again when the user taps Play; previously a failed audio element could remain stuck and had no explicit recovery path.
- Signed URLs are treated as expiring after 3,500 seconds and refreshed before playback when expired.
- Audio load/play failures mark the player retryable and provide a tap-to-retry title; successful playback clears the error state.
- Seek handling now guards against a zero-width waveform.

Validation after the change:
- All 66 inline JavaScript blocks across the HTML pages pass `node --check`.
- All standalone JavaScript files pass `node --check`.

Limitations:
- This is a frontend recovery fix. It cannot restore a voice-note object that is actually missing from Supabase Storage, nor can it repair incorrect Storage policies or bucket configuration without access to the live project and its storage records.
- No live authenticated upload/playback test was performed in this pass.

## Broken-feature repair pass — safer message and voice-note retries

Date: 2026-11-18

Updated `message.html` to protect uploaded media when the database response is ambiguous:
- For ordinary attachments, if the insert request reports an error, the page now checks `private_messages` for the exact uploaded attachment path before deciding whether the upload failed. If the verification query itself fails, the uploaded object is preserved and the user is told to refresh before retrying; it is no longer deleted blindly.
- For voice notes, the page similarly checks for the message by its generated ID after an insert error. An uncertain database response no longer triggers automatic deletion of the uploaded audio object.
- The voice-note retry flow remembers the already-uploaded object path. If the database check was temporarily unavailable, retrying reuses that uploaded object instead of attempting a second upload to the same path (which would fail because uploads use `upsert:false`).
- Successful send and explicit recording cancellation clear the remembered upload path.

Validation after this repair:
- All 51 standalone JavaScript files pass `node --check`.
- All 66 inline JavaScript blocks pass `node --check`.
- All 82 CSS files parse with zero parser errors.
- No live authenticated Supabase test was performed; the JSONB `.contains('attachment', {path})` recovery query still needs verification against the deployed `private_messages` schema and RLS policies.

Limitations:
- These changes reduce the risk of deleting a file whose message insert may actually have succeeded. They do not restore missing Storage objects, alter database policies, or prove live delivery/playback.

## Live Supabase investigation and V6 message-media repair (2026-11-18)

Read-only inspection was performed against the active SPIKE Supabase project before making any backend changes. No database schema, Storage policy, user record, message row, or Storage object was modified in this pass.

### Confirmed findings
- The private `dm-media` bucket contains two legacy media objects, and both `private_messages.media_path` values match existing objects in that bucket.
- The `message.html` message query did not select `media_path` or `media_mime_type`. Consequently, legacy `audio` messages that use `media_path` could render without a playable source even though the file exists.
- The newer private `private-message-media` bucket contains six objects. Two are referenced by current message metadata; four are not currently referenced by the inspected message metadata. These four objects were deliberately retained; they may be recoverable uploads from interrupted sends and must not be deleted without a retention/recovery decision.
- Storage logs include duplicate-key upload failures for voice-note object retries. The same object paths had already emitted object-created lifecycle events. This is consistent with a successful first upload followed by a retry using the same stable object key.
- Storage logs also show unsuccessful signing attempts against `private-message-media` for legacy object keys that belong to `dm-media`. Existing successful signing requests use the correct bucket. No Storage policy was broadened to hide this client-side bucket mismatch.

### V6 frontend repairs
- Message reads now include `media_path` and `media_mime_type`.
- Voice/audio rendering uses `attachment.path` when present and falls back to the legacy `media_path` otherwise.
- Legacy `media_path` playback is explicitly associated with the `dm-media` bucket.
- A duplicate-object response during a voice-note retry is treated as an already-uploaded object only when the error text matches a duplicate/existing-object condition. Other upload errors still fail normally. The existing message insert/recovery flow then determines whether the message was saved.
- Existing Storage RLS policies and private bucket settings were preserved.

### Live Supabase advisory notes
- Health advisor: no findings.
- Security advisor: two anonymous-executable SECURITY DEFINER functions and 252 authenticated-executable SECURITY DEFINER functions were flagged, plus leaked-password protection is disabled. The anonymous recovery function is used by the password reset page; the policy-health function is called by the policy page. These grants were not mass-revoked because that would break intended public recovery/status flows and authenticated RPC features. Individual functions need a complete authorization review before grant changes.
- Performance advisor: three unindexed foreign keys, 135 indexes reported unused, and one duplicate index. No indexes were dropped based only on usage counters; the duplicate and foreign-key findings should be handled in a separate measured performance pass.

### V6 validation
- 51 standalone JavaScript files pass `node --check`.
- 66 inline JavaScript blocks pass `node --check`.
- 82 CSS files parse with zero CSS parser errors.
- The project ZIP is checked for archive integrity.
- Not performed: authenticated two-user browser playback test, real voice-note recording on device, or live app deployment. Those still require end-to-end user/device QA.
