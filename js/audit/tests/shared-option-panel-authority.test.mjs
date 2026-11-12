import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
walk(root);

test('pages use one shared option-panel controller and no legacy native-select controller', () => {
  const affected = htmlFiles.filter(file => {
    const html = fs.readFileSync(file, 'utf8');
    return html.includes('spike-surface-controls.js') || html.includes('spike-native-select.js') || html.includes('spike-native-select.css');
  });
  assert.ok(affected.length > 0, 'expected option-panel-enabled pages');
  for (const file of affected) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(html.includes('spike-native-select.js'), false, `${path.relative(root, file)} loads legacy panel controller`);
    assert.equal(html.includes('spike-native-select.css'), false, `${path.relative(root, file)} loads legacy panel stylesheet`);
    assert.equal((html.match(/spike-surface-controls\.js/g) || []).length, 1, `${path.relative(root, file)} must load shared controller exactly once`);
    assert.equal(html.includes('css/spike-surface-controls.css'), true, `${path.relative(root, file)} must load shared panel styles`);
  }
});
