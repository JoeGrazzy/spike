import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../../spike-social.js');
const profile = read('../../../profile.html');
const profileJs = read('../../profile-page.js');
const viewUser = read('../../../view_user.html');
const feed = read('../../../feed.html');
const feedLoader = read('../../feed-runtime-04-1.js');
const feedActions = read('../../feed-runtime-04-3.js');
const socialLists = read('../../spike-social-connections.js');
const followers = read('../../../followers.html');
const following = read('../../../following.html');
const mutuals = read('../../../mutuals.html');

test('one shared social service is loaded before all social UI entry points', () => {
  for (const page of [profile, viewUser, feed, followers, following, mutuals]) {
    assert.match(page, /js\/spike-social\.js\?v=unified-social-v2/);
  }
});

test('the shared service owns all relationship mutations, reads, lists and counts', () => {
  assert.match(service, /rpc\('spike_set_follow_v1'/);
  assert.match(service, /rpc\('get_spike_profile_follow_counts'/);
  assert.match(service, /rpc\('get_spike_profile_social_list_v2'/);
  assert.match(service, /rpc\('get_spike_mutual_connections'/);
  assert.match(service, /readFollowingIds/);
});

test('profile, view-user, feed and list pages delegate follow mutations to the service', () => {
  assert.match(profileJs, /window\.SPIKE\.social\.setFollow/);
  assert.match(viewUser, /window\.SPIKE\.social\.setFollow/);
  assert.match(feedActions, /window\.SPIKE\.social\.setFollow/);
  assert.match(socialLists, /window\.SPIKE\.social\.setFollow/);
  for (const source of [profileJs, viewUser, feedActions, socialLists]) {
    assert.doesNotMatch(source, /rpc\(['"]spike_toggle_follow_v1/);
  }
});

test('all follow list and count surfaces delegate to the same service', () => {
  assert.match(profileJs, /social\.getCounts/);
  assert.match(viewUser, /social\.getCounts/);
  assert.match(socialLists, /social\.getCounts/);
  assert.match(socialLists, /social\.getList/);
  assert.match(socialLists, /social\.getMutuals/);
  assert.match(feedLoader, /social\.readFollowingIds/);
});

test('no client surface writes the following array directly', () => {
  assert.doesNotMatch(viewUser, /upsert\(\{path:[\s\S]{0,220}following/);
  assert.doesNotMatch(feedActions, /putDoc\(`users\/\$\{state\.user\.id\}`,[\s\S]{0,220}following/);
  assert.doesNotMatch(profileJs, /putDoc\(`users\/\$\{state\.me\.id\}`,[\s\S]{0,220}following/);
  assert.doesNotMatch(socialLists, /from\(['"]app_documents['"]\)[\s\S]{0,180}(?:upsert|update)/);
});

test('shared service normalizes legacy string and object-form following IDs', async () => {
  const { runInNewContext } = await import('node:vm');
  const sandbox = { window: {} };
  runInNewContext(service, sandbox);
  const social = sandbox.window.SPIKE.social;
  assert.deepEqual(Array.from(social.normalizeIds([
    'u1', { id: 'u2' }, { user_id: 'u3' }, { id: 'u2' }, '', null
  ])), ['u1', 'u2', 'u3']);
});

test('shared follow mutation checks the authenticated actor and calls only the canonical RPC', async () => {
  const { runInNewContext } = await import('node:vm');
  const calls = [];
  const sandbox = { window: {} };
  runInNewContext(service, sandbox);
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor-1' } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { following: true, changed: true }, error: null };
    }
  };
  const result = await sandbox.window.SPIKE.social.setFollow(db, 'target-2', true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { following: true, changed: true, userId: 'target-2' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ name: 'spike_set_follow_v1', args: { p_target_user_id: 'target-2', p_following: true } }]);
});

test('shared count and list reads use their single canonical RPC contracts', async () => {
  const { runInNewContext } = await import('node:vm');
  const calls = [];
  const sandbox = { window: {} };
  runInNewContext(service, sandbox);
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'get_spike_profile_follow_counts') return { data: [{ followers_count: 8, following_count: 5 }], error: null };
      return { data: [{ id: 'member-1' }], error: null };
    }
  };
  const social = sandbox.window.SPIKE.social;
  assert.deepEqual(JSON.parse(JSON.stringify(await social.getCounts(db, 'owner-1'))), { followers: 8, following: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(await social.getList(db, 'owner-1', 'followers', { limit: 20, offset: 40, search: 'ana' }))), [{ id: 'member-1' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await social.getMutuals(db, 'owner-2', { limit: 10, offset: 0 }))), [{ id: 'member-1' }]);
  assert.deepEqual(calls.map(call => call.name), [
    'get_spike_profile_follow_counts', 'get_spike_profile_social_list_v2', 'get_spike_mutual_connections'
  ]);
});
