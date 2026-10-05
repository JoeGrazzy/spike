# SPIKE message-options contrast fix

## Root cause
The message context menu had two competing visual authorities: the legacy `.context` rule used the legacy `--solid` surface, while the menu contrast hardening bound text to SPIKE theme text tokens. This could produce a light/white menu surface with light text, exactly as seen on the mobile screenshot. The menu also had no explicit compact mobile sizing/icon authority.

## Fix
The existing context-menu CSS authority in `message.html` and `messages.html` was corrected rather than adding another competing override. The menu now derives its surface, text, border, accent and danger colors from the active SPIKE theme as one coherent token set, with compact 40px actions, explicit icon styling, hover/focus/active states, responsive mobile width, and controlled overflow.

## Scope
No Supabase/backend changes. Voice-note runtime files were not changed by this fix.

## Verification
Focused context-menu + voice regression suite: 15/15 passed.
Full audit: 342 passed, 10 failed, 1 skipped. The 10 failures are existing/unrelated project audit failures; they include navigation/safe-area contracts, protected-baseline audit drift, reactions, safety center, theme audit, and bridge-harness UI contract.

## Browser limitation
A physical-device browser render was not available in this environment, so the screenshot-level computed rendering on the user's phone cannot be claimed as live-device verified.
