import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const profile = await fs.readFile('profile.html','utf8');
const viewUser = await fs.readFile('view_user.html','utf8');

test('public profile checks friends visibility before exposing activity follower counts', () => {
  assert.match(profile, /state\.canSeeFriends=\(await access\?\.friends\?\.\(state\.uid\)\)===true/);
  assert.match(profile, /activityFollowers.*state\.canSeeFriends===false\?'—':state\.followers/);
});

test('public member profile shows each profile metric once and avoids duplicate activity summary', () => {
  assert.equal((viewUser.match(/id="postCount"/g)||[]).length, 1);
  assert.equal((viewUser.match(/id="followerCount"/g)||[]).length, 1);
  assert.equal((viewUser.match(/id="followingCount"/g)||[]).length, 1);
  assert.doesNotMatch(viewUser, /id="activitySummary"|id="activityPostCount"|id="activityFollowerCount"/);
  assert.match(viewUser, /state\.canSeeFriends\?state\.followersCount/);
});
