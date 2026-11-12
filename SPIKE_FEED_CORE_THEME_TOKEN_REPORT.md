# SPIKE Theme Token Pass — Feed Core

**Date:** 2026-11-08  
**Scope:** `css/feed-core.css`

## Problem
`feed-core.css` defined its own `:root` short aliases with a fixed dark-purple palette and a separate `html[data-theme="light"]` override. Those redefinitions could fight the five-theme authority (`spike-five-theme-authority.css`), which already sets both `--spike-*` and the short aliases per theme ID. Additional hard-coded purple accents remained on brand sparkles, verified badges, hashtags, avatars, and gradients.

## Changes
1. **`:root` block** now defers every short alias to the corresponding `--spike-*` token, with Theme 1 values as fallbacks only.
2. **Legacy light selector** retained only for pages that still set `data-theme="light"` without `data-spike-style`.
3. **Visible purple accents** (verified badge, hashtags, avatar gradients, brand sparkle color, sticky header background, share primary button gradient path, media-grid background) routed through `--spike-accent` / `--spike-action-bg` / `--spike-bg`.
4. Brand sparkle text-shadow colored glow uses `color-mix` with the active accent instead of fixed violet RGBA.

Layout, spacing, and component structure are unchanged.

## Verification
- Short aliases resolve through five-theme authority when the authority stylesheet is loaded.
- No functional JS or HTML changes.
- Previous cleanups (orphan badges, command-menu tokens) retained.

## Follow-up
- `feed-features.css` still has a similar fixed-accent set.
- `room-chat-core.css` and `spike-surface-controls.css` remain good candidates.
