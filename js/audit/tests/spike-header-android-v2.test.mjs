import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../../feed.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../css/spike-header-android-v2.css', import.meta.url), 'utf8');

test('Feed loads the Android header override after shared theme and polish CSS', () => {
  const theme = html.indexOf('href="css/theme.css"');
  const polish = html.indexOf('href="css/spike-final-polish.css"');
  const header = html.indexOf('href="css/spike-header-android-v2.css"');
  assert.ok(theme >= 0 && polish > theme && header > polish, 'stylesheet cascade order must be theme → polish → Android header');
});

test('Header actions are anchored to the right grid lane and remain tappable', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s*!important/);
  assert.match(css, /justify-self:\s*end\s*!important/);
  assert.match(css, /min-height:\s*42px\s*!important/);
});

test('Header preserves Android safe-area padding and responsive small-screen rules', () => {
  assert.match(css, /env\(safe-area-inset-top,\s*0px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /@media\s*\(max-width:\s*340px\)/);
});
