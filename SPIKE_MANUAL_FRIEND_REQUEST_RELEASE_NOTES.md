# SPIKE Manual Friend Requests — Release Notes

## Friends page
- Replaced the Discover card's QR redirect with a direct **Add friend** action.
- The Add action calls `SPIKE.social.sendFriendRequest`, backed by `spike_send_friend_request(p_target_user_id)`.
- Successful sends refresh Friends, Requests, recommendations, and Discover data.
- Incoming requests retain Accept / Decline; outgoing requests retain Cancel request.
- Removed QR-first instructions and scan navigation from `friends.html` and its controller.
- `frames.html` was not present in the supplied project archive; the matching page is `friends.html`.

## Supabase
- Tightened `follows_insert_self` so direct client inserts can create only the caller's own pending request and cannot target a blocked member.
- Removed direct client UPDATE acceptance. Accepting is now exclusively handled by the atomic `spike_accept_friend_request` RPC.
- Confirmed the required friendship/discovery/block RPC signatures exist and are executable by `authenticated`, not `anon`.
- Friend-request notification wording and notification preference routing now use the friend-request category.

## Validation
- JavaScript syntax checks passed.
- Automated regression tests passed.
- Messages page smoke test passed.
- Project validation passed for local references, HTML, CSS, Worker config, and migrations.

## Not claimed
Real-device camera testing is not part of this manual flow. End-to-end testing with two separately authenticated production accounts still requires browser/device sessions; no such session was available during this build.
