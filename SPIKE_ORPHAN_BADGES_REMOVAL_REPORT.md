# SPIKE Cleanup — Orphan Level Badges Removal

**Date:** 2026-11-08  
**Change:** Removed the entire `assets/badges/` directory and its 10 level-badge WebP files.

## Why
The XP / leveling / badge progression system was permanently removed in migrations:
- `20261012120000_remove_leveling_system_permanently.sql`
- `20261012130000_remove_residual_leveling_fields.sql`
- `20261012140000_remove_remaining_live_xp_reward.sql`

No HTML, JS, CSS, or SQL in the active tree referenced these badge assets.  
They were pure orphan media left over from the retired progression feature.

## Files removed
- `assets/badges/01-Newcomer-level-1-10.webp`
- `assets/badges/02-Exploer-level-11-20.webp` (filename typo preserved in historical note)
- `assets/badges/03-Connector-level-21-30.webp`
- `assets/badges/04-Contributor-level-31-40.webp`
- `assets/badges/05-Influencer-level-41-50.webp`
- `assets/badges/06-elite-level-51-60.webp`
- `assets/badges/07-Leader-level-61-70.webp`
- `assets/badges/08-Pionner-level-71-80.webp` (filename typo preserved in historical note)
- `assets/badges/09-trailblazer-level-81-90.webp`
- `assets/badges/10-spike-legend-level-91-100.webp`

~1.48 MB of dead assets removed. No functional or visual change to the live product.

## Verification
- Static search across all `.html`, `.js`, `.css`, `.sql`, `.mjs` confirmed zero remaining references to `assets/badges/` or the individual badge filenames.
- Historical audit baseline JSON files may still mention the old paths; those are intentionally left as historical records.
