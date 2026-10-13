# SPIKE full source inventory and three-theme dependency audit

Generated from the current cleanup package. This is a static source audit; it does not inspect a live deployment, user browser storage, or live database rows.

## Inventory

- Total files: **383**
- `.css`: 54
- `.html`: 21
- `.js`: 40
- `.json`: 7
- `.jsonc`: 1
- `.md`: 6
- `.mjs`: 93
- `.mp3`: 3
- `.otf`: 5
- `.png`: 5
- `.sql`: 128
- `.ts`: 4
- `.txt`: 1
- `.webp`: 13
- `[no extension]`: 2

## Shared theme-layer coverage

| HTML page | theme.css | spike-theme-experience-v3.css | spike-theme-final-authority-v1.css | spike-theme-runtime-v3.css | spike-three-theme-authority.css |
|---|---:|---:|---:|---:|---:|
| `admin.html` | yes | yes | yes | yes | yes |
| `feed.html` | yes | yes | yes | yes | yes |
| `friends.html` | yes | yes | yes | yes | yes |
| `guide.html` | yes | yes | yes | yes | yes |
| `help.html` | yes | yes | yes | yes | yes |
| `index.html` | yes | yes | yes | yes | yes |
| `legal.html` | yes | yes | yes | yes | yes |
| `live.html` | yes | yes | yes | yes | yes |
| `message.html` | yes | yes | yes | NO | yes |
| `messages.html` | yes | yes | yes | NO | yes |
| `notifications.html` | yes | yes | yes | yes | yes |
| `policy.html` | yes | yes | yes | yes | yes |
| `policy_appeals.html` | yes | yes | yes | yes | yes |
| `profile.html` | yes | yes | yes | yes | yes |
| `reset-password.html` | yes | yes | yes | yes | yes |
| `room.html` | yes | yes | yes | yes | yes |
| `room_chat.html` | yes | yes | yes | yes | yes |
| `rooms.html` | yes | yes | yes | yes | yes |
| `settings.html` | yes | yes | yes | yes | yes |
| `share.html` | yes | yes | yes | yes | yes |
| `view_user.html` | yes | yes | yes | yes | yes |

Two pages omit `spike-theme-runtime-v3.css`; verify whether that is intentional before normalizing imports, because adding it may alter component rendering.

## Old-theme string scan

Searched HTML, CSS, JavaScript/TypeScript, SQL, Markdown, and JSON source files. Text matches are clues and must be interpreted in context.

### Legacy palette names (Cinder/Tidal/Lumen/other former labels)
- Matches: **2**
- `SPIKE_THEME_CONFLICT_AUDIT.md:7` — `- Replaced the unapproved temporary theme names Cinder, Tidal, and Lumen with neutral Theme 1–3 labels in the active registry, settings selector, and theme-focused tests. The final`
- `js/audit/tests/theme-three.test.mjs:5` — `test('Exactly three neutral theme slots are registered',()=>{assert.match(js,/name:'Theme 1'/);assert.match(js,/name:'Theme 2'/);assert.match(js,/name:'Theme 3'/);assert.doesNotMat`

### Explicit old theme IDs 4–10 in theme selectors
- Matches: **0**

### Old localStorage keys (cleanup references are expected)
- Matches: **3**
- `js/theme.js:17` — `if(persist){try{localStorage.setItem(KEY,String(id));localStorage.removeItem('spike-feed-style');localStorage.removeItem('spike-theme');localStorage.removeItem('spike-setting-theme`
- `js/theme.js:25` — `try{localStorage.removeItem('spike-feed-style');localStorage.removeItem('spike-theme');localStorage.removeItem('spike-setting-theme_style');}catch(_){}`
- `js/audit/tests/project-integrity.test.mjs:47` — `assert.doesNotMatch(feed, /const KEY\s*=\s*["']spike-feed-style["']/);`

### Removed legacy stylesheet filename references
- Matches: **0**

## Theme-layer complexity

| File | Lines | Hex color literals | `!important` declarations | `data-spike-style` selector blocks |
|---|---:|---:|---:|---:|
| `css/theme.css` | 96 | 0 | 54 | 0 |
| `css/spike-theme-experience-v3.css` | 109 | 0 | 76 | 0 |
| `css/spike-theme-final-authority-v1.css` | 287 | 0 | 83 | 0 |
| `css/spike-theme-runtime-v3.css` | 195 | 0 | 140 | 0 |
| `css/spike-three-theme-authority.css` | 20 | 0 | 14 | 0 |

## Findings and safe next actions

1. The active theme registry is centralized in `js/theme.js` and normalizes persisted IDs to 1–3.
2. All 21 production HTML pages load `css/spike-three-theme-authority.css` and `js/theme.js`.
3. The five shared theme-related CSS files are not interchangeable: the experience/final/runtime files contain component rules and aliases as well as theme-scoped selectors. Do not delete them based on filename alone.
4. `message.html` and `messages.html` do not include `css/spike-theme-runtime-v3.css`, unlike the other pages. This is a verified stylesheet coverage difference, not automatically a defect; inspect runtime token consumers before changing it.
5. Old storage key strings in `js/theme.js` are intentional one-time cleanup code. Removing those strings would stop migration of returning users away from legacy preferences.
6. Historical migrations, test baselines, and audit records can contain old IDs or labels without activating old themes. Keep archival data separate from active runtime checks.
7. Next technical phase: build a token-consumer map for each shared theme CSS layer, identify page-local overrides, then consolidate rules with before/after screenshots or browser computed-style tests. Run the full suite after each narrow change.

## Verification

- `npm test`: 471 passed, 0 failed, 1 optional test skipped (472 total).
- This pass only added the audit report; it did not alter application runtime behavior, live data, or deployment.
## Theme token dependency trace (static scan)

This scan maps custom-property definitions in the five shared theme layers to textual references elsewhere in the source. A reference count is a triage clue, not proof that a token is safe to remove: CSS inheritance, runtime JS, and page-specific cascade order still matter.

### `css/theme.css`
- Unique custom properties defined: 62
- Properties with at least one textual reference in another source file: 59 of 62
  - `--a` → `message.html`, `messages.html`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`
  - `--a2` → `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`
  - `--accent` → `rooms.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `room.html`, `css/spike-theme-runtime-v3.css`, `css/premium-back.css` (+4 more)
  - `--accent2` → `rooms.html`, `settings.html`, `css/spike-theme-runtime-v3.css`, `css/spike-three-theme-authority.css`
  - `--bg` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `room_chat.html`, `admin.html`, `room.html`, `reset-password.html` (+11 more)
  - `--btn-danger` → `notifications.html`, `policy_appeals.html`, `js/spike-dialog.js`, `css/policy.css`, `css/spike-signal-studio.css`
  - `--btn-primary` → `js/spike-dialog.js`, `css/spike-surface-controls.css`
  - `--btn-primary-2` → `js/spike-dialog.js`, `css/spike-surface-controls.css`
  - `--btn-success` → `policy_appeals.html`, `css/policy.css`, `css/spike-signal-studio.css`
  - `--btn-warning` → `css/policy.css`
  - `--card-bg` → `css/spike-three-theme-authority.css`
  - `--card-border` → `css/spike-three-theme-authority.css`
  - `--line` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `guide.html`, `room_chat.html`, `admin.html`, `room.html` (+20 more)
  - `--muted` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+24 more)
  - `--primary` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/spike-three-theme-authority.css`
  - `--primary2` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/spike-three-theme-authority.css`
  - `--radius` → `help.html`, `settings.html`, `css/feed-core.css`, `css/index.css`
  - `--shadow` → `help.html`, `settings.html`, `room.html`, `profile.html`, `view_user.html`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/index.css` (+1 more)
  - `--sp-accent` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-accent-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-accent-3` → `help.html`, `admin.html`, `friends.html`, `css/spike-theme-runtime-v3.css`
  - `--sp-bg` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-danger` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-good` → `help.html`, `admin.html`, `friends.html`, `css/spike-theme-runtime-v3.css`
  - `--sp-line` → `help.html`, `admin.html`, `friends.html`, `css/spike-theme-runtime-v3.css`
  - `--sp-muted` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-shadow` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-shadow-soft` → `help.html`, `admin.html`, `friends.html`, `css/spike-theme-runtime-v3.css`
  - `--sp-surface` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface-solid` → `help.html`, `admin.html`, `friends.html`, `css/spike-theme-runtime-v3.css`
  - `--sp-text` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`
  - `--spike-accent` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+19 more)
  - `--spike-accent-2` → `help.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css` (+11 more)
  - `--spike-action-bg` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`, `js/audit/tests/spike-signal-studio.test.mjs` (+1 more)
  - `--spike-action-bg-2` → `js/spike-native-v2.js`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`, `js/audit/tests/spike-signal-studio.test.mjs`
  - `--spike-action-text` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`
  - `--spike-bg` → `rooms.html`, `help.html`, `settings.html`, `notifications.html`, `admin.html`, `feed.html`, `profile.html`, `js/spike-dialog.js` (+12 more)
  - `--spike-blur` → `css/policy.css`, `css/spike-post-actions-v2.css`
  - `--spike-body-image` → `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`
  - `--spike-card-bg` → `admin.html`, `css/policy.css`, `css/spike-three-theme-authority.css`
  - `--spike-card-border` → `admin.html`, `css/policy.css`, `css/spike-three-theme-authority.css`
  - `--spike-card-shadow` → `admin.html`, `css/policy.css`
  - `--spike-control-radius` → `policy_appeals.html`, `js/spike-native-v2.js`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-post-actions-v4.css` (+3 more)
  - `--spike-font` → `css/spike-index-authority-v5.css`, `css/spike-global-page-authority-v2.css`, `css/policy.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `js/audit/tests/theme-experience-v3.test.mjs`
  - `--spike-glow` → `help.html`, `policy_appeals.html`, `profile.html`, `js/spike-native-v2.js`, `css/policy.css`, `css/spike-theme-experience-v3.css`, `css/spike-post-actions-v4.css`, `css/spike-index-authority-v3.css` (+3 more)
  - `--spike-line` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+16 more)
  - `--spike-muted` → `help.html`, `settings.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+14 more)
  - `--spike-panel-bg` → `css/spike-three-theme-authority.css`
  - `--spike-radius` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-index-authority-v3.css`, `css/spike-post-actions-v2.css`, `js/audit/tests/theme-distinctiveness.test.mjs`
  - `--spike-shadow` → `profile.html`, `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-theme-experience-v3.css`, `css/spike-post-actions-v4.css` (+3 more)
  - `--spike-surface` → `help.html`, `settings.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+14 more)
  - `--spike-surface-2` → `help.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+15 more)
  - `--spike-surface-3` → `notifications.html`, `policy_appeals.html`, `profile.html`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-three-theme-authority.css`, `css/spike-post-actions-v2.css`
  - `--spike-text` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+17 more)
  - `--surface` → `help.html`, `settings.html`, `guide.html`, `notifications.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html` (+12 more)
  - `--surface2` → `help.html`, `settings.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-feed-command-menu-v4.css` (+6 more)
  - `--surface3` → `help.html`, `profile.html`, `view_user.html`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/spike-three-theme-authority.css`, `css/feed-features.css`
  - `--text` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+25 more)

### `css/spike-theme-experience-v3.css`
- Unique custom properties defined: 5
- Properties with at least one textual reference in another source file: 5 of 5
  - `--theme-accent-line` → `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-index-authority-v3.css`
  - `--theme-accent-soft` → `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-index-authority-v3.css`
  - `--theme-shadow-soft` → `css/spike-theme-runtime-v3.css`
  - `--theme-surface-soft` → `css/spike-theme-runtime-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-index-authority-v3.css`
  - `--theme-surface-strong` → `css/spike-theme-runtime-v3.css`

### `css/spike-theme-final-authority-v1.css`
- Unique custom properties defined: 35
- Properties with at least one textual reference in another source file: 35 of 35
  - `--solid` → `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/spike-identity.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--sp-accent` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-accent-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-bg` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-border` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-border-strong` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-danger` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-muted` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-radius` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-radius-sm` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-shadow` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-success` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-surface` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-surface-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--sp-surface-3` → `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`
  - `--sp-text` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--spk-bg` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-bg-2` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-blue` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-border` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-border-strong` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-cyan` → `feed.html`, `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-danger` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-dim` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-muted` → `feed.html`, `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-pink` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-purple` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-radius` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-radius-sm` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-shadow` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-success` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`
  - `--spk-surface` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-surface-2` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-text` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-warning` → `css/spike-theme-runtime-v3.css`, `css/spike-beauty-v1.css`

### `css/spike-theme-runtime-v3.css`
- Unique custom properties defined: 129
- Properties with at least one textual reference in another source file: 109 of 129
  - `--a` → `message.html`, `messages.html`, `css/spike-feature-suite.css`, `css/theme.css`
  - `--a2` → `css/spike-feature-suite.css`, `css/theme.css`
  - `--accent` → `rooms.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `room.html`, `css/premium-back.css`, `css/theme.css` (+4 more)
  - `--accent2` → `rooms.html`, `settings.html`, `css/theme.css`, `css/spike-three-theme-authority.css`
  - `--bg` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `room_chat.html`, `admin.html`, `room.html`, `reset-password.html` (+11 more)
  - `--border` → `notifications.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--chat-avatar-bg` → `room_chat.html`
  - `--chat-hover` → `room_chat.html`
  - `--chat-incoming` → `room_chat.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--chat-incoming-text` → `room_chat.html`
  - `--chat-outgoing` → `room_chat.html`
  - `--chat-outgoing-text` → `room_chat.html`
  - `--chat-status-border` → `room_chat.html`
  - `--danger` → `help.html`, `settings.html`, `notifications.html`, `admin.html`, `room.html`, `view_user.html`, `css/feed-core.css`, `css/index.css` (+1 more)
  - `--edu-surface` → `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--g-accent` → `guide.html`
  - `--g-accent2` → `guide.html`
  - `--g-bg` → `guide.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--g-card` → `guide.html`
  - `--g-card2` → `guide.html`, `css/spike-experience-v2.css`
  - `--g-good` → `guide.html`
  - `--g-line` → `guide.html`, `css/spike-experience-v2.css`
  - `--g-muted` → `guide.html`, `css/spike-experience-v2.css`
  - `--g-text` → `guide.html`
  - `--g-warn` → `guide.html`
  - `--good` → `help.html`, `room_chat.html`, `room.html`, `reset-password.html`, `css/spike-feature-suite.css`, `css/feed-core.css`, `css/room-chat-core.css`
  - `--line` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `guide.html`, `room_chat.html`, `admin.html`, `room.html` (+20 more)
  - `--live-accent` → `css/spike-live.css`
  - `--live-bg` → `css/spike-live.css`
  - `--live-cyan` → `css/spike-live.css`
  - `--live-green` → `css/spike-live.css`
  - `--live-line` → `js/spike-live.js`, `css/spike-live.css`
  - `--live-muted` → `live.html`, `js/spike-live.js`, `css/spike-live.css`
  - `--live-panel` → `css/spike-live.css`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--live-panel-2` → `css/spike-live.css`
  - `--live-red` → `css/spike-live.css`
  - `--live-shadow` → `css/spike-live.css`
  - `--live-text` → `css/spike-live.css`
  - `--muted` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+24 more)
  - `--orange` → `admin.html`
  - `--page-bg` → `notifications.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--panel` → `rooms.html`, `message.html`, `admin.html`, `room.html`, `messages.html`, `css/spike-safety-center.css`, `css/room-chat-core.css`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--panel2` → `message.html`, `room_chat.html`, `admin.html`, `room.html`, `messages.html`, `css/room-chat-core.css`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--pb-accent` → `css/premium-back.css`
  - `--pb-line` → `css/premium-back.css`
  - `--pb-surface` → `css/premium-back.css`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--pb-text` → `css/premium-back.css`
  - `--pink` → `admin.html`, `reset-password.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--primary` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/feed-core.css`, `css/theme.css`, `css/spike-three-theme-authority.css`
  - `--primary2` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/feed-core.css`, `css/theme.css`, `css/spike-three-theme-authority.css`
  - `--purple` → `reset-password.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--shadow` → `help.html`, `settings.html`, `room.html`, `profile.html`, `view_user.html`, `css/feed-core.css`, `css/theme.css`, `css/index.css` (+1 more)
  - `--soft` → `rooms.html`
  - `--solid` → `css/spike-feature-suite.css`, `css/spike-identity.css`, `css/spike-theme-final-authority-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--sp-accent` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-accent-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-accent-3` → `help.html`, `admin.html`, `friends.html`, `css/theme.css`
  - `--sp-bg` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-border` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-border-strong` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-danger` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-good` → `help.html`, `admin.html`, `friends.html`, `css/theme.css`
  - `--sp-line` → `help.html`, `admin.html`, `friends.html`, `css/theme.css`
  - `--sp-muted` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-radius` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-radius-sm` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-shadow` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-shadow-soft` → `help.html`, `admin.html`, `friends.html`, `css/theme.css`
  - `--sp-success` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface-2` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface-3` → `css/spike-unified-v2.css`, `css/spike-theme-final-authority-v1.css`
  - `--sp-surface-solid` → `help.html`, `admin.html`, `friends.html`, `css/theme.css`
  - `--sp-text` → `help.html`, `admin.html`, `friends.html`, `css/spike-unified-v2.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`
  - `--spk-bg` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-bg-2` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-blue` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-border` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-border-strong` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-cyan` → `feed.html`, `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-danger` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-dim` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-muted` → `feed.html`, `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-pink` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-purple` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-radius` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-radius-sm` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-shadow` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-success` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spk-surface` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-surface-2` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-text` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`, `js/audit/tests/theme-final-authority-v1.test.mjs`
  - `--spk-warning` → `css/spike-theme-final-authority-v1.css`, `css/spike-beauty-v1.css`
  - `--spn-life` → `rooms.html`, `help.html`, `admin.html`, `friends.html`, `profile.html`, `css/feed-features.css`
  - `--spn-line` → `rooms.html`, `help.html`, `admin.html`, `friends.html`, `profile.html`
  - `--spn-muted` → `rooms.html`, `help.html`, `admin.html`, `friends.html`, `profile.html`
  - `--spn-text` → `rooms.html`, `help.html`, `admin.html`, `friends.html`, `profile.html`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--spx-surface` → `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--success` → `css/index.css`, `js/audit/tests/theme-runtime-v2.test.mjs`
  - `--surface` → `help.html`, `settings.html`, `guide.html`, `notifications.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html` (+12 more)
  - `--surface2` → `help.html`, `settings.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-feed-command-menu-v4.css` (+6 more)
  - `--surface3` → `help.html`, `profile.html`, `view_user.html`, `css/feed-core.css`, `css/theme.css`, `css/spike-three-theme-authority.css`, `css/feed-features.css`
  - `--text` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+25 more)
  - `--theme-accent-line` → `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`
  - `--theme-accent-soft` → `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`
  - `--theme-shadow-soft` → `css/spike-theme-experience-v3.css`
  - `--theme-surface-soft` → `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`
  - `--theme-surface-strong` → `css/spike-theme-experience-v3.css`
  - `--warning` → `css/index.css`

### `css/spike-three-theme-authority.css`
- Unique custom properties defined: 36
- Properties with at least one textual reference in another source file: 33 of 36
  - `--accent` → `rooms.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `room.html`, `css/spike-theme-runtime-v3.css`, `css/premium-back.css` (+4 more)
  - `--accent2` → `rooms.html`, `settings.html`, `css/spike-theme-runtime-v3.css`, `css/theme.css`
  - `--bg` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `room_chat.html`, `admin.html`, `room.html`, `reset-password.html` (+11 more)
  - `--card-bg` → `css/theme.css`
  - `--card-border` → `css/theme.css`
  - `--line` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `guide.html`, `room_chat.html`, `admin.html`, `room.html` (+20 more)
  - `--muted` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+24 more)
  - `--primary` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/theme.css`
  - `--primary2` → `help.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/theme.css`
  - `--spike-accent` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+19 more)
  - `--spike-accent-2` → `help.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css` (+11 more)
  - `--spike-action-bg` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`, `js/audit/tests/spike-signal-studio.test.mjs` (+1 more)
  - `--spike-action-bg-2` → `js/spike-native-v2.js`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`, `js/audit/tests/spike-signal-studio.test.mjs`
  - `--spike-action-text` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`
  - `--spike-bg` → `rooms.html`, `help.html`, `settings.html`, `notifications.html`, `admin.html`, `feed.html`, `profile.html`, `js/spike-dialog.js` (+12 more)
  - `--spike-body-image` → `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-index-authority-v3.css`, `css/spike-signal-studio.css`
  - `--spike-card-bg` → `admin.html`, `css/policy.css`, `css/theme.css`
  - `--spike-card-border` → `admin.html`, `css/policy.css`, `css/theme.css`
  - `--spike-control-radius` → `policy_appeals.html`, `js/spike-native-v2.js`, `css/spike-feature-suite.css`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-post-actions-v4.css` (+3 more)
  - `--spike-danger` → `css/spike-feature-suite.css`
  - `--spike-line` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+16 more)
  - `--spike-muted` → `help.html`, `settings.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+14 more)
  - `--spike-panel-bg` → `css/theme.css`
  - `--spike-radius` → `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-index-authority-v3.css`, `css/spike-post-actions-v2.css`, `js/audit/tests/theme-distinctiveness.test.mjs`
  - `--spike-shadow` → `profile.html`, `js/spike-native-v2.js`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-experience-v3.css`, `css/spike-post-actions-v4.css` (+3 more)
  - `--spike-surface` → `help.html`, `settings.html`, `notifications.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+14 more)
  - `--spike-surface-2` → `help.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js`, `js/spike-native-v2.js` (+15 more)
  - `--spike-surface-3` → `notifications.html`, `policy_appeals.html`, `profile.html`, `css/spike-theme-runtime-v3.css`, `css/policy.css`, `css/theme.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-post-actions-v2.css`
  - `--spike-text` → `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `policy_appeals.html`, `profile.html`, `js/spike-dialog.js` (+17 more)
  - `--surface` → `help.html`, `settings.html`, `guide.html`, `notifications.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html` (+12 more)
  - `--surface2` → `help.html`, `settings.html`, `feed.html`, `reset-password.html`, `profile.html`, `view_user.html`, `css/spike-feature-suite.css`, `css/spike-feed-command-menu-v4.css` (+6 more)
  - `--surface3` → `help.html`, `profile.html`, `view_user.html`, `css/spike-theme-runtime-v3.css`, `css/feed-core.css`, `css/theme.css`, `css/feed-features.css`
  - `--text` → `rooms.html`, `message.html`, `help.html`, `settings.html`, `notifications.html`, `room_chat.html`, `admin.html`, `room.html` (+25 more)

## Shared theme stylesheet order per page

Order matters because multiple layers use `!important` and overlapping selectors. The table below preserves stylesheet order as written in each HTML file.

- `admin.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `feed.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `friends.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `guide.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `help.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `index.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `legal.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `live.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `message.html`: `css/theme.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-three-theme-authority.css`
- `messages.html`: `css/theme.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-three-theme-authority.css`
- `notifications.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `policy.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `policy_appeals.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `profile.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `reset-password.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `room.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `room_chat.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `rooms.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `settings.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `share.html`: `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-experience-v3.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`
- `view_user.html`: `css/spike-theme-experience-v3.css` → `css/theme.css` → `css/spike-theme-final-authority-v1.css` → `css/spike-theme-runtime-v3.css` → `css/spike-three-theme-authority.css`

## SQL/database finding

The migration directory scan finds `theme_style` only in `supabase/migrations/202610120001_reset_legacy_theme_preferences.sql` among SQL files. This migration sets non-1 values to 1, but static source inspection cannot establish whether the migration has been applied or what values exist in a live database. Do not run it as part of a source-only audit.

## Consolidation decision

- **Do not delete any of the five shared CSS layers yet.** The token trace shows cross-file references and overlapping component rules; a safe consolidation needs browser-level before/after computed styles across representative pages and all three slots.
- **Do not automatically add `spike-theme-runtime-v3.css` to `message.html` or `messages.html`.** First compare their page-local styles and actual selectors/tokens they use.
- Next safe step is a controlled CSS consolidation branch: move one rule family at a time, run unit/integrity tests, then visual regression across feed, profile, settings, rooms, and messaging. Palette design remains a separate decision.

## CSS consolidation triage (selector/property overlap scan)

A second static scan compared the five shared theme-layer files. This is intentionally a triage report, not an automatic CSS rewrite.

### Exact selector overlaps

- `html[data-spike-style]` is declared in `theme.css`, `spike-theme-experience-v3.css`, `spike-theme-final-authority-v1.css`, and `spike-theme-runtime-v3.css`.
- `.header .brand-title` and `.header .brand-subtitle` are declared in both `spike-theme-experience-v3.css` and `spike-theme-final-authority-v1.css`.
- These overlaps do not by themselves mean the declarations are duplicates: the blocks contain different declarations and may rely on source order and `!important` precedence.

### Compatibility alias duplication

The same legacy-facing names are re-declared across files, including `--bg`, `--surface`, `--text`, `--accent`, `--sp-bg`, `--sp-surface`, and `--sp-text`. The canonical `--spike-*` values are set by `theme.css` defaults and the three-theme authority, while the runtime/final-authority layers provide compatibility aliases and overrides. A safe consolidation should therefore keep the consumer aliases until all consumers have been migrated and tested.

### Safe consolidation boundary

1. Keep `css/spike-three-theme-authority.css` as the only place for the three theme-specific palette values.
2. Keep `css/theme.css` for baseline/default tokens and shared component styling, but plan to remove palette-like default literals from it only after confirming default-theme behavior before the `data-spike-style` attribute is applied.
3. Treat `css/spike-theme-runtime-v3.css` and `css/spike-theme-final-authority-v1.css` as compatibility/consumer layers for now; they still contain namespaces and overrides used by page-local CSS.
4. The duplicated header rules are a candidate for a later narrow merge, but only after browser computed-style comparisons on the landing, feed, settings, and messaging pages.
5. Do not auto-delete repeated custom properties solely because a textual scan sees more than one definition.

### Database migration source check

The scanned migration `supabase/migrations/202610120001_reset_legacy_theme_preferences.sql` updates existing `public.user_app_settings.theme_style` values that are distinct from `1`; it does not add a `CHECK` constraint. Static repository inspection cannot confirm the live table schema or whether this migration has been applied. Do not infer live state from the presence of the SQL file.

## Header cascade review (targeted follow-up)

Reviewed the exact header/brand declarations in `css/spike-theme-experience-v3.css` and `css/spike-theme-final-authority-v1.css` before attempting consolidation.

- The experience layer sets `.header .brand-title` to `--spike-text`, removes text shadow, and sets `.header .brand-subtitle` to `--spike-muted`.
- The final-authority layer also resets `.header .brand-title` background to `none`, restores `-webkit-text-fill-color: initial`, sets the title to `--spike-text`, and removes text shadow. This is not merely a duplicate: it cancels the broader gradient text styling for `.brand-title` inherited from an earlier selector in the same final-authority file.
- Both files use `!important` for key declarations, so source order alone does not explain all precedence; importance and selector specificity matter too.
- The experience layer has an additional later rule setting both title and subtitle colors to `--spike-text`; the final-authority layer then gives the subtitle its muted color. The final visible intent is therefore title = primary text, subtitle = muted text, no title gradient.

**Decision:** no CSS was deleted or merged in this pass. Moving or removing these blocks without rewriting the broader brand-title selector would risk reintroducing gradient text or changing subtitle contrast. A browser screenshot/computed-style test is still required for a behavior-preserving refactor.

### Test run for this follow-up

`npm test` completed with 472 tests total: 471 passed, 0 failed, 1 optional browser/a11y test skipped because the pinned browser dependencies are not installed. This validates the existing static contracts; it does not substitute for visual regression testing.


## Inbox regression discovered and corrected (2026-10-12)

A direct comparison found that the current `messages.html` had regressed from the known-good `Spike-new-dm-typing-unread-badges-v2.zip` version: the inbox typing preview lifecycle (`setupInboxTyping`, private-channel subscriptions, timeout cleanup) and numeric unread-count badges (`rowUnreadBadge` / `unreadCount`) were absent. This was a real source regression, not merely a theme styling concern.

Restored the known-good inbox implementation and reapplied the three-theme bootstrap (`spike-theme-choice-v3`, IDs 1–3) plus `css/spike-three-theme-authority.css`. This keeps inbox behavior and current theme wiring together. Static verification confirms the typing setup, stale-timer cleanup, and unread count badge markers are present. Browser/live two-account verification is still required; this package has not been deployed.

## Pass 10 update — shared theme-layer coverage rechecked (2026-10-13)

The earlier table above is historical and no longer describes the current Pass 9 working tree: the two messaging pages now also include `css/spike-theme-runtime-v3.css`. A fresh static scan of all production HTML pages found all 21 pages load the five shared theme CSS layers and the central `js/theme.js` registry. The earlier caution remains valid as a general rule: do not add/remove theme layers without tracing consumers, but these two imports are now present and covered by a regression test.

A new automated contract test checks all five stylesheet references plus `js/theme.js` on every top-level HTML page, and specifically protects the runtime compatibility layer on `message.html` and `messages.html`. This is a source-coverage test, not a claim that all computed styles have been visually validated in a browser.
