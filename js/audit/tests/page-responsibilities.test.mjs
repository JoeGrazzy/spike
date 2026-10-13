import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settings = await readFile('settings.html', 'utf8');
const profile = await readFile('profile.html', 'utf8');
const tools = await readFile('spike-tools.html', 'utf8');

test('Settings links to the existing profile editor instead of duplicating profile fields', () => {
  assert.match(settings, /href="profile\.html\?edit=1"/);
  assert.match(settings, /Privacy controls remain in this Settings page/);
});

test('Profile editor opens from the Settings shortcut only after the current user profile loads', () => {
  assert.match(profile, /get\("edit"\)==="1"&&state\.uid===state\.me\.id/);
  assert.match(profile, /history\.replaceState\(history\.state,"",location\.pathname\);fillEdit\(\)/);
  assert.match(profile, /if\(state\.privacyLoadError\).*profile changes are paused to protect them/s);
});

test('Security utilities remain separate from account preferences and link back to Settings', () => {
  assert.match(settings, /href="spike-tools\.html"/);
  assert.match(tools, /href="settings\.html"/);
});
