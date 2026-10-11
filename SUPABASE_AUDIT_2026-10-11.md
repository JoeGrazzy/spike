# SPIKE Supabase / Release Audit — 2026-10-11

## Scope and safety

This pass inspected the local source package and performed read-only inspection of the connected Supabase project `SPIKE` (`cjqpyndceqyqsijihxbb`). No production SQL, migration, Edge Function deployment, or app deployment was changed by this audit.

## Changes made in this source package

Three SQL files had duplicate migration versions and were byte-for-byte identical to later, uniquely versioned files. The earlier copies were moved out of `supabase/migrations/` into `supabase/migrations-archive/duplicate-version-cleanup/` so Supabase CLI migration discovery no longer sees duplicate version prefixes. The canonical later copies remain active:

- `20260912103000_profile_transaction_and_follow_hardening_v1.sql` archived; identical active copy remains as `20260912103100_profile_transaction_and_follow_hardening_v1.sql`.
- `20260922090000_spike_live_complete_v1.sql` archived; identical active copy remains as `20260922090100_spike_live_complete_v1.sql`.
- `20261011170000_spike_sitewide_call_presence_v2.sql` archived; identical active copy remains as `20261011171500_spike_sitewide_call_presence_v2.sql`.

The other file sharing `20260912103000` (`profile_mutation_hardening_v1`) is not identical to the archived file and remains active.

## Live Supabase findings (read-only)

- Connected project is active and healthy; PostgreSQL 17.6.
- The live migration history reports 426 entries, while this package now contains 103 active migration files (106 before this cleanup). The live history does not contain the six exact duplicate version values examined here. This is a substantial source/history divergence (at least 323 migration entries are not represented by active local files) that must be reconciled before any broad `db push` or migration replay. Do not assume this archive is a complete migration history.
- Live Edge Functions: 9 are deployed, but only 3 function source directories exist in this package (`admin-register-user`, `admin-user-ops`, `spike-webauthn`). The six deployed functions absent from local source are `create-private-call`, `spike-predictor-sync`, `spike-media-download`, `spike-paystack-init`, `spike-b2-media`, and `spike-paystack-verify`. The deployment manifest was last verified on 2026-10-08 and its recorded versions for `admin-register-user` and `admin-user-ops` are behind the live versions. Do not redeploy or overwrite these functions from this incomplete source package.
- Live Realtime `realtime.messages` currently has five policies: three SELECT and two INSERT policies covering authenticated call recipients / DM participants and user notification broadcasts. The call policies use different topic namespaces (`spike:call:` vs `spike:dm:`) and check the authenticated user and private-message participant relationship. This is a source-level review, not a live two-account end-to-end call test.
- Supabase security advisors report six functions executable by `anon` with `SECURITY DEFINER`, including public policy catalog/read helpers, room recommendations, and a token-based account-recovery function. I fetched and inspected the live definitions and confirmed all six have `anon` and `authenticated` EXECUTE grants. The policy catalog/read helpers expose active policy metadata and the room recommendation RPC returns active public room details, which appear consistent with their public-facing purpose. The recovery RPC validates a single-use 64-character token, enforces password complexity, consumes the token, updates the password, revokes sessions, and disables safety codes; however, it also returns the target `user_id` and email after successful recovery. Recommend minimizing that response to `{ok:true}` because the client only checks `data.ok`. Do not revoke anonymous execution, because the reset page needs to submit a valid recovery token. Apply the response minimization only through a reconciled migration after confirming function compatibility.
- Supabase also reports 245 authenticated-executable `SECURITY DEFINER` functions. This is a broad linter category and not proof that all are vulnerable; each function must be reviewed for internal authorization checks and minimal grants.
- Supabase Auth leaked-password protection is disabled (one warning); enable after confirming product policy.
- Performance advisors report 17 multiple-permissive-policy warnings, one unindexed foreign key, and 108 unused-index notices. Multiple permissive policies and unused indexes need review in context; do not delete indexes based only on an unused-index notice.

## Local verification after migration-version cleanup

- `npm run check` rerun on 2026-10-11: 444 passed, 0 failed, 1 skipped (445 tests total). The skipped check is the optional browser accessibility audit because its Playwright dependencies are not installed.
- Active migration filename prefixes are now unique. A regression test asserts uniqueness and verifies that the three archived copies remain byte-identical to their later canonical copies.
- A headless Chromium smoke attempt did not complete because the app pages did not finish loading in the available runner. This is not counted as a passing browser test; a working browser-test harness is still needed.

## Required follow-up before production migration

1. Reconcile the local migration archive with the live 426-entry history and restore the missing migration source or establish the intended canonical baseline. Identify whether the other applied migrations are intentionally stored elsewhere or missing from this package.
2. Restore and verify source for the six deployed Edge Functions missing locally. Run Supabase CLI dry-run/status against the correct environment after restoring the full intended migration set; do not apply a bulk push until the diff is understood.
3. Review the six anonymous `SECURITY DEFINER` endpoints and the most sensitive authenticated RPCs, especially recovery/admin/payment/account-management functions. For `spike_consume_safety_recovery`, preserve anonymous token-based access but change the successful response to `{ok:true}` after confirming the client contract; the current page only consumes the `ok` flag.
4. Test call signaling with two real test accounts and verify that nonparticipants cannot subscribe or publish to another conversation's topics.
5. Review duplicate permissive RLS policies and the unindexed foreign key; keep indexes unless query evidence supports removal.
6. Enable leaked-password protection after confirming the desired Auth configuration.
7. Run browser-based workflows with a real browser test runner; source audit alone does not prove production runtime behavior.

## Follow-up review completed in this pass

- Retrieved the live source payloads for all six Edge Functions missing from the local package and confirmed their deployed versions/JWT settings. The source was inspected through the Supabase connector, but it has not yet been restored into the local ZIP; the connector did not provide a direct filesystem export. These must still be committed into the package with their import maps/config files before it can be considered a complete deployment source bundle.
- Read-only SQL inspection confirmed all six flagged public functions are executable by both `anon` and `authenticated`. No grants or function definitions were changed.
- Re-ran the complete local check suite: 444 passed, 0 failed, 1 skipped.

## Read-only live schema inventory — 2026-10-11

An additional read-only catalog query found 160 public base tables, 2 public views, 301 public functions, 54 public triggers, and 279 public RLS policies. The query found zero public tables or public functions with `impact` in their names. These counts are an inventory snapshot, not an object-by-object parity check; they do not prove that every expected table, column, function body, trigger, grant, or policy matches the approved project. The counts are also recorded in `SUPABASE_MIGRATION_RECONCILIATION_2026-10-11.json`.

## Migration version reconciliation — exact ID comparison

A direct read-only comparison of `supabase_migrations.schema_migrations.version` against the active local migration filename prefixes found only **3 exact version-ID matches**: 426 live history rows, 103 active local SQL files, 423 live version IDs without an exact local file, and 100 local version IDs absent from live history. The 103 local files have unique prefixes. This is more severe than a simple file-count difference: the current local directory is not a safe replay set for the live database. Do not use `db push`, migration repair, reset, or replay until the full canonical history is reconstructed and applied schema state is compared. See `SUPABASE_MIGRATION_RECONCILIATION_2026-10-11.json`.

## Important limitations

No live database or deployment changes were made. This report is not a production security certification. Migration history divergence is a release blocker for any blind migration push.


## Additional alignment gate review — 2026-10-11

### Audit inventory checksum correction

The protected-baseline manifest contained a stale expected checksum/byte count for `all-files.txt`, although the file bytes in the approved ZIP were consistent with the candidate. The manifest metadata was corrected to match the approved package’s actual `all-files.txt` bytes; no application feature source was changed for this correction. The full check suite now validates this protected file successfully.

### Approved-baseline comparison

Compared the audited candidate package with `spikefix_story_cleanup.zip`, the approved baseline identified for this work. The candidate differs only by: the audit report, the migration-prefix regression test, moving three byte-identical duplicate migration copies to a non-active archive, and updating the protected-baseline inventory plus the canonical migration path used by a test. A machine-readable file/hash inventory is included in `SOURCE_BASELINE_COMPARISON_2026-10-11.json`. This does **not** establish that Supabase matches the project.

### Impact retirement check

Read-only live catalog checks on 2026-10-11 found no `public` tables whose names contain `impact` and no `public` functions whose names contain `impact`. The live migration history still includes three historical Impact migrations and a rollback record. Those records are historical evidence, not an instruction to recreate anything. The local app's font-family options can contain the word `Impact`; this is a font name, not the retired product feature. No Impact feature source or database object was restored.

### Source package comparison and function handling

The approved baseline and audited candidate both contain the same three local Edge Function source directories: `admin-register-user`, `admin-user-ops`, and `spike-webauthn`. Six other functions are deployed live but have no local source in either package. Their absence alone does not establish whether they were intentionally removed, intentionally kept remote-only, or omitted from the package. Their deployed code was inspected through the read-only connector for review, but **not copied into the app package and not redeployed**. Before considering any source export, compare function purpose and callers against the approved app and the user's retirement restrictions.

### Remaining release blockers

- Live migration history: 426 entries; local active migration files: 103. Do not run a bulk migration push/reset/replay. Reconstruct a verified migration-to-file mapping first.
- Six remote-only Edge Functions lack local source; preserve live deployments and do not overwrite from this incomplete bundle.
- The recovery RPC currently returns `ok`, target user ID, and email after successful token-based recovery. The user-facing reset page appears to consume `ok`; response minimization to `{ok:true}` is a recommended local migration change, but it has **not** been applied live or added to active migrations because migration history is not reconciled.
- Security advisor warns of six anon-executable `SECURITY DEFINER` functions and disabled leaked-password protection. Review endpoint intent and client contracts before changing grants or Auth settings. Do not revoke anon access from the token recovery RPC without a replacement flow.
- Two-account Realtime authorization and browser workflows remain unverified; the optional accessibility test is skipped because Playwright dependencies are unavailable.

### Live-change statement

No SQL definitions, grants, Auth settings, migrations, Edge Functions, or application deployments were changed during this pass. The package is a reviewed source candidate and reconciliation record, **not** a claim that production is fully aligned or production-ready.

## Follow-up: predictor-sync authorization review (2026-10-11)

- Re-fetched live `spike-predictor-sync` v41 source and confirmed `verify_jwt=false`. The handler's `allowedCaller()` returns true when `allowedApiKey()` accepts the request's `apikey`; `allowedApiKey()` explicitly checks public `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_PUBLISHABLE_KEYS`. This bypasses the later `auth.getUser()` plus `profiles.role` admin/super-admin check for anyone with the public client key. Because the function constructs a service-role Supabase client and upserts `spike_fixtures` and `spike_predictions`, treat this as a high-priority authorization finding.
- Added a **non-deployable review candidate** under `supabase/edge-function-candidates/spike-predictor-sync/`. It documents the finding and proposes a dedicated server-only `SPIKE_PREDICTOR_SYNC_SECRET` for scheduled calls while preserving the authenticated admin path. The candidate is not integrated into a complete function source and has not been deployed.
- Rollout remains blocked until real callers are identified, the dedicated secret is provisioned only to trusted server-side callers (or scheduled access is removed), and staging contract tests cover anonymous public-key requests, invalid/missing secret, valid secret, non-admin user, admin/super-admin, and OPTIONS.
- Separate correctness finding: live `makePred()` derives confidence and scorelines from string lengths and fixture ID length. This is deterministic placeholder logic, not a validated statistical model; do not represent these predictions as statistically grounded. Product behavior must be confirmed before changing the algorithm.
- Re-ran `npm run check` against this updated package: 444 passed, 0 failed, 1 skipped (445 total). The skip remains the optional browser accessibility audit because Playwright dependencies are not installed. These are local source checks only; they do not validate live Supabase behavior.
- Production remains unchanged by this follow-up: no SQL, migration history, function deployment, Auth configuration, or app deployment was modified.
