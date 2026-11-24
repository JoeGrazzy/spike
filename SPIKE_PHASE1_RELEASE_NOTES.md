# SPIKE Phase 1 — Friendship and Engineering Audit Release

- QR scanning follows the request → accept flow; friendship is mutual accepted relationships.
- The live `follows.status` default is now `pending`.
- The follows RLS policies recognize the pending request state.
- Profile Friends count now reflects mutual friendships; Add is an action, not a following count.
- Feed Font Awesome dependency is standardized on Font Awesome Free 7.2.0.
- Project validator now checks duplicate HTML IDs, duplicate JS/CSS includes, and unreferenced CSS.
- Messages smoke test is included in `npm test` and accepts the valid versioned runtime cache keys.

## Verification

- 43 Node tests passed.
- Messages pages smoke test passed.
- `npm run check` passed for 62 JavaScript files, 28 HTML pages, and 64 CSS files.
- Friendship lifecycle database tests passed in rollback-only transactions.

## Not yet verified

Real-device camera/gallery tests, two real authenticated accounts on the deployed site, and Cloudflare deployment/cache propagation remain outstanding.

See `SPIKE_ENGINEERING_AUDIT_2026-11-24.md` for full findings and Supabase advisories.
