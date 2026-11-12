import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('profile.html', 'utf8');
const js = await readFile('js/profile-page.js', 'utf8');

test('profile runtime is externalized and stays within the HTML performance budget', () => {
  assert.match(html, /<script src="js\/profile-page\.js(?:\?v=unified-social-v2)?"><\/script>/);
  assert.ok(Buffer.byteLength(html) <= 180_000);
});

test('profile privacy defaults fail closed when the privacy record is unavailable', () => {
  assert.match(js, /profile_visibility:"private"[\s\S]*show_online_status:false[\s\S]*allow_profile_discovery:false/);
  assert.match(js, /state\.privacyLoadError=!!r\.error \|\| !r\.data/);
  assert.match(js, /state\.canSeeOnline=!state\.privacyLoadError && state\.privacy\.show_online_status===true/);
  assert.match(js, /if\(profileAllowed!==true\)/);
});

test('profile likes use the canonical reactions payload with legacy read compatibility', () => {
  assert.match(js, /p\?\.reactions\?\.like_users/);
  assert.match(js, /function likeCount\(p\)/);
  assert.match(js, /p_action:"like"/);
  assert.match(js, /p\.reactions=\{\.\.\.\(p\.reactions\|\|\{\}\),like_users:nextUsers,like:nextUsers\.length\}/);
});

test('owner post loading filters by author in the database instead of listing the whole collection', () => {
  assert.match(js, /\.eq\("collection_name","posts"\)[\s\S]*\.eq\("data->>authorUid",state\.uid\)/);
  assert.doesNotMatch(js, /listCollection\("posts"\)/);
});

test('profile editor permits explicit avatar and cover removal', () => {
  assert.match(js, /let avatarUrl=\$\("editAvatar"\)\.value\.trim\(\)/);
  assert.match(js, /let coverUrl=\$\("editCover"\)\.value\.trim\(\)/);
  assert.match(js, /p_cover_url:coverUrl/);
});

test('Cloudinary timeout aborts the pending upload request', () => {
  assert.match(js, /const controller=new AbortController\(\)/);
  assert.match(js, /signal:controller\.signal/);
});

test('QR connection feedback follows the database result', () => {
  assert.match(js, /data\?\.ok!==true/);
  assert.match(js, /data\.already_friends\?/);
});
