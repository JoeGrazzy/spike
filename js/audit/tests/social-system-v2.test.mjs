import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261108150155_spike_social_system_v2.sql');
const socialJs = read('js/spike-social-connections.js');
const socialService = read('js/spike-social.js');
const followers = read('followers.html');
const following = read('following.html');
const mutuals = read('mutuals.html');
const friends = read('friends.html');
const profile = read('profile.html');
const profileJs = read('js/profile-page.js');

test('social V2 exposes server-side search for both connection lists', () => {
  assert.match(migration, /get_spike_profile_social_list_v2\([\s\S]*p_search text default null/i);
  assert.match(migration, /position\(v_search in lower\(concat_ws/i);
  assert.match(socialService, /get_spike_profile_social_list_v2/);
  assert.match(socialJs, /window\.SPIKE\.social\.getList/);
  assert.match(socialService, /p_search: options\.search/);
  assert.doesNotMatch(socialJs, /Search applies to members loaded so far/);
});

test('mutual connections are computed server-side and privacy checked', () => {
  assert.match(migration, /create or replace function public\.get_spike_mutual_connections/i);
  assert.match(migration, /can_view_spike_friends\(v_uid,p_other_user_id\)/i);
  assert.match(migration, /join owner_following b using\(user_id\)/i);
  assert.match(migration, /private_message_blocks/i);
  assert.match(socialService, /get_spike_mutual_connections/);
  assert.match(socialJs, /window\.SPIKE\.social\.getMutuals/);
  assert.match(followers, /id="mutualLink"/);
  assert.match(following, /id="mutualLink"/);
  assert.match(mutuals, /data-social-kind="mutuals"/);
});

test('social updates use private per-user realtime topics', () => {
  assert.match(migration, /user:'\|\|v_actor::text\|\|':social'/);
  assert.match(migration, /user:'\|\|v_target_text\|\|':social'/);
  assert.match(migration, /spike users can receive social connection broadcasts/i);
  assert.match(socialJs, /user:\$\{uid\}:social/);
  assert.match(socialJs, /social_connection_changed/);
  assert.match(socialJs, /60000/);
});

test('follow notifications normalize string and object relationship entries', () => {
  assert.match(migration, /jsonb_typeof\(x\.value\)='object'[\s\S]*?x\.value->>'id'[\s\S]*?x\.value->>'user_id'/);
  assert.match(migration, /private\.emit_notification\([\s\S]*?'follow'/);
});

test('friend request screen refreshes from the existing private notifications channel', () => {
  assert.match(friends, /user:\$\{state\.user\.id\}:notifications/);
  assert.match(friends, /notification_created/);
  assert.match(friends, /notification_updated/);
  assert.match(friends, /loadRequests\(\)/);
  assert.match(friends, /setInterval\(\(\)=>\{if\(!document\.hidden&&navigator\.onLine\)loadRequests/);
});


test('profile provides a direct mutual-connections entry and refreshes social state live', () => {
  assert.match(profile, /id="mutualConnectionsShortcut"/);
  assert.match(profileJs, /mutuals\.html\?uid=/);
  assert.match(profileJs, /user:\$\{uid\}:social/);
  assert.match(profileJs, /social_connection_changed/);
  assert.match(profileJs, /loadSocial\(\)\.then\(\(\)=>\{renderActions\(\);render\(\);\}\)/);
});

test('social realtime topic policy allows only self or viewers authorized for that profile', () => {
  const policy = read('supabase/migrations/20261108150328_spike_social_realtime_profile_visibility_v1.sql');
  assert.match(policy, /topic ~\* '\^user:/i);
  assert.match(policy, /can_view_spike_friends\(\(select auth\.uid\(\)\),split_part\(topic,':',2\)::uuid\)/i);
  assert.match(policy, /private_message_blocks/i);
});
