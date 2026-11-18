# SPIKE Gift Ledger Missing-Relation Repair — V10

Date: 2026-11-18
Project: `cjqpyndceqyqsijihxbb`
Base source: `SPIKE_FEATURE_TRACE_AUDIT_FIXED_V9.zip`

## Reported production error

`relation "public.spike_live_audio_gift_transactions" does not exist`

## Root cause

The live-audio gift transaction relation had already been removed as part of the Rooms live-audio teardown, but three active gift-wallet RPC paths still queried it:

1. `public.spike_my_received_gifts(integer)` delegates to `private.spike_my_received_gifts_internal(integer)`, whose query contained a `UNION ALL` against the retired relation.
2. `public.spike_my_gift_wallet_summary()` directly aggregated the retired relation.
3. `public.spike_reconcile_my_gift_earnings()` attempted to reconcile room-owner and broadcaster earnings from the retired relation.

A fourth stale reference was present in `private.admin_user_delete_preflight(uuid)`. It was guarded by `to_regclass`, so it was not the reported runtime failure, but it was removed to align the function with the current schema.

## Live database repairs applied

- Migration `20261118094355_spike_remove_orphan_live_audio_gift_rpc_references` replaces the three gift RPC implementations so they use only the active `public.spike_room_gift_transactions` ledger.
- Migration `20261118094429_spike_remove_stale_live_audio_delete_preflight_reference` removes the retired table from the admin deletion preflight financial-history inventory.
- Existing RPC signatures, authentication checks, security-definer configuration, search paths, wallet JSON keys, creator-earnings ledger checks, and authenticated-only execution grants were preserved.
- No dummy relation was created. No gift, wallet, or creator-earnings records were deleted or rewritten.

## Frontend source repair

- `wallet.html` no longer renders the retired `live_audio` gift context label. Gift history is presented as the active Room gift history.
- The existing received-gift, wallet-summary, and gift-earnings reconciliation RPC calls remain in place.
- Voice notes are unchanged and remain independent of calls.

## Verification

- Confirmed both migrations exist in live Supabase migration history with versions `20261118094355` and `20261118094429`.
- Ran `spike_my_received_gifts(5)` as an authenticated synthetic test identity: returned an empty array, no missing-relation error.
- Ran `spike_my_gift_wallet_summary()` as an authenticated synthetic test identity: returned the expected zero-valued summary shape, no missing-relation error.
- Ran `spike_reconcile_my_gift_earnings()` as an authenticated synthetic test identity: returned `ok: true`, zero checked/credited transactions, no missing-relation error. The transaction was rolled back.
- Confirmed `anon` cannot execute the internal/public gift RPCs and `authenticated` retains execution.
- Re-scanned all live function definitions: zero functions still reference `spike_live_audio_gift_transactions`.
- Re-scanned active HTML, JS, MJS and CSS: no retired live-audio gift table reference or live-audio gift UI branch remains.
- Focused regression tests: 3 passed, 0 failed.
- Static validation: 51 standalone JS/MJS files passed `node --check`; 66 inline script blocks passed; 82 CSS files parsed with zero syntax errors.

## Limitations

The smoke tests used a synthetic authenticated UUID with no personal data and therefore verified RPC execution and response shape, not a real user's gift history or a live browser session. A deployed authenticated wallet session should still be checked after uploading the updated website source.
