# SPIKE Audit — Pass 8: Direct-message history pagination

## Scope
Fixed the direct-message history query in `message.html` and added older-history pagination. The protected `js/spike-dm-realtime-calls-v2.js` runtime and database migrations were not changed.

## Findings and changes
- **Newest messages were not guaranteed to load.** The prior query sorted ascending and applied a 500-row limit, which selected the oldest page in long conversations. The query now sorts descending by `created_at` and then `id`, requests a 500-row range from offset zero, and sorts the loaded page back into chronological display order.
- **Earlier history was not reachable.** Added a “Load older messages” control that fetches the next page using the count of database rows fetched (including deleted rows, so paging offsets do not drift when deleted messages are filtered from display).
- **Duplicate-safe merge.** Older pages merge by message ID and are sorted consistently with realtime and locally sent messages.
- **Scroll continuity.** Loading older history adjusts scroll position by the change in content height to reduce jumping away from the reader's current location.
- **Read/reaction paths retained.** The existing reaction lookup and mark-read update remain in the load flow. Mark-read updates local `read` flags after a successful database update.
- **Failure handling.** A failed older-page request reports an error and leaves the control available for retry.

## Verification
- `npm test`: **494 tests discovered; 493 passed, 0 failed, 1 skipped**.
- `node --check js/spike-dm-realtime-calls-v2.js`: passed.
- Inline JavaScript syntax check for all 3 inline scripts in `message.html`: passed.
- The regression suite includes a protected-runtime baseline check; it passed with the runtime unchanged.
- ZIP integrity check: performed on the delivered archive.

## Limitations / not verified
- The skipped test is an optional browser/Playwright check; browser automation dependencies were unavailable in this environment.
- No live two-account conversation test was run.
- No production deployment or database migration was performed.
- The thread continues to load 500 messages per page. This pass adds paging for older history but does not redesign inbox unread aggregation or the broader read/delivery receipt lifecycle.
