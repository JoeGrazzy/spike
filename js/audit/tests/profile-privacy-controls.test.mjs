import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const html = readFileSync(resolve(root, 'profile.html'), 'utf8');
const nativeSelect = readFileSync(resolve(root, 'js/spike-native-select.js'), 'utf8');
test('Profile Edit defines all six audience selectors and two privacy switches', () => {
  for (const id of ['editVisibility','editPostsVisibility','editMediaVisibility','editFriendsVisibility','editMessages','editCalls','editOnline','editDiscovery']) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
});
test('privacy selector trigger remains visible after native-select decoration', () => {
  assert.match(nativeSelect, /b\.className='spike-select-trigger'/);
  assert.match(html, /\.privacy-row>\s*\.spike-select-trigger\{display:flex!important/);
  assert.match(html, /\.privacy-row>\s*\.spike-select-native-hidden\{display:none!important/);
  assert.doesNotMatch(html, /\.privacy-row>\s*:\s*nth-child\(n\+3\)\{display:none!important\}/);
});
test('privacy save payload includes every privacy field', () => {
  for (const field of ['profile_visibility','posts_visibility','media_visibility','friends_visibility','allow_messages','allow_calls','show_online_status','allow_profile_discovery']) assert.match(html, new RegExp(`${field}:`), `${field} should be saved`);
});
