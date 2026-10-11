import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../feed-runtime-04-2.js', import.meta.url), 'utf8');
const sharedSource = await readFile(new URL('../../feed-runtime-04-1.js', import.meta.url), 'utf8');
const combinedSource = `${sharedSource}\n${source}`;
test('feed runtime defines media kind helpers before rendering feed media', () => {
  const gifHelper = source.match(/function isGifUrl\(url\)\s*\{[\s\S]*?\n\}/)?.[0];
  const kindHelper = source.match(/function mediaKindOf\(item\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(gifHelper, 'isGifUrl helper is missing');
  assert.ok(kindHelper, 'mediaKindOf helper is missing');
  const context = {};
  vm.runInNewContext(`${gifHelper}\n${kindHelper}\nglobalThis.result = [\n` +
    `mediaKindOf({type:'video',url:'https://cdn.example/a.gif'}),` +
    `mediaKindOf({type:'video',mimeType:'image/gif',url:'https://cdn.example/a.mp4'}),` +
    `mediaKindOf({type:'video',url:'https://cdn.example/a.mp4'}),` +
    `mediaKindOf({type:'image',url:'https://cdn.example/a.jpg'})` +
    `];`, context);
  assert.deepEqual(Array.from(context.result), ['gif', 'gif', 'video', 'image']);
});

test('feed media URL helpers exist and generate safe Cloudinary image/video URLs', () => {
  for (const name of ['cloudinaryFeedImageUrl', 'cloudinaryVideoPosterUrl', 'cloudinaryVideoAssetTail', 'cloudinaryVideoTransformUrl', 'cloudinaryFeedVideoCandidates', 'cloudinaryFeedVideoUrl']) {
    assert.match(combinedSource, new RegExp(`function ${name}\\(`), `${name} helper is missing`);
  }
  const helperNames = ['cloudinaryFeedImageUrl', 'cloudinaryVideoPosterUrl', 'cloudinaryVideoAssetTail', 'cloudinaryVideoTransformUrl', 'cloudinaryFeedVideoCandidates', 'cloudinaryFeedVideoUrl'];
  const snippets = helperNames.map(name => {
    const start = combinedSource.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} not found`);
    const next = combinedSource.indexOf('\nfunction ', start + 10);
    return combinedSource.slice(start, next === -1 ? combinedSource.length : next);
  }).join('\n');
  const context = {
    URL,
    safeHttpUrl: value => { try { const u = new URL(String(value || '')); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } },
    isGifUrl: url => /\.gif(?:[?#].*)?$/i.test(String(url || '')),
    SPIKE_VIDEO_FALLBACK_TRANSFORM: 'f_mp4,vc_h264,ac_aac,q_auto:good',
    SPIKE_VIDEO_DELIVERY_TRANSFORM: 'f_mp4,vc_h264:baseline:3.1,ac_aac,q_auto:good'
  };
  vm.runInNewContext(`${snippets}\nglobalThis.out = { image: cloudinaryFeedImageUrl('https://res.cloudinary.com/demo/image/upload/sample.jpg'), gif: cloudinaryFeedImageUrl('https://res.cloudinary.com/demo/image/upload/animated.gif'), video: cloudinaryFeedVideoUrl('https://res.cloudinary.com/demo/video/upload/sample.mov'), poster: cloudinaryVideoPosterUrl('https://res.cloudinary.com/demo/video/upload/v123/sample.mp4'), external: cloudinaryFeedImageUrl('https://cdn.example/photo.jpg') };`, context);
  assert.match(context.out.image, /f_auto,q_auto:eco,w_1080,c_limit,dpr_auto/);
  assert.match(context.out.gif, /f_gif,fl_animated,q_auto:eco,w_1080,c_limit/);
  assert.match(context.out.video, /f_mp4,vc_h264,ac_aac,q_auto:good/);
  assert.match(context.out.poster, /so_0,f_jpg,q_auto:eco,w_1080,c_limit/);
  assert.ok(context.out.external.includes('https://cdn.example/photo.jpg'));
});
