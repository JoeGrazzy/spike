import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const feed = await readFile(new URL('../../../feed.html', import.meta.url), 'utf8');
const sidecar = await readFile(new URL('../../spike-feed-image-fallback-v1.js', import.meta.url), 'utf8');
const protectedRuntime = await readFile(new URL('../../feed-runtime-04-2.js', import.meta.url), 'utf8');

function parserSource() {
  const start = sidecar.indexOf('function originalCloudinaryImageUrl(');
  assert.notEqual(start, -1, 'originalCloudinaryImageUrl helper is missing');
  const end = sidecar.indexOf('\n  function fallback(', start);
  assert.notEqual(end, -1, 'original URL helper boundary is missing');
  return sidecar.slice(start, end).replace(/^  /gm, '');
}

test('Feed loads an isolated original-image fallback without changing the protected runtime', () => {
  assert.match(feed, /js\/spike-feed-image-fallback-v1\.js/);
  assert.match(sidecar, /document\.addEventListener\('error',[\s\S]*?true\)/);
  assert.match(sidecar, /spikeOriginalFallbackAttempted/);
  assert.match(protectedRuntime, /function cloudinaryFeedImageUrl\(/);
  assert.doesNotMatch(protectedRuntime, /spikeOriginalFallbackAttempted/);
});

test('Cloudinary transform parser strips only recognized image transformation segments', () => {
  const context = { URL, location: { href: 'https://example.com/feed.html' } };
  vm.runInNewContext(`${parserSource()}\nglobalThis.parse = originalCloudinaryImageUrl;`, context);
  assert.equal(context.parse('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:eco,w_1080,c_limit,dpr_auto/folder/photo.jpg'), 'https://res.cloudinary.com/demo/image/upload/folder/photo.jpg');
  assert.equal(context.parse('https://res.cloudinary.com/demo/image/upload/f_gif,fl_animated,q_auto:eco,w_1080,c_limit/animated.gif'), 'https://res.cloudinary.com/demo/image/upload/animated.gif');
  assert.equal(context.parse('https://res.cloudinary.com/demo/image/upload/c_fill,w_300,h_300/f_auto,q_auto:eco/v123/folder/photo.jpg'), 'https://res.cloudinary.com/demo/image/upload/v123/folder/photo.jpg');
  assert.equal(context.parse('https://res.cloudinary.com/demo/image/upload/v123/folder/photo.jpg'), '');
  assert.equal(context.parse('https://cdn.example.com/f_auto/photo.jpg'), '');
  assert.equal(context.parse('javascript:alert(1)'), '');
});

test('fallback listener is restricted to Feed media thumbnails and runs only once per image', () => {
  assert.match(sidecar, /img\.closest\('#posts \.post-media'\)/);
  assert.match(sidecar, /img\.dataset\.spikeOriginalFallbackAttempted === '1'/);
  assert.match(sidecar, /img\.src = original/);
});

test('fallback implementation switches to the original URL once and ignores a second failure', () => {
  const start = sidecar.indexOf('function fallback(img)');
  const end = sidecar.indexOf('\n  document.addEventListener', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const fallbackSource = sidecar.slice(start, end).replace(/^  /gm, '');
  class FakeImage {}
  const context = { URL, location: { href: 'https://example.com/feed.html' }, HTMLImageElement: FakeImage };
  vm.runInNewContext(`${parserSource()}\n${fallbackSource}\nglobalThis.runFallback = fallback;`, context);
  const img = new FakeImage();
  img.src = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/photo.jpg';
  img.currentSrc = img.src;
  img.dataset = {};
  assert.equal(context.runFallback(img), true);
  assert.equal(img.src, 'https://res.cloudinary.com/demo/image/upload/photo.jpg');
  assert.equal(img.dataset.spikeOriginalFallbackAttempted, '1');
  assert.equal(context.runFallback(img), false);
});
