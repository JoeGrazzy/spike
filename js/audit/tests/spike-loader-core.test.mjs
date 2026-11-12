import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const core = fs.readFileSync(path.join(root, 'js/spike-loader-core.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/spike-premium-loader.css'), 'utf8');
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
test('shared loader core is idempotent and versioned', () => {
  assert.match(core, /window\.SpikeLoader\?\.version === 1/);
  assert.match(core, /version: 1/);
});
test('loader operations have unique ownership tokens and idempotent end', () => {
  assert.match(core, /spike-load-\$\{\+\+sequence\}/);
  assert.match(core, /if \(ended\) return false/);
  assert.match(core, /active\.delete\(id\)/);
});
test('page overlay registration is idempotent and cleans up timers/listeners', () => {
  assert.match(core, /registrations\.get\(element\)/);
  assert.match(core, /registrations\.delete\(element\)/);
  assert.match(core, /removeEventListener\('click', onRetryClick\)/);
  assert.match(core, /window\.clearTimeout\(timer\)/);
});
test('loader CSS is namespaced to known full-screen overlays', () => {
  assert.match(css, /#spike-auth-loader/);
  assert.match(css, /\.loader#loader/);
  assert.doesNotMatch(css, /(^|,)\s*\.spinner\s*\{/m);
});
test('every HTML page loads the shared loader core exactly once', () => {
  assert.ok(htmlFiles.length > 0);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal((html.match(/js\/spike-loader-core\.js/g) || []).length, 1, `${file} must include one shared loader core`);
  }
});
test('Feed loader adapter delegates to shared controller', () => {
  const adapter = fs.readFileSync(path.join(root, 'js/feed-runtime-07.js'), 'utf8');
  assert.match(adapter, /core\.register\(loader/);
  assert.match(adapter, /controller\.hide\(\)/);
  assert.match(adapter, /retry: "reload"/);
});
