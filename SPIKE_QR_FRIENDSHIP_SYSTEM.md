# SPIKE QR Friendship System

Date: 24 November 2026

## Product rule

**Scanning a SPIKE QR (and confirming) is how friendships are created.**

- Mutual accepted follows = friends
- One-way follow is no longer the primary social graph for “friends”
- No friend request for the QR path — connect is instant after confirm

## Backend

New migration:

`supabase/migrations/20261124100000_spike_qr_friendship_system_v1.sql`

| RPC | Purpose |
|-----|---------|
| `spike_connect_via_qr(p_target_user_id)` | Creates mutual accepted follows (both directions). Blocks self, blocked users, inactive accounts. Idempotent. |
| `spike_unfriend(p_target_user_id)` | Deletes both directions. |
| `spike_list_mutual_friends(limit, offset)` | Lists mutual friends for the signed-in user. |

Apply this migration on your Supabase project before relying on the RPCs in production.

## Client

### `js/spike-platform-bootstrap.js`
- `SPIKE.social.connectViaQr(db, targetId)`
- `SPIKE.social.unfriend(db, targetId)`
- `SPIKE.social.listMutualFriends(db, options)` (with client-side mutual fallback)

### `js/spike-profile-runtime.js`
- QR payload includes `&connect=1`
- Camera / gallery scan → **connect preview** (not only profile navigation)
- **SPIKE Connect instantly** calls `connectViaQr`
- Deep links: `profile.html?uid=…&connect=1` and `profile.html#scan`

### `js/spike-friends-controller.js`
- Friends list = **mutual only**
- Unfriend removes both directions
- Suggestions CTA: “Scan QR to connect” (opens profile scanner)
- Empty state explains QR as the way to add friends

## User flow

1. You open **My SPIKE QR** on profile
2. Friend opens **Scan QR** (camera or gallery)
3. Confirm sheet → **SPIKE Connect instantly**
4. Both become mutual friends
5. Friends page shows them under Friends; Message / Unfriend available

## Deploy notes

1. Run the new SQL migration on Supabase
2. Deploy the updated JS files (platform bootstrap, profile runtime, friends controller)
3. Hard-refresh clients so cached JS is replaced
