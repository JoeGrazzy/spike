# SPIKE Feed Header Menu V4 — Architecture and Rationale

## Goal
Replace the previous card-heavy menu hierarchy with a compact, mobile-first command panel while preserving every established route and runtime action contract.

## Information architecture
1. **Identity** — avatar, current account identity, profile destination, close control.
2. **Search / Ask SPIKE** — the highest-utility global action, using the existing Ask SPIKE overlay.
3. **Primary hubs** — Friends, Rooms, Saved, and My Pulse. These represent common return-to tasks and existing destinations/actions.
4. **Live** — one prominent live-broadcast entry, separated from routine navigation because it is an intentional, high-attention action.
5. **Account & support** — Settings, Safety Center, and Policy.
6. **Progressive disclosure** — Theme, Close Friends, Guide, Appeals, and Admin stay in “More tools” rather than competing with primary tasks.
7. **Session boundary** — Sign Out is isolated at the bottom and retains its confirmation flow.

## Ranking principles
- Rank actions by expected frequency and task utility, not by decorative color or feature novelty.
- Keep search prominent because it provides cross-product entry without duplicating feed filters.
- Keep creation, discovery, trending, nearby, and story controls in their existing Feed/navigation surfaces; do not duplicate them in this menu.
- Keep Live visually distinct, but do not promote it above routine utility actions.
- Group trust/privacy and account controls together; progressively disclose lower-frequency options.

## Implementation boundaries
- `feed.html` owns semantic structure and stable IDs.
- `css/spike-feed-command-menu-v4.css` owns V4 menu geometry and responsive presentation, scoped to `#menuOverlay`.
- Existing `js/feed-runtime-04-3.js` remains the action authority. Native links retain their `href`; action buttons retain their `data-menu-action` contracts.
- Existing bottom-navigation hide/show ownership and identity sync remain unchanged.
- No database, Supabase policy, RPC, or migration changes are needed for this UI-only rebuild.

## Accessibility and responsive behavior
- Preserve dialog semantics and labelled close control.
- Maintain visible focus styles and semantic buttons/links.
- Keep the panel scrollable within the viewport and respect mobile safe-area insets.
- Respect reduced-motion preferences.
- Keep the menu's primary content scannable with touch-sized rows and short descriptions.

## Verification
- Run focused menu/navigation regression tests first.
- Run `npm run check` for project-wide syntax and audit coverage.
- A full audit failure must be triaged against the uploaded archive baseline; do not regenerate the protected baseline to conceal unrelated failures.
