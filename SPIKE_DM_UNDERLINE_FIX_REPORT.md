# SPIKE DM — Tap underline fix v1.3

**Date:** 2026-11-11

## Problem
On Android, tapping conversation rows underlined names, presence, and previews because rows are `<a class="item">` and only base `a{text-decoration:none}` was set — not `:active`/`:focus`/`:hover`.

## Fix
- Explicit no-underline on all link states site-scoped under `html[data-spike-style]`
- `.item` / `.itemRow` descendants forced clean
- Attachment download links keep underline
- Pin + avatar leftovers routed to theme tokens
