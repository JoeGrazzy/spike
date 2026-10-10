import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const profile = await fs.readFile('profile.html','utf8');
const viewUser = await fs.readFile('view_user.html','utf8');

test('public profile checks friends visibility before exposing activity follower counts', () => {
  assert.match(profile, /state\.canSeeFriends=\(await access\?\.friends\?\.\(state\.uid\)\)===true/);
  assert.match(profile, /activityFollowers.*state\.canSeeFriends===false\?'—':state\.followers/);
});

test('public member profile exposes an activity summary using already-authorized public data', () => {
  assert.match(viewUser, /id="activitySummary"/);
  assert.match(viewUser, /id="activityPostCount"/);
  assert.match(viewUser, /id="activityMediaCount"/);
  assert.match(viewUser, /id="activityFollowerCount"/);
  assert.match(viewUser, /state\.canSeeMedia\?state\.posts\.reduce/);
  assert.match(viewUser, /state\.canSeeFriends\?state\.followersCount/);
});
