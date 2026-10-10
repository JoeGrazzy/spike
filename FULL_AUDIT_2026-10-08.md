# SPIKE Full Project Audit — 2026-10-08

## Source of truth
The audit started from the original `SPIKE.zip`, then merged the already-built Admin Control Center v1.3 additions without replacing the original SPIKE application with a later unrelated package.

## Scope
- 330 files in the final working tree.
- Original source inventory: 325 files.
- ~37,800 lines of text/code/config audited.
- HTML, JavaScript, CSS, Supabase migrations/functions, privacy/visibility contracts, activity/profile routes, admin operations, and regression tests reviewed.

## Root cause found for the reported activity/visibility problem
The public member profile route (`view_user.html`) had no Activity summary at all. It exposed Posts/Followers/Following stats but did not expose the Activity card used by the owner profile.

A second cross-route authorization defect was also found in `profile.html`: when viewing another member it checked profile, posts, media and online visibility but did not check `friends_visibility`. Consequently the two public profile surfaces could disagree about whether follower/following activity was visible.

## Fix
1. `view_user.html`
   - Added a public Activity summary showing authorized Public posts, Media posts and Followers.
   - Activity values reuse the already-authorized post/media/friends visibility state; no private activity events are exposed.
2. `profile.html`
   - Added the missing `can_view_spike_friends` authorization check for another member.
   - Activity follower count now respects friends visibility.
   - Activity post/media values respect their respective visibility gates.

## Backend verification
Live Supabase project: `cjqpyndceqyqsijihxbb`.

Verified live privacy configuration for existing profiles: profile/posts/media/friends visibility are public for the current populated profiles.

Verified all 20 non-self viewer/owner pairs currently pass:
- profile visibility: 20/20
- posts visibility: 20/20
- media visibility: 20/20
- friends visibility: 20/20

Verified the existing public-post RPC returns a real post for a non-owner viewer; no fake frontend data was used.

The raw `user_activity_events` table remains owner-only by design. It is used for private intelligence/reputation and is not appropriate to expose directly as public activity because its metadata can contain private information.

## Tests
- Full regression: 430 tests
- Passed: 429
- Failed: 1
- The only failure is `protected-baseline.test.mjs`, reporting intentional hash changes to protected `admin.html`, `profile.html`, and `view_user.html`.
- No protected baseline manifest or test was modified.
- New public-profile activity regression test: 2/2 passed.
- Static audit: passed.
- Inline HTML JavaScript syntax: passed.
- RPC gate: skipped because Supabase CI secrets are not configured in the local environment.

## Important integrity note
The protected baseline failure is reported rather than hidden. `protected-baseline.json` and `protected-baseline.test.mjs` were not altered to make the suite appear clean.
