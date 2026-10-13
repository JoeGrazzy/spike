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

test('Profile editor keeps one real select per audience setting and suppresses only redundant summary decorations', async () => {
  const profile = await readFile('profile.html', 'utf8');
  for (const id of ['editVisibility','editPostsVisibility','editMediaVisibility','editFriendsVisibility','editMessages','editCalls']) {
    assert.equal((profile.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should remain a single functional control`);
  }
  assert.match(profile, /\.privacy-row \.privacy-audience[^{]*\{display:none!important\}/);
  assert.match(profile, /\.privacy-row \.audience-summary[^{]*\{display:none!important\}/);
});
