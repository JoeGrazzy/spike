import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js/spike-post-publisher.js'), 'utf8');
const feed = fs.readFileSync(path.join(root, 'feed.html'), 'utf8');

function service() {
  const window = { crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' } };
  vm.runInNewContext(source, { window, Blob, console, Math, Date, Set, String, Array, Error });
  return window.SPIKE_POSTS;
}

test('post publisher is loaded on Feed after the Supabase bootstrap', () => {
  assert.ok(feed.indexOf('spike-platform-bootstrap.js') < feed.indexOf('spike-post-publisher.js'));
  assert.match(source, /window\.SPIKE_POSTS\s*=\s*Object\.freeze/);
});

test('post validation requires text or media and enforces database visibility values', () => {
  const api = service();
  assert.throws(() => api.validate({ body: '  ', files: [] }), /Write something or attach media/);
  assert.throws(() => api.validate({ body: 'hello', files: [], visibility: 'everyone' }), /valid post visibility/);
  assert.equal(api.validate({ body: ' hello ', files: [], visibility: 'followers' }).body, 'hello');
});

test('post media validation matches the private post-media bucket and 6 MB standard upload guard', () => {
  const api = service();
  const good = new Blob(['image'], { type: 'image/png' });
  Object.defineProperty(good, 'name', { value: 'photo.png' });
  assert.equal(api.validate({ files: [good] }).files.length, 1);
  const bad = new Blob(['payload'], { type: 'application/pdf' });
  assert.throws(() => api.validate({ files: [bad] }), /Unsupported post media type/);
  const large = new Blob([new Uint8Array(6 * 1024 * 1024 + 1)], { type: 'video/mp4' });
  assert.throws(() => api.validate({ files: [large] }), /6 MB or smaller/);
  assert.equal(api.bucket, 'post-media');
});

test('post publishing writes ownership-safe paths and the exact posts/post_media schema fields', () => {
  assert.match(source, /author_id:\s*user\.id/);
  assert.match(source, /status:\s*'published'/);
  assert.match(source, /\$\{user\.id\}\/\$\{postId\}\//);
  assert.match(source, /owner_id:\s*user\.id/);
  assert.match(source, /object_path:\s*data\.path/);
  assert.match(source, /media_type:\s*mediaType\(file\)/);
  assert.match(source, /byte_size:\s*file\.size/);
  assert.match(source, /createSignedUrl\(row\.object_path, expiresIn\)/);
  assert.match(source, /from\(BUCKET\)\.remove/);
});
