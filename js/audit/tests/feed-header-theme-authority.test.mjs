import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('feed.html', 'utf8');
const css = await readFile('css/spike-feed-header-theme-v1.css', 'utf8');

test('Feed loads its header/menu theme authority after the shared three-theme palette', () => {
  const paletteIndex = html.indexOf('css/spike-three-theme-authority.css');
  const feedAuthorityIndex = html.indexOf('css/spike-feed-header-theme-v1.css');
  assert.ok(paletteIndex >= 0, 'Feed must load the shared theme palette');
  assert.ok(feedAuthorityIndex > paletteIndex, 'Feed-specific authority must load after the palette');
});

test('Feed header controls use canonical theme tokens rather than system Canvas colors', () => {
  assert.match(css, /body\[data-spike-page="feed"\] > header\.header[\s\S]*?background:[^;]*var\(--spike-surface\)/);
  assert.match(css, /\.brand-subtitle\s*\{\s*color:\s*var\(--spike-muted\)/);
  assert.match(css, /\.header-actions[\s\S]*?var\(--spike-line\)/);
  assert.doesNotMatch(css, /CanvasText|background:\s*Canvas\s*!important/);
});

test('Feed command menu, secondary navigation, and bottom dock consume theme tokens', () => {
  for (const selector of ['#menuOverlay', '.spike-command-menu', '.spike-menu-sheet', '.spike-smart-nav', '#spikeBottomNav']) {
    assert.ok(css.includes(selector), `Theme authority must cover ${selector}`);
  }
  for (const token of ['--spike-bg', '--spike-surface', '--spike-surface-2', '--spike-text', '--spike-muted', '--spike-line', '--spike-accent', '--spike-focus']) {
    assert.ok(css.includes(token), `Theme authority must consume ${token}`);
  }
  assert.match(css, /:focus-visible[\s\S]*?outline:\s*3px solid var\(--spike-focus\)/);
});

test('Feed theme rules remain generic and do not overwrite theme palettes', () => {
  assert.doesNotMatch(css, /data-spike-style="[123]"\s*\{[^}]*--spike-(?:bg|surface|text|accent)\s*:/s);
  assert.match(html, /id="menuOverlay"/);
  assert.match(html, /id="spikeBottomNav"/);
});
