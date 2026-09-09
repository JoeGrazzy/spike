import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !f.endsWith('.pre-rebuild.html')).sort();
const cssPath = path.join(ROOT, 'css', 'spike-mobile-safe-area.css');

assert.equal(pages.length, 22, 'Expected 22 production HTML pages');

const css = fs.readFileSync(cssPath, 'utf8');

test('mobile safe-area stylesheet has dynamic top/bottom inset contract', () => {
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /--spike-safe-top/);
  assert.match(css, /--spike-safe-bottom/);
  assert.match(css, /padding-top:var\(--spike-header-safe-gap\)!important/);
});

test('every production page loads exactly one mobile safe-area stylesheet', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.equal(html.match(/css\/spike-mobile-safe-area\.css/g)?.length ?? 0, 1, page);
  }
});

test('every production page opts into viewport-fit cover', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
    assert.ok(m, `${page}: viewport meta missing`);
    assert.match(m[0], /viewport-fit\s*=\s*cover/i, `${page}: viewport-fit=cover missing`);
  }
});

test('profile secondary tabs follow the safe-area-aware header', () => {
  assert.match(css, /\.spike-profile-page \.tabs,\s*\n\.spike-view-user-page \.tabs/);
  assert.match(css, /top:calc\(54px \+ var\(--spike-header-safe-gap\)\)!important/);
});

test('room chat stacked chrome follows the safe-area-aware header', () => {
  assert.match(css, /\.chatRoomHeader\{top:calc\(54px \+ var\(--spike-header-safe-gap\)\)!important\}/);
  assert.match(css, /\.channelBar\{top:calc\(113px \+ var\(--spike-header-safe-gap\)\)!important\}/);
});
