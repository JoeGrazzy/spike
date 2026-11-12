import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings preference switches have programmatic accessible names', async () => {
  const html = await readFile('settings.html', 'utf8');
  const ids = ['feedSensitive','feedSpoilers','feedPolitical','feedFollowingOnly','messageTone','incomingTone','outgoingTone','np_likes','np_comments','np_mentions','np_follows','np_friend_requests','np_messages','np_calls','np_rooms','np_coins','np_purchases','np_announcements','np_system','online','discovery'];
  for (const id of ids) {
    const tag = html.match(new RegExp(`<input\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i'))?.[0];
    assert.ok(tag, `missing input ${id}`);
    assert.match(tag, /aria-label=["'][^"']+/, `${id} needs an accessible name`);
  }
});

test('profile editor controls have accessible names independent of placeholder text', async () => {
  const html = await readFile('profile.html', 'utf8');
  for (const id of ['editName','editUsername','editBio','editAvatarFile','editAvatar','editCoverFile','editCover','editWebsite','editLocation','editSocial','qrFile']) {
    const tag = html.match(new RegExp(`<input\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>|<textarea\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i'))?.[0];
    assert.ok(tag, `missing control ${id}`);
    assert.match(tag, /aria-label=["'][^"']+/, `${id} needs an accessible name`);
  }
});

test('Feed feature forms and search controls have accessible names', async () => {
  const html = await readFile('feed.html', 'utf8');
  for (const id of ['featureFeedName','featureFeedTopics','featureFeedDescription','featurePollQuestion','featurePollOptions','featureSeriesTitle','featureSeriesDescription','featureSeriesPosts','featureCollabPost','featureCollabUser','featureMembershipName','featureMembershipDescription','featureMembershipCoins','featureProductTitle','featureProductDescription','featureProductCoins','featureSearchInput','spikeAiInput','v2DiscoverSearch','v2MutedKeywords']) {
    const tag = html.match(new RegExp(`<input\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>|<textarea\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i'))?.[0];
    assert.ok(tag, `missing control ${id}`);
    assert.match(tag, /aria-label=["'][^"']+/, `${id} needs an accessible name`);
  }
});
