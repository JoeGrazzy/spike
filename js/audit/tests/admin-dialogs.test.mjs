import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../../admin.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../css/spike-admin-responsive-v1.css', import.meta.url), 'utf8');
test('admin action flows do not use blocking browser prompt/confirm dialogs', () => {
  assert.doesNotMatch(html, /\b(?:prompt|confirm|alert)\s*\(/);
});
test('admin dialogs use the stylesheet-authoritative open state and accessible dialog semantics', () => {
  assert.match(html, /id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"/);
  assert.match(html, /modal\.classList\.add\('open'\)/);
  assert.match(html, /modal\.classList\.remove\('open'\)/);
  assert.doesNotMatch(html, /classList\.(?:add|remove)\('show'\)/);
});
test('admin dialogs have mobile-safe form and action styling', () => {
  assert.match(css, /\.admin-dialog-form/);
  assert.match(css, /max-height: min\(88dvh, 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
