import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../../', import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');

test('Settings uses one authoritative select surface renderer', () => {
  assert.match(html, /spike-surface-controls\.css/);
  assert.match(html, /spike-surface-controls\.js/);
  assert.doesNotMatch(html, /spike-native-select\.css/);
  assert.doesNotMatch(html, /spike-native-select\.js/);
});

test('Settings select controls retain their real select elements', () => {
  const ids = ['theme','messages','calls','profile','posts','media','friends'];
  for (const id of ids) assert.match(html, new RegExp(`<select[^>]+id=["']${id}["']`), id);
});
