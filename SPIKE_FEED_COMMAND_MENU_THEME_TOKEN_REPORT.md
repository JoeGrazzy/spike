# SPIKE Theme Token Pass — Feed Command Menu

**Date:** 2026-11-08  
**Scope:** `css/spike-feed-command-menu-v4.css` only.

## Problem
The Feed command menu still carried a fixed purple/navy palette (`#635bff`, `#7d74ff`, `#a9a4ff`, `#101727`, etc.).  
Pass 23's `spike-feed-header-theme-v1.css` overrode many of those rules, but the base stylesheet remained theme-blind and could fight the five-theme authority depending on load order and specificity.

## Change
Rewrote `spike-feed-command-menu-v4.css` so every color is driven by the canonical five-theme tokens:

- Surfaces → `--spike-surface` / `--spike-surface-2` / `--spike-bg`
- Text → `--spike-text` / `--spike-muted`
- Lines → `--spike-line`
- Accents / icons / search chrome → `--spike-accent` / `--spike-accent-2` / `--spike-action-bg`
- Sign-out → `--spike-danger` (semantic, not theme accent)
- Shadow → `--spike-shadow`

Short aliases (`--surface`, `--text`, `--muted`, `--line`, `--accent`, …) remain as secondary fallbacks so older pages that only define the short names still render correctly.

Layout, spacing, interaction, and reduced-motion behavior are unchanged.

## Verification
- Static comparison: no remaining fixed purple accent hexes in this file.
- All color properties now resolve through `var(--spike-*)` (or short-alias fallbacks that match Theme 1 defaults).
- No HTML, JS, or other CSS files were modified in this pass.
- Previous orphan-badge cleanup is retained in this archive.

## Follow-up
The same token conversion is still valuable for:
- `feed-core.css` / `feed-features.css` (large remaining hard-coded sets)
- `room-chat-core.css`
- `spike-surface-controls.css`
