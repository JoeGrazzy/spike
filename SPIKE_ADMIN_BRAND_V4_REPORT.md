# SPIKE Admin Brand Command Center v4

**Date:** 2026-11-11

## What shipped
- New branded shell: `admin.html` + `css/spike-admin-brand-v4.css`
- Five-theme token surfaces, mobile drawer, sticky top bar
- All prior admin sections retained with clearer IA
- **New tools wired**
  - Post bulk moderation via `admin_post_bulk_action` (delete/hide/restore/locks/distribution)
  - Safety recovery issue/verify (`admin_issue_safety_recovery`, `admin_verify_safety_code`)
  - Register user via Edge `admin-register-user`
- Fixed `safeRpc` / `edgeCall` / `init` / `refreshAll` to be properly `async`
- Messages tap-underline fix shipped in same package (DM v1.3)

## Backend contracts preserved
- Existing RPCs and Edge actions remain the source of truth
- Server-side `admin_guard` still enforces privilege

## Deploy notes
- Host updated `admin.html` and new CSS
- Ensure Edge functions `admin-user-ops` and `admin-register-user` are deployed
- No schema migration required for the admin UI itself
