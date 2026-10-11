import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const html = await readFile(new URL('feed.html', root), 'utf8');

test('V10.4 raises the existing feed header above the open menu overlay', () => {
  assert.match(html, /#menuOverlay\.open[\s\S]*?> header\.header[\s\S]*?z-index:\s*120010\s*!important/);
  assert.match(html, /#menuOverlay\[aria-hidden="false"\][\s\S]*?> header\.header/);
  assert.match(html, /#menuOverlay\.open[\s\S]*?> header\.header[\s\S]*?visibility:\s*visible\s*!important/);
});

test('V10.4 preserves the existing header and menu toggle contract', () => {
  assert.match(html, /<header class="header">/);
  assert.match(html, /id="menuBtn"/);
  assert.match(html, /id="menuOverlay"/);
});
