import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const sharedThemeSheets = [
  'css/theme.css',
  'css/spike-theme-experience-v3.css',
  'css/spike-theme-final-authority-v1.css',
  'css/spike-theme-runtime-v3.css',
  'css/spike-three-theme-authority.css',
];

test('Every production HTML page loads all five shared theme layers and the central registry', async () => {
  const pages = (await readdir('.')).filter((name) => name.endsWith('.html')).sort();
  assert.ok(pages.length >= 20, `Expected the production page inventory, found ${pages.length} HTML pages`);
  for (const page of pages) {
    const source = await readFile(page, 'utf8');
    for (const stylesheet of sharedThemeSheets) {
      assert.ok(source.includes(stylesheet), `${page} is missing ${stylesheet}`);
    }
    assert.match(source, /js\/theme\.js(?:\?[^"']*)?["']/,
      `${page} is missing the central theme registry`);
  }
});

test('Messaging pages retain the runtime compatibility layer', async () => {
  for (const page of ['message.html', 'messages.html']) {
    const source = await readFile(page, 'utf8');
    assert.match(source, /css\/spike-theme-runtime-v3\.css/,
      `${page} must retain legacy-token aliases used by shared messaging styles`);
  }
});
