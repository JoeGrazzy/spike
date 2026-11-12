# SPIKE — Presence Timestamp Fix (Historical / Superseded)

Date: 2026-10-13

This report documents the earlier inbox-only timestamp helper and migration. That independent browser helper (`js/presence-timestamps.js`) has since been permanently retired by the SPIKE Presence V2 rebuild. Its heartbeat, polling and DOM update responsibilities are now owned by the single site-wide `js/presence.js` runtime.

The persistent database boundary remains the authenticated `touch_user_presence` writer and privacy-filtered `spike_get_user_presence` reader. The existing migration files are retained as database history; they were not deleted or rewritten during the V2 frontend rebuild.

For current implementation details and verification, see `SPIKE_PRESENCE_V2_REBUILD_REPORT.md`.
