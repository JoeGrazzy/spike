import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Following and mutual routes resolve to the canonical live connections page', () => {
  for (const [page, kind] of [['following.html', 'following'], ['mutual-connections.html', 'mutuals']]) {
    const html = read(page);
    assert.match(html, /location\.replace\('followers\.html\?'/);
    assert.match(html, new RegExp(`params\\.set\\('kind','${kind}'\\)`));
  }
});

test('Connections search fetches all privacy-filtered pages before matching names, usernames and SP IDs', () => {
  const js = read('js/spike-social-connections.js');
  assert.match(js, /async function fetchAllConnections\(\)/);
  assert.match(js, /offset < 10000/);
  assert.match(js, /limit: pageSize, offset/);
  assert.match(js, /person\.display_name, person\.username, person\.spike_id/);
  assert.match(js, /state\.allResults\.slice\(state\.offset, state\.offset \+ CONFIG\.pageSize\)/);
});

test('Mutual connections count is derived from the complete paginated result, not a missing total_count field', () => {
  const js = read('js/spike-social-connections.js');
  assert.match(js, /state\.mutualTotal = all\.length/);
  assert.match(js, /state\.mutualTotal\.toLocaleString\(\)/);
  assert.doesNotMatch(js, /people\[0\]\?\.total_count/);
});
