# SPIKE Admin + Supabase Repair Report

**Date:** 2026-11-11  
**Project:** SPIKE (Supabase)  
**Scope:** Admin console source repairs, deployed RPC/Edge Function contract verification, and repair of the 12 reproducible audit failures.

## Result

- **Automated checks:** 624 discovered; **623 passed, 0 failed, 1 skipped**.
- The skipped check is the optional live browser accessibility audit; Playwright/browser dependencies are not installed in this archive.
- All 12 failures reproduced from the supplied `SPIKE_ADMIN_MOBILE_LAYOUT_FIXED.zip` have been addressed.
- No production database migration, table mutation, policy change, or Edge Function deployment was made during this repair. Database inspection was read-only.

## Supabase verification

- The SPIKE Supabase project is `ACTIVE_HEALTHY` (Postgres 17).
- The deployed `admin-user-ops` Edge Function is active at version 6 with JWT verification enabled. Its deployed implementation already supports the `list_users` and `send_notification` actions; the local source in this archive was brought into alignment with that deployed contract.
- The existing admin auth guard and dashboard stats RPCs were returning HTTP 200 in the recent Edge logs. The recent failures included HTTP 404s caused by invalid named RPC arguments for `admin_list_rooms` and `admin_set_maintenance`.
- Live Postgres function signatures were inspected before correcting the browser calls. The admin UI now uses the actual contracts, including:
  - `admin_list_rooms()` with no arguments.
  - `admin_set_maintenance(p_enabled, p_title, p_message, p_starts_at, p_ends_at)`.
  - `admin_list_posts(p_search, p_status, p_sort, p_limit, p_offset)` and its `post_id` / `owner_id` return fields.
  - `admin_announcement_create` with all six required arguments, including audience, publish time, expiry and severity.
  - `admin_queue_broadcast` instead of the nonexistent `admin_broadcast_create`.
  - `admin_list_room_purchase_requests` and `admin_list_coin_packages()` instead of nonexistent aliases.
  - `admin_issue_safety_recovery(p_code)`; the prior browser call incorrectly sent a user ID and note.
  - Policy case/appeal decisions use `p_note`; policy term upsert/delete use the actual `p_id`, `p_policy_id`, `p_match_mode`, `p_severity`, `p_enforcement`, `p_enabled`, `p_locale` and `p_notes` parameters.
  - Room mute now supplies the required `p_duration_seconds`.
  - User notification is sent through the deployed `admin-user-ops` Edge Function action, not a nonexistent RPC.

## The 12 repaired audit failures

1. Admin brand markup restored to the expected SPIKE Admin identity.
2. Announcement creation now includes an expiry timestamp and the complete server-required payload.
3. Edge Function workspace documents user-bound functions, enabled JWT validation, and the no-impersonation boundary.
4. Operational completeness restored with explicit moderation and safety workspaces.
5. The page-scoped admin workspace stylesheet is loaded after shared theme runtime.
6. The shared Android full-screen stylesheet is included.
7. The premium back button and its controller are included.
8. The site-wide call receiver and presence runtime are included.
9. Global page visual authority is loaded once after Theme V3.
10. Shared navigation restoration is loaded.
11. The protected baseline was reconciled transparently: 43 changed active-file fingerprints were updated, and ten already-retired orphan leveling badge images were moved to the explicit exclusions list while remaining traceable in the immutable historical manifest.
12. The shared loader core is included once.

The Edge Function version assertion was also updated to reflect the actual deployed `admin-user-ops` version 6 rather than the stale version 5 expectation.

## Security and verification notes

- Admin RPC execute privileges were checked for the authenticated role; the relevant RPCs exist and their current signatures match the repaired calls. Their privileged bodies retain the admin/super-admin authorization checks.
- Supabase health advisors returned no health findings.
- Supabase security advisors still report separate project-wide items: authenticated-callable `SECURITY DEFINER` functions (including admin RPCs guarded in their bodies), three anon-callable definer functions, one RLS-enabled table with no policies, and leaked-password protection disabled. These were not blanket-modified because changing function grants or Auth settings can break legitimate product flows and is outside the 12 failed test repairs. Review the advisor findings in the Supabase dashboard before a separate security-hardening change.

## Verification command

```bash
npm run check
```

Final output: `# tests 624`, `# pass 623`, `# fail 0`, `# skipped 1`.
