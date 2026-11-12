# SPIKE Email Campaign Removal Report

**Date:** 2026-11-11  
**Project:** SPIKE (Supabase)  
**Source archive:** `SPIKE_EMAIL_CAMPAIGNS_DRAFT_FIRST.zip`

## Result

Removed the draft-first admin email campaign feature from the source project without removing or changing SPIKE's existing Notifications, Broadcasts, or Announcements systems.

## Source changes

- Removed the Email Campaigns navigation item and complete admin workspace from `admin.html`.
- Removed email-specific styles, selected-user checkboxes, selection state, template generation, draft-save handlers, list/refresh handlers, and the `admin-email-campaigns` fetch call.
- Restored the Users directory to its standard account list and existing account actions.
- Removed `supabase/functions/admin-email-campaigns/index.ts` and its now-empty function directory.
- Removed the un-applied draft-only migration `supabase/migrations/20261111223000_admin_email_campaign_drafts_v1.sql`.
- Removed `EMAIL_CAMPAIGNS_SETUP.md`.
- Reconciled the active protected-file baseline for the edited admin page, a pre-existing v3 admin migration fingerprint drift, and the updated audit contract test. The historical original baseline was left unchanged.
- Updated the stale Auth-wide directory audit assertion to verify the current guarded `admin_list_users_v2` RPC implementation rather than an older `auth.admin.listUsers` implementation.

## Production Supabase verification

Read-only inspection of project `cjqpyndceqyqsijihxbb` found:

- No deployed `admin-email-campaigns` Edge Function.
- No `public.admin_email_campaigns` table.
- No `public.admin_email_campaign_recipients` table.
- No matching email-campaign database function.
- No migration-history row for version `20261111223000` / the email-campaign draft migration.
- Existing `public.notifications`, `public.broadcasts`, and `public.announcement_campaigns` tables are present and were preserved.
- Existing `admin-user-ops` remains deployed; it was not modified.

No production DDL, data deletion, function deployment, or production database mutation was required or performed.

## Cache and build reference inspection

- No root `sw.js`, service-worker source, or campaign-related cache manifest was found in this archive.
- No campaign reference was found in the Supabase Edge Function deployment manifest or package/build scripts.
- Three unrelated pages (`friends.html`, `profile.html`, and `rooms.html`) still contain their pre-existing `sw.js` registration attempts; there is no `sw.js` asset in this archive. These unrelated registrations were not altered as part of the email-campaign removal.

## Verification

- `npm run check`: **631 passed, 0 failed, 1 skipped**. The skipped test is the optional browser accessibility audit because Playwright/browser dependencies are not installed.
- Project-wide JavaScript syntax check: **176 JavaScript source files, 0 errors**.
- Inline HTML JavaScript syntax check: **86 executable inline script blocks, 0 errors**.
- Targeted project-wide search found no remaining email-campaign menu, DOM, handler, API, Edge Function, setup, or draft-migration references.
- ZIP integrity check passed.

## Scope notes

The `announcement_campaigns` database table and its announcement lifecycle functions are intentionally retained because they belong to SPIKE's existing Announcements feature. Historical SPIKE Impact migrations are also retained as migration history; a later existing migration already decommissions that separate feature. Neither is an email-campaign dependency.
