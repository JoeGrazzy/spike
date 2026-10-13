import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profile = await readFile('profile.html', 'utf8');
const settings = await readFile('settings.html', 'utf8');

test('Privacy and access controls have one home in Settings, not the profile identity editor', () => {
  for (const id of ['profile','posts','media','friends','messages','calls','online','discovery']) {
    assert.match(settings, new RegExp(`id=["']${id}["']`), `${id} setting should exist in Settings`);
  }
  for (const id of ['editVisibility','editPostsVisibility','editMediaVisibility','editFriendsVisibility','editMessages','editCalls','editOnline','editDiscovery']) {
    assert.doesNotMatch(profile, new RegExp(`id=["']${id}["']`), `${id} should not be duplicated in the profile editor`);
  }
  assert.match(profile, /settings\.html#privacy/);
});

test('Saving profile details preserves the account privacy values already loaded from Settings', () => {
  for (const field of ['profile_visibility','posts_visibility','media_visibility','friends_visibility','allow_messages','allow_calls','show_online_status','allow_profile_discovery']) {
    assert.match(profile, new RegExp(`${field}:state\.privacy\?\.`), `${field} should be read from the loaded privacy state`);
  }
  assert.match(profile, /Privacy is owned by settings\.html/);
});
