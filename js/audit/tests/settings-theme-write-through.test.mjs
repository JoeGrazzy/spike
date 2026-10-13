import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settings = await readFile('settings.html', 'utf8');

test('Theme selection writes through to account settings and reports sync failures', () => {
  const handler = settings.slice(settings.indexOf("$('theme').onchange="), settings.indexOf("document.addEventListener('spike:theme-change'"));
  assert.match(handler, /localStorage\.setItem\('spike-theme-choice-v3',String\(n\)\)/);
  assert.match(handler, /from\('user_app_settings'\)\.upsert\(\{user_id:session\.user\.id,theme_style:n/);
  assert.match(handler, /if\(result\.error\)throw result\.error/);
  assert.match(handler, /account sync failed/);
  assert.match(handler, /version===themeWriteVersion/);
});

test('Settings owns privacy selectors and profile editor links to Settings for privacy changes', async () => {
  const profile = await readFile('profile.html', 'utf8');
  for (const id of ['profile','posts','media','friends','messages','calls']) {
    assert.match(settings, new RegExp(`id=["']${id}["']`), `${id} should be available in Settings`);
  }
  assert.match(profile, /settings\.html#privacy/);
  assert.doesNotMatch(profile, /id="editVisibility"/);
});
