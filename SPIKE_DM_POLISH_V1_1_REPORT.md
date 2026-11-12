# SPIKE DM Messages — Polish v1.1 (touch + empty states)

**Date:** 2026-11-08  
**Scope:** `css/spike-dm-theme-v1.css`, `messages.html`, `message.html`

## Enhancements
1. **Composer touch targets** — media+, voice, and send controls are 48×48px with larger radius; textarea uses 16px font to avoid iOS focus zoom.
2. **Mobile header / list / chips** — slightly larger hit areas and padding under 720px width.
3. **Empty states** — themed dashed card, accent icon, clearer hierarchy; inbox empty markup uses `role="status"` and structured body text.
4. **Bubble shape** — subtle asymmetric radius (mine vs theirs) for easier scanning.
5. **Thread empty copy** — slightly warmer first-message prompt.
6. Stylesheet cache query bumped to `?v=1.1`.

## Not changed
Realtime messaging, calls, voice recording logic, drafts, pin/archive behavior.

## Verification
Static packaging only. Device QA still recommended for thumb reach on composer row.
