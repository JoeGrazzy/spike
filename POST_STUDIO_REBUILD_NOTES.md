# SPIKE Post Studio Rebuild

- Replaced the cluttered composer presentation with a clean, mobile-first post studio.
- Retained existing form IDs and publish/media/schedule/draft handlers to avoid breaking the live posting pipeline.
- Improved the hierarchy: composer title, writing surface, media/link/schedule actions, optional creator tools, then a single prominent Publish post action.
- Added focus states, responsive tool grid, compact collapsed state, and reduced-motion handling.
- Updated placeholder and supporting copy.
- Existing post records are not deleted. This is a rebuild of the post-creation experience, not destructive removal of user content.
- Backend gamification deactivation migration is recorded separately in `supabase/migrations/20261010120000_disable_all_gamification_feature_v1.sql`.


## Leveling feature removal (2026-10-10)
- The live Supabase project was cleaned of leveling/gamification tables, RPCs, and profile columns.
- This distribution excludes the standalone leveling hardening migrations and leveling experience assets. Historical migrations elsewhere may still mention the old feature; do not replay the full historical migration directory against an already-provisioned database.
