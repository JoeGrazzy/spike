# SPIKE — Project Scan & Destroy Audit

Date: 2026-09-04
Baseline: `Spike_theme_sync_final_v15.zip`

## Scope

Audited the complete supplied project archive: all production HTML pages, shared CSS/JS, audit tooling/tests, assets, workflows, package metadata, and the connected Supabase project surface available through the project connection.

Static source size audited: 63 source files after the corrective edits, approximately 22,203 lines across HTML/CSS/JS/JSON/YAML/SQL/Markdown source classes. After correction, the historical duplicate room-chat implementation was removed and the project remains fully covered by the production-page audit.

## Critical findings and fixes

### P0 — Inline JavaScript syntax failures hidden from the original gate

- `messages.html` contained three extra closing `});` statements in the Features → Disappearing Messages binding block.
- `profile.html` declared `initAdminHeader()` as a normal function while using `await` inside it.
- The existing typecheck only checked standalone `.js` files, so these HTML-embedded failures escaped the prior gate.

**Fixed:** removed the unmatched closures and made `initAdminHeader()` asynchronous.

**Prevention:** the new project-integrity gate extracts and syntax-checks every inline `<script>` block. 105 inline blocks are currently checked.

### P1 — Orphaned duplicate implementation

`js/room_chat_final.html` was a historical duplicate implementation. The canonical production route is `room_chat.html`, with `chat_room.html` retained as the compatibility route required by the audit contract.

**Fixed:** removed the orphan and added a regression test preventing its return.

### P1 — Database least-privilege gaps

Live Supabase inspection found public/anonymous execution on three sensitive public wrappers:
- `admin_list_user_verification(uuid[])`
- `admin_set_user_verified(uuid, boolean)`
- `get_public_profiles(uuid[])`

The admin wrappers delegated into protected private functions, but their exposed grants were broader than necessary. `get_public_profiles` already failed closed without an authenticated identity, but its public/anon execute grant was still unnecessary.

**Fixed live:** public/anon execution revoked; authenticated execution retained. Private admin function public/anon grants also revoked.

A defense-in-depth hardening migration additionally removes direct public/anon table privileges from 43 administrative, private, account-control, financial, telemetry, and related sensitive tables while preserving authenticated access and RLS.

### P1 — Repository/database migration drift

The live database contains a long migration history (latest live migration observed: `20260904064418`; 200+ historical migrations), while the supplied repository carries only the two most recent corrective migrations plus the new hardening migration.

This is a **reproducibility/operations risk**, not something that should be “fixed” by fabricating a replacement history. Reconstructing the full historical migration chain requires an authoritative schema/migration export from the live project. The audit therefore records this explicitly rather than claiming false parity.

### P2 — Dependency/CDN consistency

Supabase JS was already pinned to `2.112.4`. Font Awesome appeared in multiple historical CDN versions across pages.

**Fixed:** standardized source pages on Font Awesome `7.2.0`, matching the canonical room-chat implementation. A regression test now enforces the version. Development dependency ranges were also pinned to exact versions to prevent silent dependency drift. A lockfile could not be generated in this execution environment because the npm registry was unreachable/not cached; this is explicitly retained as an operational follow-up rather than inventing integrity metadata.

### P2 — Duplicate theme registry risk

`feed.html` still contained an older private theme bootstrap while `js/theme.js` was the authoritative global theme engine.

**Fixed:** removed the redundant Feed registry. `js/theme.js` is now the single global theme source of truth.

## Security observations

- All 15 required production pages pass the existing credential/HTTP/eval security baseline.
- No privileged Supabase service-role key was found in the supplied frontend source.
- Public Supabase publishable credentials are expected client-side credentials, not privileged secrets.
- All inspected public tables currently have RLS enabled; live check reported zero public tables with RLS disabled.
- Sensitive direct anon/public table privileges were removed as defense in depth.
- External unsigned upload/translation/CDN integrations remain architectural supply-chain/abuse considerations; changing those contracts blindly would risk breaking production functionality and requires provider configuration/asset ownership rather than speculative edits.

## Performance / lifecycle

Existing performance budgets pass for all production pages and shared assets. Existing back-navigation, UI, telemetry, security, and theme contracts pass. Existing shared timers/listeners remain feature-driven; no new recurring timer or listener leak was introduced by this audit.

## Verification evidence

- Static audit: PASS — 15 required pages.
- Standalone JS syntax/type gate: PASS — 21 JavaScript files.
- Inline HTML JavaScript syntax: PASS — 105 blocks.
- Full Node audit/test suite: PASS — 90/90.
- Theme contract: PASS.
- Theme synchronization contract: PASS.
- Security baseline: PASS.
- UI contract: PASS.
- Back-button contract: PASS.
- Performance contract: PASS.
- Telemetry contract: PASS.
- Production build: PASS.
- Cloudflare artifact verification: PASS.
- ZIP integrity: PASS.
- Live Supabase RLS check: PASS — 0 public tables with RLS disabled.
- Live sensitive table privilege check: PASS — 0 anon SELECT privileges remain on the 43 audited sensitive tables; authenticated SELECT remains on 42, with `spike_revenue` intentionally restricted.
- Live sensitive RPC privilege check: PASS — admin wrappers and `get_public_profiles` are authenticated-only; `spike_coins_unchanged` remains authenticated-only.

## Remaining external validation constraint

Live browser visual/device execution is administrator-blocked in this workspace (`ERR_BLOCKED_BY_ADMINISTRATOR` in the prior environment), so no false claim is made for real Chrome/Safari/Firefox/iOS/Android screenshot validation. Static responsive and cross-browser CSS safeguards remain covered by the project tests.
