import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cloudinary = fs.readFileSync(path.join(root, 'js/spike-cloudinary-storage.js'), 'utf8');
const routing = fs.readFileSync(path.join(root, 'js/spike-media-routing.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
const message = fs.readFileSync(path.join(root, 'message.html'), 'utf8');

test('Cloudinary config matches the connected SPIKE account and enforces its 10 MB raw limit', () => {
  assert.match(cloudinary, /cloudName:\s*'vhmoz6a0'/);
  assert.match(cloudinary, /uploadPreset:\s*'spike_present'/);
  assert.match(cloudinary, /MAX_IMAGE_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(cloudinary, /MAX_VIDEO_BYTES\s*=\s*100\s*\*\s*1024\s*\*\s*1024/);
  assert.match(cloudinary, /MAX_RAW_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(cloudinary, /api_secret|service_role|sb_secret_/i);
});

test('profile uploads use the established spike/profiles/user-id folder pattern', () => {
  assert.match(routing, /\['avatarFile',\s*'avatar_path',\s*'profiles'\]/);
  assert.match(routing, /\['coverFile',\s*'cover_path',\s*'profiles'\]/);
  assert.match(routing, /uploadImage\(file,\s*\{\s*userId:\s*user\.id,\s*folder\s*\}\)/);
});

test('private chat uploads remain in Supabase Storage and reference message attachment columns', () => {
  assert.match(routing, /bucket\s*=\s*'chat-attachments'/);
  assert.match(routing, /db\.storage\.from\(bucket\)\.upload/);
  assert.match(routing, /attachment_path:\s*asset\.path/);
  assert.match(routing, /attachment_type:\s*asset\.type/);
  assert.match(message, /id="mediaInput"/);
  assert.match(message, /data-media-kind="image"/);
});

test('profile and message pages load the platform bootstrap before media routing', () => {
  for (const [name, source] of [['profile.html', profile], ['message.html', message]]) {
    assert.ok(source.indexOf('spike-platform-bootstrap.js') < source.indexOf('spike-media-routing.js'), `${name} must load the Supabase bridge first`);
    assert.match(source, /spike-cloudinary-storage\.js/);
    assert.match(source, /spike-media-routing\.js/);
  }
});
