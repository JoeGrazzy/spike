import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../../feed.html', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../../feed-runtime-04-3.js', import.meta.url), 'utf8');

 test('Feed header exposes the reference-led menu and search entry points', () => {
  assert.match(html, /id="feedHeaderSearch"/);
  assert.match(html, /aria-label="Search SPIKE"/);
  assert.match(html, /id="menuBtn"/);
  assert.match(html, /aria-controls="menuOverlay"/);
  assert.match(html, /id="menuOverlay"/);
  assert.doesNotMatch(html, /id="spikeSmartNavBtn"/);
});

test('Feed menu keeps primary actions in the existing runtime contracts', () => {
  for (const [id, action] of [['menuAskSpike','ask-spike'],['menuTheme','theme'],['menuPulse','pulse'],['menuSaved','saved'],['menuSafety','safety']]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*data-menu-action="${action}"`));
    assert.ok(runtime.includes(`'${action}':`) || runtime.includes(`${action}:`), `missing menu action ${action}`);
  }
  assert.match(runtime, /const openAskSpike = \(/);
  assert.match(runtime, /feedHeaderSearch.*openAskSpike|openAskSpike.*feedHeaderSearch/);
  assert.match(runtime, /const syncFeedMenuIdentity =?function|function syncFeedMenuIdentity/);
  assert.doesNotMatch(runtime, /activateExistingUtility/);
});
