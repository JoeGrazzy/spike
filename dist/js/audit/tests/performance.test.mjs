import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readdir, readFile } from 'node:fs/promises';

const budgets = {
  html: 180_000,
  pageOverrides: { 'feed.html': 350_000 },
  css: 60_000,
  js: 180_000
};
const htmlFiles = (await readdir('.')).filter(x => x.endsWith('.html'));
for (const file of htmlFiles) test(`HTML budget: ${file}`, async () => {
  const max = budgets.pageOverrides[file] ?? budgets.html;
  assert.ok((await stat(file)).size <= max, `${file} exceeds ${max} bytes`);
});
for (const dir of ['css','js']) {
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter(x => x.isFile() && (dir === 'css' ? x.name.endsWith('.css') : x.name.endsWith('.js')))
    .map(x => `${dir}/${x.name}`);
  for (const file of files) test(`asset budget: ${file}`, async () => {
    const max = dir === 'css' ? budgets.css : budgets.js;
    assert.ok((await stat(file)).size <= max, `${file} exceeds ${max} bytes`);
  });
}
test('no duplicated shared CSS/JS in assets root', async () => {
  const files = await readdir('assets');
  const forbidden = files.filter(x => /\.(css|js)$/.test(x));
  assert.deepEqual(forbidden, [], `duplicate shared assets remain: ${forbidden.join(', ')}`);
});
