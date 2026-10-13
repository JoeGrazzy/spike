import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const css = await readFile('css/spike-three-theme-authority.css', 'utf8');
const js = await readFile('js/theme.js', 'utf8');
const settings = await readFile('settings.html', 'utf8');
test('Theme 3 is Premium Neon Red with a dark red-forward palette', () => {
  assert.match(js, /id:3,name:'Premium Neon Red',mode:'dark'/);
  assert.match(css, /html\[data-spike-style="3"\]\{color-scheme:dark/);
  assert.match(css, /--spike-bg:#08070b/);
  assert.match(css, /--spike-accent:#ff244f/);
  assert.match(css, /--spike-accent-2:#ff6688/);
  assert.match(css, /Premium Neon Red — restrained glow/);
  assert.match(settings, /<option value="3">Premium Neon Red<\/option>/);
});
test('Every HTML page bootstraps Theme 3 as dark before styles load', async () => {
  for (const page of (await readdir('.')).filter(name => name.endsWith('.html'))) {
    const html = await readFile(page, 'utf8');
    if (html.includes('n===1?"dark":"light"') || html.includes('n===1||n===3')) {
      assert.match(html, /\(n===1\|\|n===3\)\?"dark":(?:m|"light")/, page);
    }
  }
});
