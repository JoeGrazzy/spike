# SPIKE Protected Core

This project is now treated as a **protected baseline**.

## Rules

1. Existing baseline files must not be edited, deleted, renamed, or silently replaced while adding a new feature.
2. New feature work should be additive: add new files/modules/migrations rather than rewriting protected implementations.
3. Existing Supabase migrations are immutable. Database changes must be delivered as new migrations.
4. Server-owned gamification state is protected in the database. Browser clients must use the approved RPCs instead of writing streak/XP state directly.
5. Profile edits are limited to user-facing profile fields; server-owned profile state is not directly writable by the browser.
6. Run `npm run check` before packaging or deployment.
7. A protected-baseline failure is intentional: stop and review the change rather than updating the baseline automatically.

## Intentional core changes

When a real bug fix must change an existing protected file, review the change as a baseline change, run the full regression suite, and only then regenerate `js/audit/protected-baseline.json` with:

```bash
node js/audit/create-protected-baseline.mjs
```

The manifest update must be part of the same reviewed change. Do not use baseline regeneration to hide accidental edits.

## Database protection

The live Supabase project has the `protected_core_integrity_v1` migration applied. It:

- removes direct browser INSERT/UPDATE access to server-owned `user_streaks` and `xp_transactions`;
- restricts direct `profiles` INSERT/UPDATE access to user-editable profile fields;
- protects streak and XP invariants with database constraints.

The streak RPCs remain the authoritative mutation path.
