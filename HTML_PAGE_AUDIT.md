# SPIKE HTML page audit and repairs

**Audit date:** 18 November 2026  
**Scope:** All 27 root-level HTML pages, their local CSS/JavaScript references, route aliases, Supabase bootstrap/guards, and existing feature controllers.

## Repairs made

1. **Connections search now searches the full connection list.** The UI previously passed a `search` option to the social bridge, but the deployed `get_spike_follow_list` RPC has no search argument and the bridge silently ignored it. The controller now retrieves the privacy-filtered connection projection in 100-row pages (up to 10,000), then matches display name, username, and SP ID before rendering paginated results.
2. **Mutual-connections count corrected.** The UI previously read `total_count` from the first RPC row, but the deployed function returns no `total_count` field. It now derives the total from the full paginated mutual-connection result.
3. **Supabase JS dependency pinned.** All 19 pages that load the SDK now use the exact `2.119.1` release rather than floating `@2`, preventing unreviewed CDN upgrades from changing runtime behavior between visits.
4. **Regression tests added** for route aliases, full-list search, mutual counts, and the existing page integrity checks.

## Page inventory

| HTML page | Role / implementation |
|---|---|
| `index.html` | Sign-in, sign-up and account recovery entry point |
| `feed.html` | Authenticated feed, composer, media, social actions and feed loader |
| `profile.html` | Signed-in user's profile and profile editor |
| `user-profile.html` | Public/other-member profile |
| `followers.html` | Canonical followers, following and mutual-connections renderer |
| `following.html` | Compatibility route forwarding to `followers.html?kind=following` |
| `mutual-connections.html` | Compatibility route forwarding to `followers.html?kind=mutuals` |
| `mutuals.html` | Legacy compatibility route to mutual connections |
| `friends.html` | Friend/connection management |
| `messages.html` | Authenticated inbox |
| `message.html` | Direct conversation and attachments |
| `notifications.html` | Authenticated notification list and actions |
| `rooms.html` | Room discovery and creation |
| `room.html` | Room session, chat and membership controls |
| `wallet.html` | Wallet and ledger display; unsupported purchase/payout actions remain disabled |
| `settings.html` | Account, privacy, notification, theme and security settings |
| `mfa.html` | Authenticator and recovery-code challenge |
| `reset-password.html` | Password recovery completion |
| `admin.html` | Owner-restricted admin console and supported report/directory workflows |
| `referrals.html` | Referral information page; referral rewards remain disabled pending secure server-side reward engine |
| `spike-tools.html` | SPIKE utility/tools surface |
| `share.html` | Share/deep-link surface |
| `help.html` | Help/support information |
| `legal-center.html` | Legal documents and policies index |
| `legal.html` | Legacy route forwarding to legal center |
| `policy.html` | Policy/legal content |
| `view_user.html` | Legacy route forwarding to public user profile |

## Static checks

- 27 HTML pages enumerated.
- Every local CSS and JavaScript asset reference resolves to an existing file.
- No duplicate element IDs detected by the existing source-integrity suite.
- No duplicate local CSS/JS references detected by the existing source-integrity suite.
- JavaScript source and inline JavaScript syntax checks pass.
- All 19 Supabase SDK references use the same exact version.
- Authenticated app pages retain their session guard; public/static pages and compatibility redirects remain intentionally unguarded.

## Features intentionally not represented as complete

- Referral rewards and SP Points credits remain unavailable until a server-side referral qualification and ledger workflow exists.
- Wallet purchase settlement and creator payouts remain restricted to supported backend workflows; client-side balance changes are not enabled.
- Voice/video calling is not implemented; voice-note UI is not represented as a working call service.
- Some account/provider settings (email delivery, OAuth provider credentials, production redirect allowlist, hosting deployment) require dashboard or live-domain verification.

## Verification boundary

The automated source suite verifies source wiring and regression conditions; it is not a substitute for authenticated, multi-account browser testing on the production domain. The local headless Chromium smoke attempt was inconclusive because the browser network service crashed while loading remote CDN resources. No production deployment or live account actions were performed as part of this HTML audit.
