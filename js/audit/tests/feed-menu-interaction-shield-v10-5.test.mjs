import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const runtime = readFileSync(new URL('../../feed-runtime-04-3.js', import.meta.url), 'utf8');
test('V10.5 shields underlying feed interactions while menu is open', () => {
  assert.match(runtime, /const feedMenuInteractionShield = event =>/);
  assert.match(runtime, /overlay\.contains\(target\) \|\| target\.closest\('body > header\.header'\)/);
  assert.match(runtime, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(runtime, /\['pointerdown', 'mousedown', 'touchstart', 'click'\]\.forEach/);
  assert.match(runtime, /document\.addEventListener\(type, feedMenuInteractionShield, \{ capture: true, passive: false \}\)/);
  assert.match(runtime, /const openFeedMenu = \(\) => \{ openOverlay\('menuOverlay'\); setFeedMenuNavHidden\(true\); \}/);
  assert.match(runtime, /const closeFeedMenu = \(\) => \{ closeOverlay\('menuOverlay'\); setFeedMenuNavHidden\(false\)/);
});
