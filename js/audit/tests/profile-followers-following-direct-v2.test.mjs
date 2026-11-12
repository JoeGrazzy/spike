import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../../../profile.html', import.meta.url), 'utf8');
const followers = readFileSync(new URL('../../../followers.html', import.meta.url), 'utf8');
const following = readFileSync(new URL('../../../following.html', import.meta.url), 'utf8');
const socialRuntime = readFileSync(new URL('../../../js/spike-social-connections.js', import.meta.url), 'utf8');
const socialService = readFileSync(new URL('../../../js/spike-social.js', import.meta.url), 'utf8');
const migrations = readFileSync(new URL('../../../supabase/migrations/20261108152000_spike_profile_follow_lists_reliability_v5.sql', import.meta.url), 'utf8');

test('Followers and Following stat taps navigate directly to dedicated pages', () => {
  assert.match(profile, /openSocialDestination\(b\.dataset\.stat\)/);
  assert.match(profile, /function openSocialDestination\(kind\)[\s\S]*?location\.href=`\$\{kind\}\.html\?uid=/);
  assert.match(profile, /if\(kind==='followers'\|\|kind==='following'\)\{location\.href=/);
});

test('dedicated pages render complete lists without a preview overlay or intermediate action', () => {
  assert.match(followers, /data-social-kind="followers"/);
  assert.match(following, /data-social-kind="following"/);
  for (const page of [followers, following]) {
    assert.match(page, /id="socialList"/);
    assert.match(page, /id="loadMore"/);
    assert.doesNotMatch(page, /socialListOverlay|preview-sheet|preview-card/i);
  }
});

test('dedicated list runtime uses privacy-aware server pagination and direct profile links', () => {
  assert.match(socialService, /get_spike_profile_social_list/);
  assert.match(socialRuntime, /window\.SPIKE\.social\.getList/);
  assert.match(socialService, /p_limit: options\.limit/);
  assert.match(socialRuntime, /profile\.html\?uid=/);
  assert.doesNotMatch(followers + following, /preview-sheet|preview-card|socialListOverlay/i);
});

test('member rows navigate directly to profiles and follow actions use the transactional RPC', () => {
  assert.match(socialRuntime, /link\.href = profileUrl\(id\)/);
  assert.match(socialRuntime, /window\.SPIKE\.social\.setFollow/);
  assert.match(socialRuntime, /window\.SPIKE\.social\.getCounts/);
  assert.match(socialService, /spike_set_follow_v1/);
  assert.match(socialService, /get_spike_profile_social_list_v2/);
});

test('server list query handles legacy documents without owner_id and missing profile projections', () => {
  assert.match(migrations, /coalesce\(d\.owner_id::text,d\.document_id\) as user_id/);
  assert.match(migrations, /d\.path='users\/'\|\|d\.document_id/);
  assert.match(migrations, /left join public\.app_documents d on d\.collection_name='users'/);
  assert.match(migrations, /'__profile_missing__'/);
});

test('followers and following counts use the same legacy-compatible document identity', () => {
  assert.match(migrations, /create or replace function public\.get_spike_profile_follow_counts/);
  assert.match(migrations, /count\(distinct coalesce\(d\.owner_id::text,d\.document_id\)\)/);
  assert.match(migrations, /public\.can_view_spike_friends\(auth\.uid\(\),p_owner\)/);
});
