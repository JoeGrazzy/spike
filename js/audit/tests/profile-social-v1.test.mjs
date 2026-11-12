import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../../../profile.html', import.meta.url), 'utf8');
const profileJs = readFileSync(new URL('../../profile-page.js', import.meta.url), 'utf8');
const socialService = readFileSync(new URL('../../spike-social.js', import.meta.url), 'utf8');

test('profile follow and unfollow use the authoritative transactional RPC', () => {
  assert.match(profile, /js\/spike-social\.js/);
  assert.match(profileJs, /window\.SPIKE\.social\.setFollow\(db,state\.uid,!state\.following\)/);
  assert.match(socialService, /rpc\('spike_set_follow_v1'/);
  assert.doesNotMatch(profileJs, /rpc\('spike_toggle_follow_v1'/);
});

test('followers and following lists use server-side privacy-aware pagination', () => {
  assert.match(profile, /window\.SPIKE\.social\.getList\(db,state\.uid,kind,\{limit:30,offset\}\)/);
  assert.match(socialService, /rpc\('get_spike_profile_social_list_v2'/);
  assert.doesNotMatch(profile, /select\('path,data'\)\.eq\('collection_name','users'\)\.limit\(1000\)/);
});

test('blocked list is owner-only and supports unblock', () => {
  assert.match(profile, /kind==='blocked'&&state\.uid!==state\.me\?\.id/);
  assert.match(profile, /rpc\('dm_unblock_user'/);
  assert.match(profile, /data-person-action="unblock"/);
});

test('post edit and delete controls are rendered only for the owner and server-authorized', () => {
  assert.match(profile, /state\.uid===state\.me\?\.id\?`<button type="button" data-post-action="edit"/);
  assert.match(profile, /rpc\('delete_own_post'/);
  assert.match(profile, /found\.data\.owner_id!==state\.me\.id/);
});
