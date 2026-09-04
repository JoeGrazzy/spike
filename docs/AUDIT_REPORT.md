# SPIKE Multi-page HTML + Supabase Audit

Date: 2026-09-03

## Scope

Audited the supplied ZIP, all root HTML pages, JavaScript/CSS assets, CI workflows and the connected Supabase project.

Frontend: Vanilla HTML/CSS/JavaScript. Backend: Supabase PostgreSQL/Auth/Realtime/Storage/Edge Functions. Media uploads also use Cloudinary.

## Pages found

1. admin.html
2. feed.html
3. friends.html
4. help.html
5. index.html
6. message.html
7. messages.html
8. notifications.html
9. profile.html
10. reset-password.html
11. room.html
12. room_chat.html
13. rooms.html
14. settings.html
15. spike_predictor.html

Additional non-root HTML: js/room_chat_final.html.

A compatibility shim `chat_room.html` was added because the existing CI/a11y/static-audit contract explicitly requires it, while the supplied project only contained `room_chat.html`.

## Deterministic fixes applied in this patch

- Removed three nonexistent JavaScript includes from `friends.html` (`js/spike-core.js`, `js/security-hardening.js`, `js/media-guard.js`).
- Added `chat_room.html` as a thin compatibility redirect instead of duplicating the 200KB room-chat implementation.
- Normalized Supabase CDN usage from floating `@2` to the pinned `@2.112.4` in room-chat files.
- Added missing descriptions to `room_chat.html` and `reset-password.html`.
- Added `package.json`, ESLint flat config, Prettier config, JS syntax-check script and a basic UI contract test so CI has an actual Node toolchain.
- Added `js/audit/tests/ui-contract.test.mjs`.

## Verification performed

PASS:
- `node js/audit/static-audit.mjs`
- `node js/audit/typecheck.mjs`
- `node js/audit/build.mjs`
- `node js/audit/cloudflare-verify.mjs`
- back-button tests
- security baseline tests
- telemetry contract tests
- UI contract tests

FAIL / not yet production-ready:
- Performance budget: `feed.html` is 394,900 bytes vs 350,000 budget.
- Performance budget: `room_chat.html` is 214,213 bytes vs 180,000 budget.
- Browser console/Lighthouse could not be completed in this execution environment because Chromium navigation to local files/localhost was blocked by the execution policy.
- Full ESLint/Prettier run requires installing the new dev dependencies; the ZIP did not contain `package.json`/lockfile.

## Highest-priority issues

### 1. CI expects a page that was missing
File: `js/audit/static-audit.mjs:5-6`, `js/audit/tests/a11y.spec.mjs:4`, `js/audit/tests/back-button.test.mjs:6`, `js/audit/build.mjs:4`
Severity: High

The acceptance suite required `chat_room.html`, but the supplied project had only `room_chat.html` plus `js/room_chat_final.html`. This caused the static audit to fail immediately.

Fix: added a thin compatibility page; do not copy the large chat implementation.

### 2. Missing scripts on friends page
File: `friends.html:1320-1322`
Severity: High

Three referenced files did not exist, guaranteeing 404s and possible initialization failures.

Fix: removed the dead includes. The page already contains its own application logic and still passes the back/security/UI contracts.

### 3. Massive HTML monoliths violate performance budgets
Files: `feed.html` (394,900 bytes), `room_chat.html` (214,213 bytes)
Severity: High

Both exceed the repository's own budgets. This increases parse/compile cost, blocks maintainability and makes every small change expensive.

Fix: long-term extraction is required: move page-local CSS/JS into route-specific assets, then load shared modules once. Do not simply raise the budgets.

### 4. No package.json or lockfile
File: project root
Severity: Critical

CI invokes npm install, npm run build, npm run lint, test scripts and npx wrangler, but the project supplied no package.json. Reproducible CI therefore cannot start.

Fix: added a baseline package.json and tool configs in this patch. Commit a generated lockfile in the real repository after `npm install` succeeds.

### 5. Cloudflare deployment has no checked-in Wrangler configuration
Files: `.github/workflows/deploy-cloudflare.yml:20-21`, `.github/workflows/quality-gates.yml:58-59`
Severity: High

The workflow calls `wrangler deploy`, but no `wrangler.toml`/`wrangler.jsonc` was supplied. Deployment target, assets directory and worker/static-assets configuration are therefore not reproducible from the repository.

Fix: add a checked-in Wrangler configuration after confirming whether the intended target is Workers Static Assets or Cloudflare Pages. Do not invent the production account/domain in source.

### 6. Supabase configuration is duplicated across pages
Files: `index.html`, `feed.html`, `admin.html`, `messages.html`, `message.html`, `notifications.html`, `profile.html`, `room.html`, `room_chat.html`, `rooms.html`, `settings.html`, etc.
Severity: Medium

There are 18 `createClient()` occurrences across the supplied HTML/JS, with room chat containing multiple client bootstrap paths. Although a singleton bridge exists in room chat, the architecture is still duplicated and prone to configuration drift.

Fix:
```js
// js/supabase-client.js
const SUPABASE_URL = window.SPIKE_CONFIG.supabaseUrl;
const SUPABASE_KEY = window.SPIKE_CONFIG.supabasePublishableKey;

export const supabaseClient = window.__SPIKE_SUPABASE__ ??= window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' } }
);
```

For a static app, the publishable key may be shipped to browsers; it is not a service-role secret. The important control is RLS. Inject non-secret configuration at build/deploy time rather than repeating literals in every page.

### 7. Edge Functions use wildcard CORS
Files: deployed `create-private-call`, `admin-register-user`, `spike-predictor-sync`
Severity: High

All three currently return `Access-Control-Allow-Origin: *`. The functions are JWT-protected, so this is not automatically an account takeover, but it unnecessarily permits every origin to invoke the endpoints from browser contexts.

Fix:
```ts
const allowedOrigins = new Set([
  'https://YOUR_PRODUCTION_ORIGIN',
  'https://YOUR_PREVIEW_ORIGIN'
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
```

Alternative: keep wildcard only for endpoints that are deliberately public and contain no credentials or privileged operations.

### 8. create-private-call leaks backend error details and does an oversized friendship fetch
Deployed function: `create-private-call` version 3
Severity: High

The function returns `detail: friendError.message`, `detail: blockError.message` and `detail: callError.message` to clients. It also calls `get_friends_public` with `p_limit: 500` merely to test whether one callee is a friend.

Fix: move the authorization check into a narrow RPC such as `can_call_spike_user` and return generic client errors. Also validate UUIDs before constructing PostgREST filters.

```ts
if (!isUuid(calleeId)) return reply({ ok: false, error: 'Invalid call request' }, 400);
const { data: allowed, error } = await userClient.rpc('can_call_spike_user', {
  p_caller: user.id,
  p_callee: calleeId
});
if (error || allowed !== true) return reply({ ok: false, error: 'Calls are unavailable' }, 403);
```

### 9. Cloudinary uploads rely on client-visible unsigned upload configuration
Files: `profile.html:468-489`, `feed.html:1150-1319`
Severity: Medium/High

The cloud name and unsigned upload preset are necessarily visible to the browser. The security boundary must therefore be the Cloudinary preset and server-side media policy, not secrecy of these values. The project also allows a broad set of uploads and client-side transformations.

Fix: restrict the unsigned preset to the required resource types, maximum size, allowed formats/transforms and destination rules. Prefer signed uploads through a server/Edge Function for higher assurance.

### 10. Storage bucket `room-media` is public and has no global size/MIME limits
Supabase storage configuration
Severity: High

Current buckets: `dm-media` private, `room-media` public. Both report no file-size limit and no allowed MIME-type list.

Fix: keep private user/media data private unless public delivery is intentional. Add bucket-level size/MIME restrictions where supported and enforce object-path ownership in storage policies.

### 11. Database is extensive but not reproducible from the supplied repository
Supabase project
Severity: High

Live project currently reports 95 public tables, 179 public functions, 159 RLS policies and 254 indexes. The connected project has a long migration history, but the supplied ZIP contains no migration directory.

Fix: establish migrations as the source of truth and commit the current schema/migrations. Future CI should apply migrations to an ephemeral project before integration tests.

### 12. RLS coverage is broad and generally strong, but permissive policies require explicit review
Supabase project
Severity: Medium

All 95 public tables currently have RLS enabled and all have at least one policy. This is a strong baseline. However, some reads are deliberately `USING (true)`, including `app_maintenance`, `comments`, `room_message_styles`, `spike_feature_flags`, `spike_fixtures` and `spike_predictions`.

Fix: review each table against a data-classification matrix. In particular, ensure `spike_feature_flags.config` contains no internal secrets and that public prediction/fixture data is truly intended to be public.

### 13. Authenticated/admin authorization is mostly correctly enforced in sensitive SECURITY DEFINER functions
Supabase project
Severity: Informational/Positive

Admin functions inspected (`admin_guard`, `admin_create_room`, `admin_ban_user`, `admin_delete_user`, `admin_find_user`, `admin_user_profile`) check the caller role. Sensitive functions such as payout operations also check super-admin state. This should be preserved.

### 14. Realtime listener cleanup is inconsistent
Files: especially `feed.html`, `messages.html`, `message.html`, `profile.html`, `room_chat.html`
Severity: Medium

Static counts show roughly 433 `addEventListener` calls but only 10 explicit `removeEventListener` calls. Some listeners are intentionally page-lifetime, but dynamic render functions also attach listeners repeatedly. For example, `messages.html` attaches contextmenu/dblclick listeners to every rendered bubble after replacing `innerHTML`.

Fix: use event delegation on stable containers:
```js
messagesBox.addEventListener('click', onMessageClick);
messagesBox.addEventListener('contextmenu', onMessageContextMenu);
```

For subscriptions:
```js
let channel;
function subscribe() {
  channel = supabaseClient.channel('messages').on(...).subscribe();
}
function dispose() {
  if (channel) supabaseClient.removeChannel(channel);
}
window.addEventListener('pagehide', dispose, { once: true });
```

### 15. 284 innerHTML assignments create unnecessary XSS review surface
Across HTML/JS
Severity: Medium

Many assignments are safe because values pass through `esc()` or `safeHttpUrl()`, but this pattern is difficult to audit and easy to regress.

Fix: use `textContent`, DOM APIs and event delegation for simple UI; reserve `innerHTML` for templates whose interpolation is centrally escaped.

### 16. Inline CSS/JS is heavily duplicated
Files: most HTML pages; `admin.html` has 31 inline style attributes, `feed.html` 12, etc.
Severity: Medium

The application has route-sized documents with substantial inline styles and scripts. This prevents effective caching and makes code ownership unclear.

Fix: create:
- `css/app.css`
- `css/pages/<page>.css`
- `js/core/config.js`
- `js/core/supabase.js`
- `js/core/auth.js`
- `js/core/dom.js`
- route modules under `js/pages/`

### 17. Accessibility: many form controls lack explicit labels
Static scan found unlabeled controls including 16 in admin, 22 in feed, 21 in profile, 26 in rooms and 12 in settings.
Severity: High

Fix:
```html
<label for="usersSearch">Search users</label>
<input id="usersSearch" name="usersSearch" type="search">
```

For intentionally icon-only controls, use an accessible name:
```html
<button type="button" aria-label="Search friends">...</button>
```

### 18. SEO metadata is incomplete
All pages have titles; most have descriptions. `reset-password.html` and `room_chat.html` lacked descriptions before this patch. No supplied page has Open Graph tags or canonical links. No sitemap/robots file was supplied.
Severity: Medium

Fix: add route metadata and canonical URLs after the production origin is confirmed. Do not invent a canonical domain.

```html
<meta name="description" content="...">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:type" content="website">
<link rel="canonical" href="https://YOUR_DOMAIN/...">
```

### 19. Telemetry endpoint is not implemented in the supplied app
File: `js/telemetry.js:15`
Severity: Medium

Default endpoint is `/__telemetry`, but no server implementation is present in the ZIP. The telemetry code is correctly redacting common credentials, but a missing endpoint means monitoring can silently fail.

Fix: wire this to a real ingestion endpoint/Edge Function and add delivery/error-rate monitoring. Never send access/refresh tokens or raw form fields.

### 20. Predictor Edge Function has a scalability problem and model-quality concern
Deployed `spike-predictor-sync` version 5
Severity: High for performance; Product-critical if predictions are represented as model-derived

It fetches competitions in batches, then performs an individual database upsert for every fixture and prediction set. This is N+1 database work. Its prediction function is deterministic from string lengths/IDs rather than a statistical model, so the product must not represent these numbers as empirically calibrated probabilities.

Fix: bulk upsert fixtures and predictions, and either connect a real calibrated model or clearly label the output as a heuristic ranking.

### 21. No browser/Lighthouse gate is actually runnable from the supplied repository
Files: `.github/workflows/quality-gates.yml`, missing package/config
Severity: High

The workflow references UI/a11y scripts, but the project lacked the package setup required to run them. Browser execution was also blocked in this audit environment.

Fix: check in package-lock, Playwright config, a local static web server command and a Lighthouse CI config. Run Lighthouse against the deployed preview URL in CI.

### 22. No backup/restore procedure is represented in source
Severity: High operational risk

The supplied repository contains no backup policy, restore test or migration replay procedure. The live database has a large migration history, increasing the cost of drift.

Fix: document PITR/backup retention, export strategy where appropriate, and perform scheduled restore drills against a non-production project.

## Optimization checklist

- [ ] Reduce `feed.html` below 350 KB.
- [ ] Reduce `room_chat.html` below 180 KB.
- [ ] Extract inline CSS and route JavaScript.
- [ ] Replace per-node event listeners with delegation.
- [ ] Add route-level loading/error/empty states consistently.
- [ ] Batch predictor writes.
- [ ] Add query limits and explicit column selection everywhere.
- [ ] Verify all media URLs through a single safe URL helper.
- [ ] Add `Cache-Control`/immutable caching for versioned static assets.
- [ ] Add CDN/image transformations and responsive `srcset` where appropriate.
- [ ] Add production error monitoring.
- [ ] Add CSP/security headers at the hosting layer.
- [ ] Add HSTS after confirming HTTPS-only production.
- [ ] Add backup/restore runbook.

## Refactoring target

Recommended architecture:

```text
js/
  core/
    config.js
    supabase.js
    auth.js
    dom.js
    errors.js
    telemetry.js
  pages/
    feed.js
    friends.js
    messages.js
    message.js
    profile.js
    rooms.js
    room.js
    room-chat.js
    admin.js
  components/
    toast.js
    modal.js
    avatar.js
    loading.js
    pagination.js
css/
  app.css
  components.css
  pages/
    feed.css
    room-chat.css
    admin.css
```

Keep each HTML document as markup + a small route bootstrap only.

## Test coverage additions

1. Auth: expired session, refresh, logout, PKCE callback.
2. Authorization: every RLS-sensitive operation with owner, non-owner, anonymous and admin identities.
3. Messaging: send/edit/delete/reaction/pin/block/unfriend/read receipt.
4. Realtime: reconnect, duplicate events, pagehide cleanup.
5. Uploads: invalid MIME, oversize, malformed filename, failed upload, timeout.
6. XSS: post/message/profile fields containing HTML/script payloads.
7. Rate limits: burst requests and concurrent requests.
8. Payments/economy: idempotency, duplicate submit, insufficient balance, payout authorization.
9. Accessibility: axe WCAG 2.1 AA plus keyboard-only navigation.
10. Performance: Lighthouse mobile, slow 4G, cold cache and warm cache.
11. Deployment: migration replay from empty database and rollback/restore drill.

## Master Change Guard note

The supplied ZIP did not contain an approved master/baseline document or an explicit change request. Therefore a true master-change authorization comparison cannot be completed. This patch intentionally limits itself to deterministic audit repairs and does not claim approval against a missing baseline.

## Skarn note

No installed/available Skarn capability was exposed in this workspace, so a Skarn-specific audit could not be executed. The static/code/database audit above was performed directly against the supplied project and connected Supabase project.
