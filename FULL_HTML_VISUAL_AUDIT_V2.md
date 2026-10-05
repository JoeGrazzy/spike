# SPIKE Full HTML Visual Audit V2

Baseline: SPIKE Global Page Audit V1 built on protected Index UX V6.

## Scope
29 production HTML surfaces were traced again for font ownership, CSS authority, safe-area duplication, width containment, viewport overflow, fixed/viewport sizing, wrapping, and mobile geometry.

## Corrections made
- Replaced the global visual authority with `css/spike-global-page-authority-v2.css`.
- Declared the bundled static ExtraBold OTF as discrete 800 and 900 faces instead of a variable 800–900 range.
- Disabled font synthesis so unsupported weights do not silently become device-dependent synthetic fonts.
- Removed the duplicate legacy safe-area stylesheet from `index.html`.
- Removed the remote Google Inter dependency from `help.html`; it now uses the bundled SPIKE font authority.
- Kept Room Chat's remote font family list because it is an intentional user-selectable message-font feature.
- Added regression tests covering global authority order, exactly-one safe-area loading, remote-font exceptions, bundled 800/900 faces, and structural containment.

## Result
- 29/29 production pages load the global authority exactly once after Theme V3.
- 29/29 production pages load exactly one safe-area stylesheet.
- Remote font CSS remains only on `room_chat.html`, where it is intentional.
- Bundled SPIKE Inter explicitly covers 400/500/600/700/800/900.
- Structural containment remains width-safe for controls, media, code/pre, tables, and flex/grid descendants.
- Targeted V2 audit: 5/5 passed.
- Full existing suite remains at the same 10 pre-existing failures and 1 skip; no new failure was introduced by the V2 visual layer.

## Rendering limitation
A live Chromium render could not be completed reliably in the current execution environment because browser execution is administrator-restricted/intermittent. Therefore this audit proves source-level CSS/DOM contracts and automated regressions, but does not claim device-level visual perfection without a real browser/device render.
