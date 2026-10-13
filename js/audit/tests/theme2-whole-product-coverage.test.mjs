import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('css/spike-theme-final-authority-v1.css', 'utf8');
const palette = await readFile('css/spike-three-theme-authority.css', 'utf8');

test('Theme 2 final authority covers page shells, headers, sticky navigation and menu layers', () => {
  assert.match(css, /Pass 14 — Theme 2 whole-product coverage/);
  for (const selector of ['.page-content', '.app-shell', '.chat-header', '.sidebar', '.bottom-nav', '.dropdown-menu', '.context-menu', '.spike-menu-sheet']) {
    assert.ok(css.includes(selector), `Theme 2 needs explicit coverage for ${selector}`);
  }
  assert.match(css, /html\[data-spike-style="2"\].*\.dropdown-item/s);
});

test('Theme 2 styles text fields, search/composer controls, native options and keyboard focus', () => {
  for (const selector of ['textarea', 'select', 'input[type="checkbox"]', 'input[type="radio"]', 'option', ':focus-visible', '::placeholder']) {
    assert.ok(css.includes(selector), `Theme 2 is missing ${selector} styling`);
  }
  assert.match(css, /html\[data-spike-style="2"\].*caret-color:var\(--spike-accent\)/s);
});

test('Theme 2 coverage remains scoped and does not replace Theme 1 or Theme 3 palettes', () => {
  const section = css.split('Pass 14 — Theme 2 whole-product coverage')[1];
  assert.ok(section, 'Pass 14 theme coverage section must exist');
  assert.doesNotMatch(section, /html\[data-spike-style="[13]"\]/);
  assert.match(palette, /html\[data-spike-style="1"\]\{color-scheme:dark/);
  assert.match(palette, /html\[data-spike-style="3"\]\{color-scheme:dark/);
});

test('Theme 2 overrides remaining fixed-purple typing and fixed-dark premium toast surfaces', () => {
  const section = css.split('Pass 16 — close remaining Theme 2 hard-coded status/typing surface leaks.')[1];
  assert.ok(section, 'Pass 16 Theme 2 leak-fix section must exist');
  for (const selector of ['.typingLine', '[data-typing-preview]', '.spike-premium-toast', '.spn-title', '.spn-message', '.spn-icon']) {
    assert.ok(section.includes(selector), `Theme 2 must normalize ${selector}`);
  }
  assert.match(section, /html\[data-spike-style=\"2\"\]/);
  assert.doesNotMatch(section, /html\[data-spike-style=\"[13]\"\]/);
});
