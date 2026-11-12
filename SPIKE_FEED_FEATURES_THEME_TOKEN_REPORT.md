# SPIKE Theme Token Pass — Feed Features

**Date:** 2026-11-08  
**Scope:** `css/feed-features.css` (targeted accent conversion)

## Changes
Replaced fixed purple accent hexes and purple-tinted rgba borders/shadows/gradients on the legacy menu sheet with `--spike-accent` / `--spike-action-bg` / `--spike-surface` / `--spike-bg` via `var()` and `color-mix()`.

Does not rewrite layout. Complements the feed-core and command-menu token passes.

## Verification
Static replacements only. No HTML/JS changes.
