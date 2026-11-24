# SPIKE Engineering Audit — 24 November 2026

## Release summary

This release is based on `SPIKE_PHASE1_FRIENDSHIP_LOCK_CANDIDATE.zip` and was reconciled against the connected Supabase project `Spikemediachat` (`veagqanfilmbchlvlpcc`). It is a source-and-database audit build; it has not been deployed to the public Cloudflare site and has not been physically tested on Android/iOS devices.

## Changes made

### Supabase / friendship

- Confirmed the live QR-first request RPC contract, including `spike_send_friend_request(p_target_user_id uuid)` and the accept/decline/cancel/list RPCs.
- Confirmed the friendship RPCs grant execution to `authenticated` and not `anon`.
- Applied `spike_friend_request_pending_default_v1`: new `follows.status` rows now default to `pending`.
- Applied `spike_friend_request_rls_alignment_v1`: the `follows_insert_self` policy recognizes the `pending` state and the target-side update policy is limited to incoming `requested`/`pending` rows.
- Aligned the local migration filenames with the actual deployed migration versions so the repository and production migration history agree.
- Kept historical migrations, including the earlier no-op duplicate-named call-session migration, because deployed migration history must not be rewritten or deleted.

### Profile / social UX

- Corrected a real Profile statistics mismatch: the card labelled **Friends** was displaying the follower count, not mutual friendships.
- Profile now counts mutual friends through `SPIKE.social.listMutualFriends`.
- The **Add** card is now an action (`+`) rather than a misleading following-count statistic and opens the Friends workspace.
- The Find people action now opens the Friends workspace, keeping discovery and QR/request connection actions together.
- Removed stale Followers wording from the profile connection overlay's default title/comment.

### CSS / dependencies

- Standardized the Feed page Font Awesome dependency to the same Font Awesome Free 7.2.0 CDN used elsewhere in the app.
- Checked all 64 local CSS files: each is referenced by at least one page; no missing local CSS assets, repeated stylesheet tags on a page, or byte-identical CSS files were found.
- Checked all HTML pages for duplicate IDs and duplicate JavaScript includes; none were found.
- Repeated CSS selectors remain in the project as non-identical, ordered overrides (including page-specific and responsive rules). They were not mechanically deleted or flattened because doing so could break the intended cascade. There are no orphaned stylesheets to remove based on reference analysis.

### Test and validation infrastructure

- Fixed the messages smoke test: it previously required one obsolete hard-coded cache-busting query string even though both message pages loaded versioned runtime scripts correctly.
- Added the messages smoke test to the standard `npm test` command so it cannot silently be skipped.
- Extended project validation to detect duplicate HTML IDs, duplicate JavaScript includes, duplicate stylesheet includes, and unreferenced CSS files.
- Updated the migration baseline check to include the deployed friendship migrations.

## Verification results

- `npm test`: **43 tests passed**, plus the messages-pages smoke test passed.
- `npm run check`: passed; checked 62 JavaScript files, 28 HTML pages, and 64 CSS files.
- Static local-reference validation: no missing local HTML/CSS/JS assets.
- HTML consistency: no duplicate IDs; no duplicate JS or CSS includes per page.
- Supabase RPC inventory: all statically identified frontend RPC names were found in the connected public schema.
- Friendship SQL transaction tests passed and were rolled back: send request, duplicate request, accept to reciprocal accepted rows, decline, cancel, unfriend, block, blocked request rejection, and unblock.
- Live Supabase health advisor: no health lint findings.
- The deployed `follows.status` default was confirmed as `pending` after migration.

## Remaining external verification

The following cannot be proven from static code and database transaction tests alone:

1. Physical camera permission and QR decoding behavior on actual Android/iOS devices.
2. Gallery image decode behavior across device/browser combinations.
3. Full UI flow with two real signed-in accounts on the deployed website.
4. Public Cloudflare deployment and cache propagation.

These are explicitly not marked complete.

## Supabase advisories to review separately

The connected project's advisors still report:

- 52 warnings for authenticated execution of `SECURITY DEFINER` functions. The friendship RPCs are intentionally privileged and are granted to authenticated users only; other functions should be reviewed individually rather than blanket-converted.
- 19 informational RLS-enabled tables without policies. With RLS enabled and no policy, access is default-deny; each table should be checked against its intended access model.
- Leaked-password protection is disabled in Supabase Auth. This is an Auth dashboard/configuration setting, not a SQL migration.
- 46 unused-index informational notices. These are not automatically removed because low-traffic and newly introduced indexes may not yet have usage statistics.

No critical/error-level security advisor findings were returned in this audit. The advisory items above remain visible and should not be described as resolved.

## Deployment note

The two original friendship migrations and the two follow-up alignment migrations are already applied to the connected Supabase project. Do not re-run them manually. Deploy the contents of this ZIP to the existing Cloudflare Pages/Workers static-assets project when ready, then perform the outstanding two-account and device tests.
