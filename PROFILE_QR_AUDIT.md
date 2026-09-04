# SPIKE `profile.html` — Deep Audit & QR Remediation

## Executive result

**QR generation:** structurally correct; the existing `qrcode-generator@1.4.4` flow creates `spike://connect?uid=<UUID>` payloads.

**QR scanning before remediation:** fragile. It depended exclusively on `BarcodeDetector`, so browsers without that API could open the camera but could not decode it. Gallery scanning had the same dependency. The scanner also selected only `codes[0]`, did not distinguish a valid SPIKE QR from another QR in a multi-code frame, had weak URL validation, and provided limited camera/permission feedback.

**QR scanning after remediation:** native `BarcodeDetector` is used when available; `jsQR` is used as a decoder fallback for live camera frames and gallery images. Camera startup now handles secure-context, permission, missing-camera and busy-camera failures. Scanning is throttled/serialized, multi-code frames prefer a valid SPIKE payload, and QR URLs are restricted to the `spike:` connect scheme or same-origin `profile.html` links.

> A live physical camera/mobile-device pass cannot honestly be marked complete in this sandbox: Chromium is installed, but the environment has no usable camera device/permission surface and outbound CDN DNS is unavailable. Those cases are therefore explicitly marked **not physically verified**, rather than falsely passed.

## Page inventory

### Shell / navigation
- Sticky profile header with back navigation, admin-only control, and menu.
- Feed fallback for back navigation.
- Theme bootstrap and runtime theme toggle.
- Loader/error state.

### Identity
- Cover image with owner-only upload.
- Avatar with owner-only upload.
- Display name, username, verified marker, bio, metadata.
- SPIKE Lifetime ID with copy/share.
- XP level/progress display.
- Owner-only profile editing.

### Social
- Owner: Edit + Feed actions.
- Visitor: Follow, Message, Share.
- Follow state synchronized through `localStorage` and a custom event.
- Follower/following counters.

### Profile features
- Achievements derived from activity.
- Presence status subject to privacy/access checks.
- Activity counters.
- Owner-only profile insights.
- Media/About tabs.
- Media gallery and modal viewer with navigation, like, save, share.

### Profile editing / privacy
- Name, username, bio.
- Avatar and cover upload through Cloudinary.
- Website, location, social links.
- Profile/posts/media/friends visibility.
- Message/call permissions.
- Online-status and discovery toggles.

### Menu / QR
- Copy profile link.
- Owner-only Show QR.
- Scan QR.
- Theme.
- Sign out.
- QR display modal with share/copy actions.
- Camera scanner with Gallery fallback.
- Connect preview and instant-connect RPC.

## Data flow

1. `boot()` binds UI handlers and authenticates through Supabase.
2. `state.me` receives the authenticated user; `state.uid` comes from `?uid=` or the current user.
3. `loadProfile()` calls `get_public_profiles`.
4. Owner-only legacy extras come from `app_documents/users/<uid>`.
5. `loadPrivacy()` applies owner privacy or authoritative `SPIKE_ACCESS` checks for another member.
6. `loadPosts()` uses `get_public_profile_posts` for other users and `app_documents` for the owner.
7. `loadSocial()` reads the user's `users/<uid>` document for following/saved/view counters.
8. Rendering updates identity, actions, features, posts and media.
9. A private Supabase realtime channel (`profile:<uid>`) reloads posts/profile changes.

## External dependencies / API calls

### CDN
- Supabase JS `@supabase/supabase-js@2.112.4`
- `qrcode-generator@1.4.4`
- `jsQR@1.4.0` (added fallback)
- Local theme/presence/call/UI/performance modules.

### Supabase
- Auth: `getSession`, `signOut`
- Tables: `app_documents`, `profiles`, `profile_privacy`
- RPCs:
  - `is_super_admin`
  - `get_public_profiles`
  - `get_public_profile_posts`
  - `mutate_post_interaction`
  - `connect_via_spike_qr`
- Realtime private broadcast channel.

### Cloudinary
- `auto/upload` with the configured unsigned upload preset for profile/cover media.

## QR generation flow

`showQr` → `openQr()` → `renderMyQr()` → `qrcode()` → `addData(spikeQrPayload())` → `make()` → `createImgTag()`.

Payload:

`spike://connect?uid=<URL-encoded authenticated/profile UUID>`

The code is therefore an **identity/connect token**, not a password or session token. The actual connection is performed server-side through `connect_via_spike_qr`.

## QR scanning flow

### Camera
`scanQr` → `startScanner()` → secure-context check → `getUserMedia()` → rear-facing camera stream → video playback → decoder loop.

### Decoder priority
1. `BarcodeDetector({formats:["qr_code"]})` where supported.
2. `jsQR` canvas fallback otherwise.

### Gallery
Image file → native `BarcodeDetector` when available → otherwise `jsQR` → raw value validation → connect preview.

### Validation
Accepted:
- `spike://connect?uid=<uuid>`
- same-origin `profile.html?uid=<uuid>`
- raw UUID (legacy/explicit compatibility)

Rejected:
- foreign-origin profile URLs
- other `spike:` hosts
- arbitrary non-UUID text

### Action
Valid non-self UID → scanner closes → `get_public_profiles` resolves the member → connect preview → user confirms → `connect_via_spike_qr`.

## Issues found and fixed

| Finding | Severity | Status |
|---|---|---|
| Scanner depended solely on `BarcodeDetector` | High | Fixed |
| Gallery scanner failed on the same unsupported browsers | High | Fixed |
| Only `codes[0]` was considered | Medium | Fixed |
| Arbitrary URL `?uid=` values were accepted | Medium | Fixed |
| No serialized scan guard; repeated detections could race | Medium | Fixed |
| Limited camera error differentiation | Medium | Fixed |
| No secure-context check | Medium | Fixed |
| Weak scanner progress feedback | Medium | Fixed |
| QR generation lacked try/catch around generator | Medium | Fixed |
| No QR image alt/accessible label | Low | Fixed |
| No physical camera/device available in sandbox | N/A | Not verifiable here |

## Verification performed

### Static / project checks
- `npm run audit:static` — PASS
- `npm run typecheck` — PASS
- `npm run test:back` — PASS (15/15)
- `npm run test:performance` — PASS (30/30)
- `npm run test:security` — PASS (16/16)
- `npm run test:telemetry` — PASS (1/1)
- `npm run test:ui` — PASS (16/16)
- `npm run test:integrity` — PASS (7/7)
- `npm run test:profile-qr` — added as a QR regression suite
- `node --check` on all inline JS blocks — PASS

### Independent QR decode
A QR generated with the exact production payload shape was encoded and decoded with OpenCV's QR decoder:

`spike://connect?uid=123e4567-e89b-12d3-a456-426614174000`

**Round-trip match: PASS.**

### Browser/device limitations
- Chromium is installed in the execution environment.
- The sandbox cannot provide a real camera device or grant/revoke camera permission interactively.
- External CDN DNS is unavailable in the sandbox, so CDN-backed browser execution cannot be represented as a production pass.
- Mobile hardware testing was not possible.

## Remaining production acceptance tests

Run on a deployed HTTPS build:

1. Chrome/Android: generate QR → scan from another phone → preview → connect.
2. Safari/iOS: camera permission allow → scan → connect.
3. Permission denial → clear guidance + Gallery option.
4. Permission permanently blocked → browser/site settings guidance + Gallery.
5. Low light / small QR → verify successful decode after several frames.
6. Two QRs in frame → valid SPIKE QR is selected.
7. Foreign QR / malformed data → rejected without RPC connect.
8. Self QR → rejected without RPC connect.
9. Corrupted/partial image → no crash, clear error.
10. Slow decode → scanner remains responsive and does not issue duplicate connect flows.


## Live Supabase validation — 2026-09-04

- Production project `cjqpyndceqyqsijihxbb` was reachable and healthy during validation.
- QR backend RPC `connect_via_spike_qr(uuid)` is deployed as `SECURITY DEFINER`, checks `auth.uid()`, rejects unauthenticated callers/self targets, verifies the target profile exists, and performs the friendship mutation server-side.
- Execution privileges were hardened in production: `public`/`anon` cannot execute the QR/relationship RPCs; `authenticated` can execute the required user-facing RPCs.
- The hardening migration is included under `supabase/migrations/20260904130142_harden_qr_rpc_execution.sql`.
- Supabase security advisor still reports many unrelated `SECURITY DEFINER` functions across the wider application. Those were deliberately not blanket-revoked because doing so could break unrelated admin, messaging, room, wallet, and commerce features.
- Supabase performance advisor reports existing non-QR index/RLS optimization opportunities; these are outside the profile/QR remediation scope.
- Leaked-password protection remains disabled in Auth and is recorded as a project-level follow-up.

### End-to-end limitation

A real two-user authenticated QR connection mutation was **not falsely marked PASS**. No safe pair of disposable authenticated test identities was available, and creating or mutating production test accounts would be inappropriate without dedicated test credentials. Browser camera execution was also not fully reproducible in this environment because live camera permissions/device access and external CDN DNS were unavailable.

### Final status

**Profile/QR code remediation: complete.**
**Static, parser, QR round-trip, security, integrity, UI, telemetry, backend and performance regression suites: passed as previously recorded.**
**Live Supabase privilege hardening: applied and verified.**
**Physical camera + two-account production E2E: pending dedicated test-device/test-account validation.**
