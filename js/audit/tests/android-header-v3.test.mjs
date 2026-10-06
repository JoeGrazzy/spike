import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/spike-android-feed-v1.css'), 'utf8');

test('Android header v3 rules are appended to the final Feed stylesheet', () => {
  assert.match(feed, /css\/spike-android-feed-v1\.css/);
  assert.ok(css.indexOf('SPIKE Android header v3') > css.indexOf('SPIKE FEED — PRODUCT SURFACE V1'));
});

test('Android header v3 constrains the lockup to a stable mobile header height', () => {
  assert.match(css, /height:\s*76px\s*!important/);
  assert.match(css, /brand-logo-wrap[\s\S]*?width:\s*44px\s*!important/);
  assert.match(css, /brand-subtitle[\s\S]*?line-height:\s*1\.1\s*!important/);
  assert.match(css, /margin:\s*3px 0 0\s*!important/);
});

test('Android header v3 retains safe-area padding and narrow-screen action sizing', () => {
  assert.match(css, /env\(safe-area-inset-right/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /header-actions[\s\S]*?flex-basis:\s*36px\s*!important/);
});
