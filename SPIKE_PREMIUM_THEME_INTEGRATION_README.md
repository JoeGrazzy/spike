# SPIKE Premium 10-Theme System — Integration Package

This patch adds a shared semantic theme authority and a canonical 10-theme registry to the supplied SPIKE static app source.

## Themes
Light: Pearl Luxe, Arctic Blue, Sage Serenity, Rose Champagne, Solar Gold.
Dark: Midnight Amethyst, Cyber Ice, Emerald Elite, Ruby Noir, Titanium Pro.

## Integration
- Shared CSS is loaded last on every top-level HTML page in this archive.
- The early bootstrap sets the stored theme before page styles render to reduce theme flash.
- Existing `spike-feed-style` localStorage key and `SPIKE_THEME` API are retained for compatibility.
- Existing app JS, Supabase integration, migrations, call/room/messaging functionality and assets are otherwise left intact.

## Important validation boundary
Static source checks do not prove production rendering, contrast for every custom component, cross-device behavior, Supabase sync, or multi-user live functionality. Test all pages in a deployed staging build and inspect feature-specific custom CSS/components before production release. Theme preference remains the existing localStorage/app settings flow; this patch does not introduce new database writes or change RLS.
