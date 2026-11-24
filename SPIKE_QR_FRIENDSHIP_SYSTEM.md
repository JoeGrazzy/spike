# SPIKE QR Friendship System

Date: 24 November 2026

## Product rule

**Scanning a SPIKE QR and confirming sends a friend request. Friendship is created only when the recipient accepts.**

- Mutual accepted follows = friends
- QR scan → owner card → Send friend request → Requests → Accept
- One-way follow is not the primary social graph for “friends”
- A reciprocal pending request may be accepted automatically because both people have already requested each other

## Backend

New migration:

`supabase/migrations/20261124100000_spike_qr_friendship_system_v1.sql`

| RPC | Purpose |
|-----|---------|
| `spike_connect_via_qr(p_target_user_id)` | Compatibility alias for sending a friend request; never creates instant friendship. |
| `spike_unfriend(p_target_user_id)` | Deletes both directions. |
| `spike_list_mutual_friends(limit, offset)` | Lists mutual friends for the signed-in user. |

Apply both migrations in timestamp order on your Supabase project before relying on the RPCs in production. The request migration expands the follows status constraint to support pending requests and converts legacy requested rows.

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

1. You open **My SPIKE QR** on Profile
2. Friend opens **Scan QR** (camera or gallery)
3. Scan opens the owner preview card
4. Confirm sheet → **Send friend request**
5. Recipient opens **Friends → Requests** and accepts
6. Both users appear under **Friends**; Message / Unfriend available

## Deploy notes

1. Run the new SQL migration on Supabase
2. Deploy the updated JS files (platform bootstrap, profile runtime, friends controller)
3. Hard-refresh clients so cached JS is replaced
